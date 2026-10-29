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
  idsDeBiblioteca, ORIGINAL, planoOriginal, palabraDelGuion, paleta, parseReel, pedidoIA, refCompacta, SYSTEM_ESPEJO, pedidoEspejo, parseEspejo, espejoReel,
} from "../../supabase/functions/_shared/reelPlan";
export type { Analisis, ClipInfo, Forma, Look, ModoReel, Oferta, Pedido, Plano, Reel, RefPlano } from "../../supabase/functions/_shared/reelPlan";
import type { Forma, Plano, Reel, RefPlano } from "../../supabase/functions/_shared/reelPlan";
import { planoOriginal } from "../../supabase/functions/_shared/reelPlan";

export const GENERATOR_ID = "reel-ia-escenas";
export const PRICE_PLAN = 15;
/** Precios en créditos (iguales a credit_prices): imagen de escena, animación de 5 s, cada look tuyo. */
export const PRICES = { imagen: 6, animar: 89, look: 9 } as const;
/** Kling AI Avatar (fal): lo que cuesta cada segundo de ti hablando (costo real; solo para el panel de Jean). */
export const HABLA_USD_SEG = 0.0562;
/** Lo que pagamos de verdad a los proveedores (credit_prices.real_cost_usd y ai_usage, 28-oct-2026). */
export const USD_REAL = { imagen: 0.0081, look: 0.0115, animar: 0.118, vozCaracter: 0.00022 } as const;
/** Desde aquí se pregunta antes de producir (Jean, 28-oct-2026: «antes de entregar reels muy costosos, avisa»). */
export const AVISO_USD = 2;
/** Créditos de la voz y de cada toma hablando (credit_prices reel_voz_* y reel_lip_*; decisión de Jean, 26-oct-2026). Solo
 *  para MOSTRAR el estimado: quien cobra es el servidor (reel-ia). */
export const PRECIO_VOZ = { hasta600: 99, hasta1200: 198 } as const;
export const PRECIO_HABLA = { hasta6: 255, hasta12: 510 } as const;
export const creditosVoz = (guion: string) => (guion.trim() ? (guion.trim().length <= 600 ? PRECIO_VOZ.hasta600 : PRECIO_VOZ.hasta1200) : 0);
export const creditosToma = (seg: number) => (seg <= 0 ? 0 : seg <= 6 ? PRECIO_HABLA.hasta6 : PRECIO_HABLA.hasta12);
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
export function costo(r: Reel, t: Tiempo[] | null, looksPropios: Set<number> = new Set()) {
  // Las imágenes del original (Espejo) salen del video: no se crean con IA ni cuestan.
  const visuales = new Set(r.planos.filter(p => p.visual && planoOriginal(p.visual) < 0).map(p => p.visual));
  const animadas = new Set(r.planos.filter(p => p.animar).map(p => p.visual));
  // Un look con tu foto subida no se crea con IA: no cuesta.
  const looks = new Set(r.planos.filter(p => seVe(p.forma) && !looksPropios.has(p.look)).map(p => p.look));
  const creditos = visuales.size * PRICES.imagen + animadas.size * PRICES.animar + looks.size * PRICES.look;
  const trs = t ? tramos(r.planos, t) : [];
  const seg = trs.reduce((a, tr) => a + (tr.hasta - tr.desde), 0);
  // Sin la voz todavía no hay tiempos: ~1,5 s por plano en el que sales, en tomas de hasta TRAMO_MAX segundos.
  const estimado = r.planos.filter(p => seVe(p.forma)).length * 1.5;
  const tomas = t ? trs.map(tr => Math.min(12, tr.hasta - tr.desde)) : Array.from({ length: Math.ceil(estimado / TRAMO_MAX) }, (_, i) => Math.min(TRAMO_MAX, estimado - i * TRAMO_MAX));
  const creditosHabla = tomas.reduce((a, x) => a + creditosToma(x), 0);
  const voz = creditosVoz(r.guion ?? "");
  return {
    creditos, imagenes: visuales.size, animadas: animadas.size, looks: looks.size, segHabla: seg, usdHabla: Math.round(seg * HABLA_USD_SEG * 100) / 100,
    tomas: tomas.length, creditosHabla, creditosVoz: voz, total: creditos + creditosHabla + voz,
    // Costo real aproximado (con la voz si ya existe; si no, estimado). El lip-sync es casi todo.
    usdReal: Math.round(((t ? seg : tomas.reduce((a, x) => a + x, 0)) * HABLA_USD_SEG + visuales.size * USD_REAL.imagen + animadas.size * USD_REAL.animar
      + looks.size * USD_REAL.look + (r.guion ?? "").length * USD_REAL.vozCaracter) * 100) / 100,
  };
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

// ---------- Tus imágenes por plano (28-oct-2026, Jean: «que yo también pueda subir imágenes para que no las tengas
// que crear… y solo le tengamos que dar lipsync») ----------
/** Lo que pide cada plano de la referencia: una foto tuya (para hablar) o una imagen de apoyo. */
export const huecoDe = (f: Forma): "tu" | "imagen" => (seVe(f) ? "tu" : "imagen");

/** La ficha de la imagen que necesita un plano, para pedirla a otra IA o buscarla y subirla. */
export function fichaHueco(p: RefPlano, i: number) {
  const tu = huecoDe(p.forma) === "tu";
  return {
    plano: i + 1,
    momento: `${p.t0.toFixed(1).replace(".", ",")} s a ${p.t1.toFixed(1).replace(".", ",")} s`,
    tipo: tu ? "tu foto (aquí hablas a cámara)" : "imagen de apoyo",
    escena: p.descripcion,
    camara: p.camara,
    formato: "vertical 9:16 (1080 × 1920)",
    requisitos: tu
      ? ["tu cara completa, de frente o de tres cuartos", "boca cerrada o en reposo", "buena luz en la cara", "sin texto ni logos encima"]
      : ["sin texto ni logos de otras marcas", "que se entienda en 1 o 2 segundos"],
  };
}

/** El look k usa tu foto si alguno de sus planos reemplaza un plano de la referencia al que le subiste una. */
export function refDeLook(r: Reel, k: number, tieneFoto: (ref: number) => boolean): number {
  const p = r.planos.find(x => x.look === k && seVe(x.forma) && x.ref >= 0 && tieneFoto(x.ref));
  return p ? p.ref : -1;
}

/** Pone tus imágenes subidas en los planos que reemplazan esos planos de la referencia (no se crean con IA). */
export function conTusImagenes(r: Reel, clipDeRef: (ref: number) => string | null): Reel {
  let cambio = false;
  const planos = r.planos.map(p => {
    const id = p.ref >= 0 && p.forma !== "tu" ? clipDeRef(p.ref) : null;
    if (!id || (p.clip === id && !p.visual)) return p;
    cambio = true;
    return { ...p, clip: id, visual: "", animar: false };
  });
  return cambio ? { ...r, planos } : r;
}

/** Créditos que cuesta producir un plano (si necesita imagen o animación). */
export const costoPlano = (p: Plano) => (p.visual && planoOriginal(p.visual) < 0 ? PRICES.imagen + (p.animar ? PRICES.animar : 0) : 0);
