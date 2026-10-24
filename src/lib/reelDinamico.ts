/**
 * Reel dinámico (24-oct-2026, pedido de Jean tras ver el reel v2 y una segunda referencia): se pide en una
 * conversación ("un reel de 40 s de…", o el guion tal cual) y la IA arma el guion, los looks del presentador y
 * planos de ~1,5 s con el formato que mejor cuenta cada frase (tú, pantalla dividida, la app o B-roll).
 * Lógica pura (sin red ni DOM). Pruebas: reelDinamico.test.ts. Pantalla: src/components/reelia/ReelIA.tsx.
 *
 * Lo que corrige del v2 (palabras de Jean): clips que no eran de lo que se habla, CTA final sin contundencia,
 * voz lenta, cortes poco profesionales y título encima de la cara.
 */
import type { Word } from "@/lib/subtitleStyles";

export {
  DATOS_SUPERNOVA, MAX_ANIMADAS, MAX_LOOKS, MAX_PLANOS, MODO_NOMBRE, MODO_REGLAS, PALETAS, SYSTEM, cleanAnalisis, descDeNombre,
  idsDeBiblioteca, palabraDelGuion, paleta, parseReel, pedidoIA, refCompacta,
} from "../../supabase/functions/_shared/reelPlan";
export type { Analisis, ClipInfo, Forma, Look, ModoReel, Oferta, Pedido, Plano, Reel, RefPlano } from "../../supabase/functions/_shared/reelPlan";
import type { Forma, Plano, Reel } from "../../supabase/functions/_shared/reelPlan";

export const GENERATOR_ID = "reel-ia-escenas";
export const PRICE_PLAN = 15;
/** Precios en créditos (iguales a credit_prices): imagen de escena, animación de 5 s, cada look tuyo. */
export const PRICES = { imagen: 6, animar: 89, look: 9 } as const;
/** Kling AI Avatar (fal): lo que cuesta cada segundo de ti hablando. Lo paga tu cuenta de fal, no créditos. */
export const HABLA_USD_SEG = 0.0562;
/** Un tramo tuyo hablando no pasa de esto (el servidor acepta hasta 12 s de audio por video). */
export const TRAMO_MAX = 11;
const TRAMO_MIN = 2;
export const FORMAS: Record<Forma, string> = { tu: "Tú", dividida: "Dividida", app: "Tu app", broll: "B-roll" };

/** Velocidad de tu voz en ElevenLabs (Jean: "la voz es muy lenta"). */
export const VELOCIDADES = [
  { v: 1.0, label: "Normal" }, { v: 1.1, label: "Rápida" }, { v: 1.18, label: "Muy rápida" },
] as const;

const contar = (t: string) => t.split(/\s+/).filter(Boolean).length;

export type Tiempo = { t0: number; t1: number };

/** Tiempos de cada plano: las palabras dichas se reparten en orden según cuántas tiene cada texto. */
export function tiempos(planos: Pick<Plano, "texto">[], words: Word[], total: number): Tiempo[] {
  const n = planos.length;
  if (!n) return [];
  const pesos = planos.map(e => Math.max(1, contar(e.texto)));
  const suma = pesos.reduce((a, x) => a + x, 0);
  const starts: number[] = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    if (i === 0) starts.push(0);
    else if (!words.length) starts.push((total * acc) / suma);
    else starts.push(words[Math.min(words.length - 1, Math.round((words.length * acc) / suma))].t0);
    acc += pesos[i];
  }
  return starts.map((t0, i) => ({ t0, t1: i + 1 < n ? Math.max(t0 + 0.3, starts[i + 1]) : Math.max(t0 + 0.3, total) }));
}

export const seVe = (f: Forma) => f === "tu" || f === "dividida";

export type Tramo = { look: number; desde: number; hasta: number; planos: number[] };

