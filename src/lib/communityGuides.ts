import { supabase } from "@/integrations/supabase/client";

/**
 * Enseñanzas de la comunidad (05-oct-2026, pedido de Jean): un usuario cuenta cómo usa SUPERNOVA
 * para un caso real y los demás lo leen en Aprende. Tabla community_guides (RLS + trigger):
 * todo entra "pendiente" y solo un admin la publica. Al cliente nunca se le confía el estado.
 */
export type GuideStatus = "pendiente" | "publicada" | "rechazada";
export type CommunityGuide = {
  id: string;
  user_id: string;
  author_name: string;
  title: string;
  summary: string;
  body: string;
  tools: string[];
  source_credit: string | null;
  source_url: string | null;
  status: GuideStatus;
  review_note: string | null;
  helpful_count: number;
  created_at: string;
  published_at: string | null;
};
export type GuideDraft = Pick<CommunityGuide, "title" | "summary" | "body" | "tools" | "source_credit" | "source_url">;

export const GUIDE_LIMITS = { title: [8, 120], summary: [10, 280], body: [200, 20000] } as const;

// La tabla aún no está en los tipos generados.
const db = () => supabase as any; // eslint-disable-line @typescript-eslint/no-explicit-any
const LIST_COLS = "id,user_id,author_name,title,summary,tools,source_credit,source_url,status,review_note,helpful_count,created_at,published_at";

/** Publicadas, las que más sirvieron primero (lista corta: el cuerpo se pide al abrir una). */
export async function listPublished(limit = 24): Promise<CommunityGuide[]> {
  const { data, error } = await db().from("community_guides").select(LIST_COLS)
    .eq("status", "publicada").order("helpful_count", { ascending: false }).order("published_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map((g: CommunityGuide) => ({ ...g, body: "" }));
}

export async function listMine(userId: string): Promise<CommunityGuide[]> {
  const { data, error } = await db().from("community_guides").select(`${LIST_COLS},body`)
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return data ?? [];
}

/** Para el admin: las que esperan revisión (o todas las de un estado). */
export async function listByStatus(status: GuideStatus, limit = 50): Promise<CommunityGuide[]> {
  const { data, error } = await db().from("community_guides").select(`${LIST_COLS},body`)
    .eq("status", status).order("created_at", { ascending: status === "pendiente" }).limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getBody(id: string): Promise<string> {
  const { data, error } = await db().from("community_guides").select("body").eq("id", id).maybeSingle();
  if (error) throw error;
  return data?.body ?? "";
}

const clean = (d: GuideDraft) => ({
  title: d.title.trim(), summary: d.summary.trim(), body: d.body.trim(), tools: d.tools.slice(0, 8),
  source_credit: d.source_credit?.trim() || null, source_url: d.source_url?.trim() || null,
});

export async function createGuide(d: GuideDraft, authorName: string) {
  const { error } = await db().from("community_guides").insert({ ...clean(d), author_name: authorName.slice(0, 60) || "Miembro" });
  if (error) throw error;
}

/** Editar vuelve a revisión (lo fuerza el trigger en la base). */
export async function updateGuide(id: string, d: GuideDraft) {
  const { error } = await db().from("community_guides").update(clean(d)).eq("id", id);
  if (error) throw error;
}

export async function deleteGuide(id: string) {
  const { error } = await db().from("community_guides").delete().eq("id", id);
  if (error) throw error;
}

/** Solo admin (la base rechaza el cambio de estado a cualquier otro). */
export async function reviewGuide(id: string, status: GuideStatus, note: string | null) {
  const { error } = await db().from("community_guides").update({ status, review_note: note?.trim() || null }).eq("id", id);
  if (error) throw error;
}

export async function myVotes(userId: string): Promise<Set<string>> {
  const { data } = await db().from("community_guide_votes").select("guide_id").eq("user_id", userId).limit(500);
  return new Set((data ?? []).map((v: { guide_id: string }) => v.guide_id));
}

export async function setVote(guideId: string, on: boolean) {
  const q = db().from("community_guide_votes");
  const { error } = on ? await q.insert({ guide_id: guideId }) : await q.delete().eq("guide_id", guideId);
  if (error) throw error;
}

/**
 * Frases que el manual no deja publicar (promesas de ingresos, plazos, garantías inventadas).
 * Es solo un aviso para quien escribe: la decisión final la toma el admin al revisar.
 */
const RISKY: [RegExp, string][] = [
  [/\bgana(r|s|rás)?\s+(us\$|\$|\d)/i, "una cifra de ganancia"],
  [/\b(garantizad[oa]s?|seguro que ganas|sin riesgo)\b/i, "una garantía de resultados"],
  [/\ben\s+\d+\s+(d[ií]as|semanas|horas)\b.*\b(gana|ingres|vend)/i, "un plazo para ganar dinero"],
  [/\b(dinero f[aá]cil|hazte rico|libertad financiera en)\b/i, "una promesa de dinero fácil"],
  [/\b\d[\d.,]*\s*(d[oó]lares|usd|al mes|mensuales)\b/i, "una cifra de ingresos"],
];
export function riskyPhrases(text: string): string[] {
  return [...new Set(RISKY.filter(([re]) => re.test(text)).map(([, label]) => label))];
}

export const BODY_TEMPLATE = `## Qué vas a lograr
(En una o dos frases: qué hace la persona al terminar.)

## Paso 1 —
(Qué hacer y con qué herramienta de SUPERNOVA.)

## Paso 2 —

## Paso 3 —

## Errores que yo cometí
-

## Cómo saber si funciona
(Qué mirar en tus números: vistas, comentarios, clics. Sin prometer resultados.)
`;
