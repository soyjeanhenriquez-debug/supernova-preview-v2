// Editar antes de programar (30-oct-2026, Jean: «cargo un video en crudo y la app me pregunta si solo lo programo,
// le quito los silencios, le pongo subtítulos o lo edita completo con IA con B-roll»). Aquí va lo que no depende
// de la pantalla: las 4 opciones, el encargo que pasa de Para publicar a «Sube tu video» y dos cálculos puros:
// los silencios desde el audio (sin IA, gratis) y los momentos donde entra un B-roll.
import { aRecortado, type Tramo } from "@/lib/recorte";
import type { Subtitle } from "@/lib/burnSubtitles";

import type { ModoEditar } from "@/lib/agenteEditor";
import type { RDPlano, RDProps, RDTramo } from "@/remotion/ReelDinamico";
import type { Word } from "@/lib/subtitleStyles";

/** Lo que se elige al subir un video: programarlo tal cual, ponerle subtítulos o editarlo (simple, con B-roll o con plantilla). */
export type ModoEdicion = "programar" | "subtitulos" | ModoEditar;

/** Las 3 puertas al subir un video. «Editar» abre sus 3 formas (EDITAR_OPCIONES). */
export const OPCIONES_EDICION: { id: "programar" | "subtitulos" | "editar"; titulo: string; linea: string; precio: string }[] = [
  { id: "programar", titulo: "Ya está editado: solo programarlo", linea: "Va tal cual a su casilla.", precio: "Gratis" },
  { id: "subtitulos", titulo: "Subtítulos", linea: "Eliges entre 7 estilos y lo ves antes de guardarlo.", precio: "20 créditos" },
  { id: "editar", titulo: "Editarlo", linea: "Simple, con B-roll o con una plantilla.", precio: "Desde gratis" },
];
export const EDITAR_OPCIONES: { id: ModoEditar; titulo: string; linea: string; precio: string }[] = [
  { id: "simple", titulo: "Edición simple", linea: "Sin silencios y con acercamientos entre frases.", precio: "Gratis" },
  { id: "broll", titulo: "Con B-roll", linea: "Subtítulos, sin silencios e imágenes de IA que ilustran lo que dices.", precio: "20 créditos + 6 por imagen" },
  { id: "plantilla", titulo: "Con plantilla", linea: "Reel dinámico, Explicador, Set + fichas, Desfile de casos, Lista, Íconos o Urgencia.", precio: "20 créditos" },
];

/** Lo que Para publicar le deja a «Sube tu video»: el video, la pieza de la casilla y lo que se pidió. */
export type Encargo = { file: File; itemId: string; modo: Exclude<ModoEdicion, "programar">; caption: string };
let pendiente: Encargo | null = null;
/** Deja el video listo para el editor (misma pestaña: el video no sale de tu navegador). */
export function dejarEncargo(e: Encargo) { pendiente = e; }
/** El editor lo recoge una sola vez. */
export function tomarEncargo(): Encargo | null { const e = pendiente; pendiente = null; return e; }

/** Margen que se deja antes y después de cada tramo con voz. */
export const MARGEN_AUDIO = 0.15;
/** Una pausa más corta que esto se queda (es respiración, no silencio). */
export const PAUSA_AUDIO = 0.45;
const VENTANA = 0.02; // 20 ms

/**
 * Los tramos con voz de un audio mono, sin IA. El umbral se adapta a cada grabación: entre el ruido de fondo
 * (percentil 10) y la voz (percentil 90). Devuelve [] si no hay voz que se distinga.
 */
export function tramosPorAudio(muestras: Float32Array, sr: number): Tramo[] {
  const paso = Math.max(1, Math.round(sr * VENTANA));
  const n = Math.floor(muestras.length / paso);
  if (n < 5) return [];
  const rms = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = i * paso; k < (i + 1) * paso; k++) s += muestras[k] * muestras[k];
    rms[i] = Math.sqrt(s / paso);
  }
  const orden = Array.from(rms).sort((a, b) => a - b);
  const piso = orden[Math.floor(n * 0.1)], voz = orden[Math.floor(n * 0.9)];
  if (voz < 0.004 || voz < piso * 2) return [];
  const umbral = Math.max(0.004, piso + (voz - piso) * 0.12);
  const dur = muestras.length / sr;
  const out: Tramo[] = [];
  let ini = -1;
  for (let i = 0; i <= n; i++) {
    const habla = i < n && rms[i] >= umbral;
    if (habla && ini < 0) ini = i;
    if (!habla && ini >= 0 && (i - ini) * VENTANA < 0.15) ini = -1; // un chasquido suelto no es una frase
    if (!habla && ini >= 0) {
      const a = Math.max(0, ini * VENTANA - MARGEN_AUDIO), b = Math.min(dur, i * VENTANA + MARGEN_AUDIO);
      const last = out[out.length - 1];
      if (last && a - last.b <= PAUSA_AUDIO) last.b = b; else out.push({ a, b });
      ini = -1;
    }
  }
  return out.map(t => ({ a: Math.round(t.a * 100) / 100, b: Math.round(t.b * 100) / 100 }));
}