/**
 * Tramos tuyos hablando: planos seguidos con el mismo look forman UN video con labios (el audio de ese trozo).
 * Un B-roll o la app en medio no corta el tramo si después vuelve el mismo look (los labios siguen debajo).
 * Cada tramo dura de 2 a 11 s; los largos se parten en el borde de un plano.
 */
export function tramos(planos: Pick<Plano, "forma" | "look">[], t: Tiempo[]): Tramo[] {
  const out: Tramo[] = [];
  let cur: Tramo | null = null;
  planos.forEach((p, i) => {
    if (!seVe(p.forma)) { if (cur) cur.planos.push(i); return; }
    const cabe = cur && cur.look === p.look && t[i].t1 - cur.desde <= TRAMO_MAX;
    if (cur && cabe) { cur.planos.push(i); cur.hasta = t[i].t1; return; }
    if (cur) out.push(cur);
    cur = { look: p.look, desde: t[i].t0, hasta: t[i].t1, planos: [i] };
  });
  if (cur) out.push(cur);
  // Los planos sin ti al final de un tramo (antes de otro look) no son parte de él.
  for (const tr of out) {
    while (tr.planos.length > 1 && !seVe(planos[tr.planos[tr.planos.length - 1]].forma)) tr.planos.pop();
    tr.hasta = t[tr.planos[tr.planos.length - 1]].t1;
  }
  return out;
}

/** Trozo de audio que se manda para un tramo: mínimo 2 s (con menos, el generador falla). */
export const audioTramo = (tr: Tramo, total: number) => ({ desde: tr.desde, hasta: Math.min(total, Math.max(tr.hasta, tr.desde + TRAMO_MIN)) });

/** Créditos de las piezas que cobra el servidor y segundos tuyos hablando (los paga fal). */
export function costo(r: Reel, t: Tiempo[] | null) {
  const visuales = new Set(r.planos.filter(p => p.visual).map(p => p.visual));
  const animadas = new Set(r.planos.filter(p => p.animar).map(p => p.visual));
  const looks = new Set(r.planos.filter(p => seVe(p.forma)).map(p => p.look));
  const creditos = visuales.size * PRICES.imagen + animadas.size * PRICES.animar + looks.size * PRICES.look;
  const seg = t ? tramos(r.planos, t).reduce((a, tr) => a + (tr.hasta - tr.desde), 0) : 0;
  return { creditos, imagenes: visuales.size, animadas: animadas.size, looks: looks.size, segHabla: seg, usdHabla: Math.round(seg * HABLA_USD_SEG * 100) / 100 };
}

/** Resumen corto para la conversación. */
export function resumen(r: Reel): string {
  const n = (f: Forma) => r.planos.filter(p => p.forma === f).length;
  const clips = new Set(r.planos.map(p => p.clip).filter(Boolean)).size;
  const tuyos = r.planos.filter(p => seVe(p.forma)).length;
  return `${r.planos.length} planos · apareces en ${tuyos} con ${new Set(r.planos.filter(p => seVe(p.forma)).map(p => p.look)).size} looks · ${n("dividida")} en pantalla dividida · ${clips} clips de tu app · ${n("broll")} B-roll.`;
}

export type Pantalla = { t0: number; t1: number; texto: string; enfasis: boolean };

/**
 * Subtítulos: de 1 a 3 palabras (máximo ~14 letras), cortados en las pausas y en la puntuación (Jean: "VERSIÓN
 * EL PRODUCTO" mezclaba dos frases). Se resalta la pantalla que lleva una palabra de 'enfasis'.
 */
