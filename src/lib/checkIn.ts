/**
 * Pregunta de resultados (06-oct-2026, Jean: "no agobiar; feedback real, de vez en cuando, con preguntas
 * personalizadas sobre lo que han usado"). Como mucho UNA pregunta cada 7 días, en el Inicio, sobre algo
 * concreto que la persona hizo, y nunca dos veces sobre lo mismo. Orden de prioridad:
 *  1) "resultado": una pieza publicada hace 3+ días sin leads anotados → ¿cuántos te escribieron?
 *     (la respuesta se anota en su tracker: es su dato real, no una encuesta).
 *  2) "clon": un carrusel clonado hace 2+ días → ¿lo publicaste?
 *  3) "frenado": una pieza creada hace 4+ días sin publicar en ninguna red → ¿qué te frenó?
 * Funciones puras: el componente trae los datos y guarda la respuesta.
 */
export const CHECKIN_EVERY_DAYS = 7;
const DAY = 86_400_000;

export type CheckInItem = { id: string; title: string | null; topic: string | null; kind: string | null; keyword: string | null; channels: Record<string, { done?: boolean }> | null; leads: number | null; sales: number | null; created_at: string };
export type CheckInClone = { id: string; hook: string | null; summary: string | null; created_at: string };
export type CheckIn =
  | { type: "resultado"; refId: string; question: string; title: string; keyword: string | null }
  | { type: "clon"; refId: string; question: string; title: string }
  | { type: "frenado"; refId: string; question: string; title: string };

const KIND_NAME: Record<string, string> = { carrusel: "carrusel", corto: "video corto", largo: "video de YouTube", texto: "post" };
const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const daysAgo = (iso: string, now: number) => Math.floor((now - new Date(iso).getTime()) / DAY);
const published = (ch: CheckInItem["channels"]) => Object.values(ch ?? {}).some(c => c?.done);

export function pickCheckIn(o: { items: CheckInItem[]; clones: CheckInClone[]; asked: Set<string>; lastAskedAt: string | null; now?: number }): CheckIn | null {
  const now = o.now ?? Date.now();
  if (o.lastAskedAt && now - new Date(o.lastAskedAt).getTime() < CHECKIN_EVERY_DAYS * DAY) return null;
  const fresh = <T extends { id: string }>(x: T) => !o.asked.has(x.id);
  const name = (it: CheckInItem) => short((it.title || it.topic || "tu pieza").replace(/\*/g, ""));

  const res = o.items.filter(fresh).find(it => published(it.channels) && !(it.leads ?? 0) && !(it.sales ?? 0) && daysAgo(it.created_at, now) >= 3);
  if (res) {
    const kw = res.keyword?.trim() || null;
    return { type: "resultado", refId: res.id, title: name(res), keyword: kw,
      question: `Tu ${KIND_NAME[res.kind ?? ""] ?? "publicación"} «${name(res)}» ya está publicado. ¿Cuántas personas te escribieron${kw ? ` o comentaron ${kw}` : ""}?` };
  }
  const clone = o.clones.filter(fresh).find(c => daysAgo(c.created_at, now) >= 2);
  if (clone) {
    const t = short((clone.hook || clone.summary || "un carrusel viral").replace(/\*/g, ""));
    const d = daysAgo(clone.created_at, now);
    return { type: "clon", refId: clone.id, title: t, question: `Hace ${d} días clonaste «${t}». ¿Lo publicaste?` };
  }
  const stuck = o.items.filter(fresh).find(it => !published(it.channels) && daysAgo(it.created_at, now) >= 4);
  if (stuck) return { type: "frenado", refId: stuck.id, title: name(stuck), question: `«${name(stuck)}» sigue sin publicar. ¿Qué te frenó?` };
  return null;
}

/** Opciones de respuesta para "clon" y "frenado" (la de "resultado" es un número). `helpful` = ¿la app le sirvió? */
export const CHECKIN_OPTIONS: Record<"clon" | "frenado", { id: string; label: string; helpful: boolean; askNote?: boolean }[]> = {
  clon: [
    { id: "publicado", label: "Sí, ya está publicado", helpful: true },
    { id: "todavia", label: "Todavía no", helpful: true },
    { id: "no-sirvio", label: "No me sirvió", helpful: false, askNote: true },
  ],
  frenado: [
    { id: "tiempo", label: "No tuve tiempo", helpful: true },
    { id: "no-convencio", label: "No me convenció cómo quedó", helpful: false, askNote: true },
    { id: "ya-publicado", label: "Ya lo publiqué", helpful: true },
  ],
};
