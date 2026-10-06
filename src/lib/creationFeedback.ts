import { supabase } from "@/integrations/supabase/client";

/**
 * Aprender de lo que crean los usuarios (06-oct-2026): "¿Te sirvió?" en las herramientas y la biblioteca
 * de carruseles clonados. El admin lo ve en Admin → Aprendizaje para encontrar muros y patrones.
 */
export type Feedback = { id: string; user_id: string; tool: string; ref_id: string | null; helpful: boolean; note: string | null; context: Record<string, unknown>; created_at: string };
export type CloneRow = {
  id: string; user_id: string; url: string; owner: string | null; likes: number | null; comments: number | null; mode: "tema" | "producto";
  hook: string | null; summary: string | null; why: string | null;
  analysis: { laminas?: { n?: number; composicion?: string; idea?: string }[]; necesitas?: string[]; adn?: { parte?: string; importa?: boolean }[] };
  result: { portadas?: string[]; tipos?: string[]; palabra?: string };
  created_at: string;
};

export const TOOL_LABEL: Record<string, string> = { "carrusel-clon": "Carrusel · modelar", carrusel: "Carrusel", resultados: "Resultados (pregunta semanal)" };

const ANSWER: Record<string, string> = {
  publicado: "Sí, ya lo publicó", todavia: "Todavía no lo publica", "no-sirvio": "No le sirvió",
  tiempo: "No tuvo tiempo", "no-convencio": "No le convenció cómo quedó", "ya-publicado": "Ya lo publicó",
  "ninguna-todavia": "Nadie le escribió todavía",
};
/** Una línea legible para el admin: qué se preguntó y qué contestó. */
export function feedbackLine(f: Feedback): string {
  if (f.tool !== "resultados") return f.note || (f.helpful ? "Le sirvió." : "No le sirvió (sin nota).");
  const c = f.context ?? {};
  const pieza = typeof c.pieza === "string" ? `«${c.pieza}»: ` : "";
  const r = String(c.respuesta ?? "");
  const nums = r === "anotado" ? `${Number(c.leads) || 0} personas le escribieron, ${Number(c.ventas) || 0} ventas` : ANSWER[r] ?? r;
  return `${pieza}${nums}${f.note ? ` — "${f.note}"` : ""}`;
}

// Tablas nuevas, aún fuera de los tipos generados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (t: string) => any };

/** Guarda o actualiza la opinión (una por herramienta y resultado). Devuelve el id para poder cambiarla. */
export async function sendFeedback(o: { id?: string | null; uid: string; tool: string; refId?: string | null; helpful: boolean; note?: string; context?: Record<string, unknown> }): Promise<string | null> {
  const note = (o.note ?? "").trim().slice(0, 500) || null;
  if (o.id) {
    const { error } = await db.from("creation_feedback").update({ helpful: o.helpful, note }).eq("id", o.id);
    return error ? null : o.id;
  }
  const { data, error } = await db.from("creation_feedback")
    .insert({ user_id: o.uid, tool: o.tool, ref_id: o.refId ?? null, helpful: o.helpful, note, context: o.context ?? {} })
    .select("id").single();
  return error ? null : (data?.id as string) ?? null;
}

export async function listFeedback(onlyNo: boolean, limit = 100): Promise<Feedback[]> {
  let q = db.from("creation_feedback").select("id,user_id,tool,ref_id,helpful,note,context,created_at").order("created_at", { ascending: false }).limit(limit);
  if (onlyNo) q = q.eq("helpful", false);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Feedback[];
}

export async function listClones(order: "likes" | "recent", limit = 60): Promise<CloneRow[]> {
  const { data, error } = await db.from("carousel_clones")
    .select("id,user_id,url,owner,likes,comments,mode,hook,summary,why,analysis,result,created_at")
    .order(order === "likes" ? "likes" : "created_at", { ascending: false, nullsFirst: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as CloneRow[];
}

/** Resumen para el admin: cuántos sí / no por herramienta. */
export function feedbackSummary(rows: Feedback[]): { tool: string; yes: number; no: number }[] {
  const m = new Map<string, { yes: number; no: number }>();
  for (const r of rows) {
    const x = m.get(r.tool) ?? { yes: 0, no: 0 };
    if (r.helpful) x.yes++; else x.no++;
    m.set(r.tool, x);
  }
  return [...m].map(([tool, v]) => ({ tool, ...v })).sort((a, b) => b.no - a.no || b.yes - a.yes);
}