export function pantallas(words: Word[], enfasis: string[]): Pantalla[] {
  const norm = (s: string) => s.toLocaleLowerCase("es").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]/gu, "");
  const fuertes = new Set(enfasis.flatMap(e => e.split(/\s+/)).map(norm).filter(w => w.length > 2));
  const out: Pantalla[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (!cur.length) return;
    const texto = cur.map(w => w.w.replace(/[.,;:¿?¡!…"«»]+/g, "")).join(" ").toLocaleUpperCase("es");
    out.push({ t0: cur[0].t0, t1: cur[cur.length - 1].t1, texto, enfasis: cur.some(w => fuertes.has(norm(w.w))) });
    cur = [];
  };
  words.forEach((w, i) => {
    const prev = words[i - 1];
    if (cur.length && prev && w.t0 - prev.t1 > 0.35) flush();
    const largo = cur.map(x => x.w).join(" ").length + w.w.length + 1;
    if (cur.length && (largo > 15 || cur.length >= 3)) flush();
    cur.push(w);
    if (/[.,;:?!…]$/.test(w.w)) flush();
  });
  flush();
  // Que cada pantalla dure hasta la siguiente (sin parpadeos entre palabras).
  for (let i = 0; i + 1 < out.length; i++) if (out[i + 1].t0 - out[i].t1 < 0.35) out[i].t1 = out[i + 1].t0;
  return out;
}

/** Texto para publicar: el título sin asteriscos y la llamada. */
export function textoPublicacion(r: Reel): string {
  const t = r.titulo.replace(/\*/g, "");
  const cap = t ? t.charAt(0) + t.slice(1).toLocaleLowerCase("es") : "";
  return [cap && `${cap}.`, r.palabra && `Comenta «${r.palabra}» y te lo mando.`].filter(Boolean).join("\n\n");
}

/** Huella corta de un texto (para reusar lo ya pagado cuando el reel cambia). */
export function huella(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// ---------------- Storyboard: cambios que NO tocan el guion ni la voz ----------------

/**
 * Cambia la duración de un plano moviendo una palabra de su borde con el siguiente (dir +1: el plano i se queda
 * con la primera palabra del siguiente; -1: le pasa su última). El guion y la voz no cambian.
 */
export function moverCorte(planos: Plano[], i: number, dir: 1 | -1): Plano[] {
  const a = planos[i], b = planos[i + 1];
  if (!a || !b) return planos;
  const wa = a.texto.split(/\s+/), wb = b.texto.split(/\s+/);
  if (dir === 1 && wb.length > 1) { wa.push(wb.shift()!); }
  else if (dir === -1 && wa.length > 1) { wb.unshift(wa.pop()!); }
  else return planos;
  const out = [...planos];
  out[i] = { ...a, texto: wa.join(" ") }; out[i + 1] = { ...b, texto: wb.join(" ") };
  return out;
}

/** Quita el plano i: su texto pasa al anterior (o al siguiente si es el primero). El guion no cambia. */
export function quitarPlano(planos: Plano[], i: number): Plano[] {
  if (planos.length <= 3 || !planos[i]) return planos;
  const out = [...planos];
  if (i > 0) out[i - 1] = { ...out[i - 1], texto: `${out[i - 1].texto} ${out[i].texto}` };
  else out[1] = { ...out[1], texto: `${out[0].texto} ${out[1].texto}`, forma: "tu", clip: "", visual: "", animar: false };
  out.splice(i, 1);
  return out;
}

/**
 * Reordenar arrastrando: se intercambia lo que SE VE (forma, look, clip, imagen) entre dos planos; el texto de cada
 * plano se queda en su lugar, así el orden del guion y la sincronía de la voz no cambian.
 */
export function intercambiar(planos: Plano[], i: number, j: number): Plano[] {
  if (i === j || !planos[i] || !planos[j]) return planos;
  const vis = (p: Plano) => ({ forma: p.forma, look: p.look, clip: p.clip, visual: p.visual, animar: p.animar, ref: p.ref });
  const out = [...planos];
  out[i] = { ...planos[i], ...vis(planos[j]) }; out[j] = { ...planos[j], ...vis(planos[i]) };
  return out;
}

/** Créditos que cuesta producir un plano (si necesita imagen o animación). */
export const costoPlano = (p: Plano) => (p.visual ? PRICES.imagen + (p.animar ? PRICES.animar : 0) : 0);
