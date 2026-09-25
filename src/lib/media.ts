import { supabase } from "@/integrations/supabase/client";

/**
 * Catálogo de modelos de video e imagen (tabla media_models + precios de credit_prices).
 * Aquí solo se MUESTRA: qué modelo se puede usar, con qué plan y a qué precio lo decide el
 * servidor (supabase/functions/_shared/media.ts). Nada NSFW: filtros de fal encendidos.
 */
export type MediaKind = "video" | "image" | "avatar";
export type MediaModel = {
  id: string; kind: MediaKind; grp: string; label: string; description: string;
  tier: "pro" | "comunidad"; action: string; seconds: number | null;
  status: "admin" | "live" | "soon" | "off"; recommended: boolean; sort: number;
  cost: number | null;
};

/** Plan Comunidad Creativos 10X en Whop (mismo id que en el servidor). */
export const COMUNIDAD_PLANS = ["plan_oRht08inLOu39"];

let cache: Promise<MediaModel[]> | null = null;

export function loadMediaModels(): Promise<MediaModel[]> {
  if (cache) return cache;
  cache = (async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const [{ data: models, error }, { data: prices }] = await Promise.all([
      db.from("media_models").select("id,kind,grp,label,description,tier,action,seconds,status,recommended,sort").order("sort"),
      db.from("credit_prices").select("action,cost").or("action.like.vid_%,action.like.img_%,action.like.avatar_%"),
    ]);
    if (error) { cache = null; return []; }
    const cost = new Map(((prices ?? []) as { action: string; cost: number }[]).map(p => [p.action, p.cost]));
    return ((models ?? []) as Omit<MediaModel, "cost">[]).map(m => ({ ...m, cost: cost.get(m.action) ?? null }));
  })();
  return cache;
}

/** ¿Tiene la Comunidad activa? (solo para pintar candados; el servidor vuelve a comprobarlo). */
export async function hasComunidad(userId: string, email?: string | null): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const q = () => db.from("subscriptions").select("plan_id").in("plan_id", COMUNIDAD_PLANS).in("status", ["active", "trialing", "past_due"]).limit(1);
  const [a, b] = await Promise.all([q().eq("user_id", userId), email ? q().eq("email", email.toLowerCase()) : Promise.resolve({ data: [] })]);
  return (a.data ?? []).length > 0 || (b.data ?? []).length > 0;
}

export type Access = "ok" | "comunidad" | "soon" | "admin_only";

/** Qué ve esta persona en cada modelo. */
export function accessOf(m: MediaModel, opts: { isAdmin: boolean; comunidad: boolean }): Access {
  if (m.status === "soon") return "soon";
  if (m.status === "admin" && !opts.isAdmin) return "admin_only";
  if (m.tier === "comunidad" && !opts.comunidad && !opts.isAdmin) return "comunidad";
  return "ok";
}
