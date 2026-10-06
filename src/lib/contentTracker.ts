import { supabase } from "@/integrations/supabase/client";

/**
 * Tracker de publicaciones (06-oct-2026): de la creación a la ejecución. Cada pieza (content_items)
 * se publica en varias redes con un check y su enlace; guarda la palabra clave del remate y los
 * leads y ventas que la persona anota (solo datos reales). La meta semanal vive en content_goals.
 */
export type Kind = "corto" | "largo" | "texto" | "carrusel";
export type Network = "reels" | "tiktok" | "shorts" | "youtube" | "threads" | "x" | "instagram";
export type Channel = { done?: boolean; url?: string; at?: string };
export type Channels = Partial<Record<Network, Channel>>;
export type Goals = Record<Kind, number>;

export const KINDS: Record<Kind, { label: string; line: string; networks: Network[] }> = {
  corto: { label: "Video corto", line: "Reels · TikTok · Shorts", networks: ["reels", "tiktok", "shorts"] },
  largo: { label: "Video largo", line: "YouTube", networks: ["youtube"] },
  texto: { label: "Texto", line: "Threads · X", networks: ["threads", "x"] },
  carrusel: { label: "Carrusel", line: "Instagram", networks: ["instagram"] },
};
export const NETWORK_LABEL: Record<Network, string> = {
  reels: "Reels", tiktok: "TikTok", shorts: "Shorts", youtube: "YouTube", threads: "Threads", x: "X", instagram: "Instagram",
};
/** Redes que se pueden sumar a cada tipo (además de las de fábrica). */
export const EXTRA_NETWORKS: Record<Kind, Network[]> = {
  corto: ["instagram"], largo: [], texto: ["instagram"], carrusel: ["tiktok", "threads"],
};
export const DEFAULT_GOALS: Goals = { corto: 5, largo: 1, texto: 7, carrusel: 2 };
const ALL: Network[] = ["reels", "tiktok", "shorts", "youtube", "threads", "x", "instagram"];

/** Plataforma vieja (calendario de antes / ideas) → tipo de pieza. */
export function kindFromPlatform(p: string | null | undefined): Kind {
  if (p === "youtube") return "largo";
  if (p === "blog" || p === "whatsapp" || p === "threads" || p === "x") return "texto";
  if (p === "instagram") return "carrusel";
  return "corto";
}

/** Redes de fábrica de un tipo, sin publicar todavía. */
export const freshChannels = (k: Kind): Channels => Object.fromEntries(KINDS[k].networks.map(n => [n, { done: false }])) as Channels;

/** Limpia lo que venga de la base (claves desconocidas o enlaces raros fuera). */
export function cleanChannels(x: unknown): Channels {
  const out: Channels = {};
  if (!x || typeof x !== "object") return out;
  for (const n of ALL) {
    const c = (x as Record<string, unknown>)[n];
    if (!c || typeof c !== "object") continue;
    const v = c as Record<string, unknown>;
    const url = typeof v.url === "string" && /^https:\/\/\S{4,300}$/.test(v.url) ? v.url : undefined;
    const at = typeof v.at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.at) ? v.at : undefined;
    out[n] = { done: v.done === true, ...(url ? { url } : {}), ...(at ? { at } : {}) };
  }
  return out;
}

/** Cuántas de las redes elegidas ya tienen el check. */
export function progressOf(ch: Channels): { done: number; total: number } {
  const list = Object.values(ch);
  return { done: list.filter(c => c?.done).length, total: list.length };
}

/** Estado de la pieza según sus checks: todas publicadas = "publicado". */
export function statusFromChannels(ch: Channels, current: string): string {
  const { done, total } = progressOf(ch);
  if (total > 0 && done === total) return "publicado";
  if (current === "publicado") return "grabado";
  return current;
}

export type TrackItem = { kind: Kind | null; platform?: string | null; status: string; due: string | null; channels: Channels; leads: number; sales: number };

/**
 * Resumen de la semana: piezas publicadas por tipo contra la meta, publicaciones (checks) en total,
 * leads y ventas anotados, y qué tipo trae más leads con lo que hay (sin estimar nada).
 */
export function weekSummary(items: TrackItem[], from: string, to: string, goals: Goals) {
  const inWeek = items.filter(i => i.due && i.due >= from && i.due <= to);
  const byKind = (Object.keys(KINDS) as Kind[]).map(k => {
    const list = inWeek.filter(i => (i.kind ?? kindFromPlatform(i.platform)) === k);
    return { kind: k, published: list.filter(i => i.status === "publicado").length, planned: list.length, goal: goals[k] ?? 0 };
  });
  const posts = inWeek.reduce((n, i) => n + progressOf(i.channels).done, 0);
  const leads = inWeek.reduce((n, i) => n + (i.leads || 0), 0);
  const sales = inWeek.reduce((n, i) => n + (i.sales || 0), 0);
  // Qué tipo trae más leads, con TODO lo anotado (no solo esta semana).
  const totals = (Object.keys(KINDS) as Kind[]).map(k => ({ kind: k, leads: items.filter(i => (i.kind ?? kindFromPlatform(i.platform)) === k).reduce((n, i) => n + (i.leads || 0), 0) }));
  const best = totals.filter(t => t.leads > 0).sort((a, b) => b.leads - a.leads)[0] ?? null;
  return { byKind, posts, leads, sales, best };
}

export function cleanGoals(x: unknown): Goals {
  const g = { ...DEFAULT_GOALS };
  if (x && typeof x === "object") {
    for (const k of Object.keys(KINDS) as Kind[]) {
      const v = Number((x as Record<string, unknown>)[k]);
      if (Number.isInteger(v) && v >= 0 && v <= 50) g[k] = v;
    }
  }
  return g;
}

// La tabla y las columnas nuevas aún no están en los tipos generados de Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabase as any;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Lleva algo recién creado (un carrusel, un guion, un video) al tracker, listo para publicar hoy.
 * Devuelve true si se guardó.
 */
export async function addToTracker(o: { uid: string; productId: string; kind: Kind; title: string; keyword?: string; source: string; networks?: Network[] }): Promise<boolean> {
  const nets = o.networks?.length ? o.networks : KINDS[o.kind].networks;
  const title = o.title.replace(/\*/g, "").replace(/\s+/g, " ").trim().slice(0, 200) || "Pieza sin título";
  const { error } = await db().from("content_items").insert({
    user_id: o.uid, product_id: o.productId, topic: title, title, stage: "atraer",
    platform: nets[0], kind: o.kind, status: "grabado", due: ymd(new Date()), source: o.source.slice(0, 30),
    channels: Object.fromEntries(nets.map(n => [n, { done: false }])),
    keyword: o.keyword ? o.keyword.replace(/[^\p{L}\p{N} ]/gu, "").toLocaleUpperCase("es").slice(0, 30) : null,
  });
  return !error;
}

export async function loadGoals(uid: string, productId: string): Promise<Goals> {
  const { data } = await db().from("content_goals").select("goals").eq("user_id", uid).eq("product_id", productId).maybeSingle();
  return cleanGoals(data?.goals);
}
export async function saveGoals(uid: string, productId: string, goals: Goals): Promise<boolean> {
  const { error } = await db().from("content_goals").upsert({ user_id: uid, product_id: productId, goals: cleanGoals(goals), updated_at: new Date().toISOString() }, { onConflict: "user_id,product_id" });
  return !error;
}