/** El audio del video en mono a 16 kHz, para buscar los silencios en el navegador. */
export async function audioMono(file: Blob, sr = 16_000): Promise<Float32Array> {
  const Ctx = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Ctx || typeof OfflineAudioContext === "undefined") throw new Error("Tu navegador no puede leer el audio. Prueba con Chrome o Safari actualizados.");
  const ctx = new Ctx();
  let dec: AudioBuffer;
  try { dec = await ctx.decodeAudioData(await file.arrayBuffer()); }
  catch { throw new Error("No pudimos leer el audio de ese video. Prueba con un MP4 o MOV."); }
  finally { void ctx.close(); }
  const off = new OfflineAudioContext(1, Math.ceil(dec.duration * sr), sr);
  const src = off.createBufferSource();
  src.buffer = dec; src.connect(off.destination); src.start();
  return (await off.startRendering()).getChannelData(0);
}

export type MomentoBroll = { t: number; dur: number; texto: string };

/**
 * Dónde entra un B-roll: uno cada ~7 s, nunca en los primeros 3 s (la cara engancha) ni en los últimos 3 s (el
 * cierre), sobre la frase de ese momento. Tiempos en el video final (ya sin silencios si hay tramos). Máximo 6.
 */
export function momentosBroll(subs: Subtitle[], durFinal: number, ts: Tramo[] = [], max = 6): MomentoBroll[] {
  const bloques = subs.flatMap(s => {
    const t = ts.length ? aRecortado(s.desde, ts) : s.desde;
    return t === null || !s.texto.trim() ? [] : [{ t, texto: s.texto.trim(), clave: !!s.clave }];
  });
  const out: MomentoBroll[] = [];
  let siguiente = 3;
  for (const b of bloques) {
    if (out.length >= max) break;
    if (b.t < siguiente || b.t > durFinal - 3 - 1.8) continue;
    out.push({ t: Math.round(b.t * 10) / 10, dur: 1.8, texto: b.texto });
    siguiente = b.t + 7;
  }
  return out;
}

/** La descripción para la imagen de un B-roll (≤ 600 caracteres, lo que acepta el servidor). */
export function visualBroll(m: MomentoBroll, tema: string): string {
  return (`Imagen de apoyo (B-roll) para un reel vertical. En ese momento la persona dice: «${m.texto}». `
    + (tema ? `El video trata de: ${tema.slice(0, 160)}. ` : "")
    + "Muestra una escena real y concreta que ilustre esa frase, fotográfica y con buena luz. Sin texto, letras ni logotipos.").slice(0, 600);
}

/**
 * La plantilla Reel dinámico con TU video (30-oct-2026): un plano cada ~2 s (corte en salto con acercamiento), los
 * B-roll a pantalla completa mientras sigue tu voz, y sin los silencios (cada tramo arranca en su segundo del video).
 * `ts` = tramos que se quedan del original (vacío = el video entero); `words` y `brolls` en tiempo del video final.
 */
export function reelDinamicoConTuVideo(o: { src: string; dur: number; ts: Tramo[]; words: Word[]; brolls: { t: number; dur: number; src: string }[]; palabra: string }): { props: RDProps; segundos: number } {
  const partes = o.ts.length ? o.ts : [{ a: 0, b: o.dur }];
  const tramos: RDTramo[] = [];
  let off = 0;
  for (const x of partes) {
    tramos.push({ desde: off, hasta: off + (x.b - x.a), clip: o.src, img: null, inicio: x.a, sonido: true });
    off += x.b - x.a;
  }
  const total = off;
  const cortes = new Set<number>([0, total]);
  for (const tr of tramos) {
    cortes.add(tr.desde);
    const n = Math.max(1, Math.round((tr.hasta - tr.desde) / 2));
    for (let k = 1; k < n; k++) cortes.add(tr.desde + ((tr.hasta - tr.desde) * k) / n);
  }
  for (const b of o.brolls) { cortes.add(Math.max(0, b.t)); cortes.add(Math.min(total, b.t + b.dur)); }
  const ordenados = [...cortes].map(x => Math.round(x * 100) / 100).sort((a, b) => a - b).filter((x, i, l) => i === 0 || x - l[i - 1] > 0.05);
  const planos: RDPlano[] = [];
  for (let i = 0; i + 1 < ordenados.length; i++) {
    const t0 = ordenados[i], t1 = ordenados[i + 1];
    const tramo = Math.max(0, tramos.findIndex(tr => t0 >= tr.desde - 0.01 && t0 < tr.hasta));
    const b = o.brolls.find(x => t0 >= x.t - 0.01 && t0 < x.t + x.dur);
    planos.push(b ? { t0, t1, forma: "broll", tramo, top: { url: b.src, video: false, vertical: true }, enfasis: "" }
      : { t0, t1, forma: "tu", tramo, top: null, enfasis: "" });
  }
  return {
    props: { planos, tramos, audio: null, words: o.words, palabra: o.palabra, acento: "#F5A83B", fondo: "#0B0B0D", sfx: true },
    segundos: total,
  };
}
