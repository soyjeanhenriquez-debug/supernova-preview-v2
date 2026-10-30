// Editar antes de programar (30-oct-2026, Jean: «cargo un video en crudo y la app me pregunta si solo lo programo,
// le quito los silencios, le pongo subtítulos o lo edita completo con IA con B-roll»). Aquí va lo que no depende
// de la pantalla: las 4 opciones, el encargo que pasa de Para publicar a «Sube tu video» y dos cálculos puros:
// los silencios desde el audio (sin IA, gratis) y los momentos donde entra un B-roll.
import { aRecortado, type Tramo } from "@/lib/recorte";
import type { Subtitle } from "@/lib/burnSubtitles";

export type ModoEdicion = "programar" | "silencios" | "subtitulos" | "ia";

/** Las opciones que ve la persona al subir un video. `cr` = créditos fijos (las imágenes de B-roll se suman aparte). */
export const OPCIONES_EDICION: { id: ModoEdicion; titulo: string; linea: string; precio: string }[] = [
  { id: "programar", titulo: "Ya está editado: solo programarlo", linea: "Va tal cual a su casilla.", precio: "Gratis" },
  { id: "silencios", titulo: "Quitarle los silencios", linea: "Corta las pausas largas. Sin subtítulos.", precio: "Gratis" },
  { id: "subtitulos", titulo: "Subtítulos (y quitar silencios si quieres)", linea: "Eliges el estilo y lo ves antes de guardarlo.", precio: "20 créditos" },
  { id: "ia", titulo: "Edición completa con IA", linea: "Subtítulos, sin silencios y B-roll con imágenes de IA.", precio: "20 créditos + 6 por imagen" },
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
