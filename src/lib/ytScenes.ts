/**
 * Producir video de YouTube (faceless): lógica pura, sin red ni DOM.
 *
 * El guion llega del Creador de YouTube con este formato:
 *   ESCENA n — [descripción visual]
 *   Narración: lo que dice la voz
 * De aquí salen las escenas, el costo (créditos), qué escenas se animan, los subtítulos y los
 * capítulos de la descripción. Los precios son los de `credit_prices` (el servidor cobra; esto
 * solo muestra el costo antes de gastar).
 */

export type Scene = {
  /** Número de escena para mostrar ("3" o "3.2" si una narración larga se dividió). */
  n: string;
  visual: string;
  narration: string;
};

/** Precios por pieza (iguales a credit_prices: yt_voice_scene, yt_scene_image, vid_mini_5). */
export const PRICES = { voice: 5, image: 6, clip: 55 } as const;
/** Una voz por escena cubre hasta ~45 s de narración. */
export const MAX_NARRATION = 700;
export const MAX_VISUAL = 600;
export const MAX_SCENES = 40;
export const MAX_NARRATION_SECONDS = 30 * 60;
/** Ritmo de voz en off en español: ~145 palabras por minuto ≈ 14,5 caracteres por segundo. */
export const CHARS_PER_SECOND = 14.5;

const HEADER = /^\s*(?:[*_#>\s]*)\s*(?:ESCENA|SCENE|SCÈNE|CENA)\s*(\d+)\s*[*_]*\s*(?:[—–\-:.)]\s*)?(.*)$/i;
const NARR = /^\s*[*_]*\s*(?:Narración|Narracion|Narration|Narração|Narracao|Voz(?: en off)?|Voice(?:over)?)\s*[*_]*\s*:\s*[*_]*\s*(.*)$/i;
const END = /^\s*[*_#]*\s*(?:TÍTULO|TITULO|TITLE|TÍTULO SUGERIDO|MINIATURA|THUMBNAIL|MINIATURE|TITRE)\s*[*_]*\s*:/i;

const clean = (s: string) => s.replace(/\s+/g, " ").replace(/^[*_\s"“]+|[*_\s"”]+$/g, "").trim();
const unbracket = (s: string) => clean(clean(s).replace(/^\[/, "").replace(/\]$/, ""));

/** Divide un texto largo en trozos de hasta `max` caracteres, cortando en fin de frase si se puede. */
export function splitText(text: string, max = MAX_NARRATION): string[] {
  const t = clean(text);
  if (t.length <= max) return t ? [t] : [];
  const sentences = t.match(/[^.!?…]+[.!?…]+["”»)]*\s*|[^.!?…]+$/g) ?? [t];
  const out: string[] = [];
  let cur = "";
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ""; };
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (s.length > max) {
      // Frase enorme sin puntos: se corta por comas o espacios.
      push();
      let rest = s;
      while (rest.length > max) {
        let cut = rest.lastIndexOf(", ", max);
        if (cut < max * 0.5) cut = rest.lastIndexOf(" ", max);
        if (cut < max * 0.3) cut = max;
        out.push(rest.slice(0, cut + (rest[cut] === "," ? 1 : 0)).trim());
        rest = rest.slice(cut + 1).trim();
      }
      cur = rest;
      continue;
    }
    if ((cur ? cur.length + 1 : 0) + s.length > max) push();
    cur = cur ? `${cur} ${s}` : s;
  }
  push();
  return out;
}

/**
 * Lee el guion por escenas. Acepta el formato del Creador y sus traducciones (SCENE / CENA / SCÈNE,
 * Narration / Narração), negritas de Markdown y narración en la misma línea o en las siguientes.
 * Las narraciones de más de 700 caracteres se dividen en sub-escenas con el mismo visual.
 */
export function parseScenes(script: string): Scene[] {
  const lines = (script ?? "").replace(/\r/g, "").split("\n");
  type Raw = { n: string; visual: string; narration: string[]; inNarr: boolean };
  const raws: Raw[] = [];
  let cur: Raw | null = null;
  for (const line of lines) {
    if (END.test(line)) { cur = null; continue; }
    const h = HEADER.exec(line);
    if (h) {
      cur = { n: h[1], visual: "", narration: [], inNarr: false };
      raws.push(cur);
      let rest = h[2] ?? "";
      // "ESCENA 1 — [visual] Narración: texto" en una sola línea.
      const inline = rest.search(/(?:Narración|Narracion|Narration|Narração)\s*:/i);
      if (inline >= 0) {
        const m = NARR.exec(rest.slice(inline));
        rest = rest.slice(0, inline);
        if (m) { cur.narration.push(m[1]); cur.inNarr = true; }
      }
      cur.visual = unbracket(rest);
      continue;
    }
    if (!cur) continue;
    const nm = NARR.exec(line);
    if (nm) { cur.inNarr = true; if (nm[1].trim()) cur.narration.push(nm[1]); continue; }
    if (!line.trim()) continue;
    if (cur.inNarr) cur.narration.push(line);
    else if (!cur.visual) cur.visual = unbracket(line);
    else if (/^\s*\[/.test(line) || cur.visual.endsWith("[")) cur.visual = clean(`${cur.visual} ${unbracket(line)}`);
    else { cur.inNarr = true; cur.narration.push(line); } // texto suelto tras el visual = narración
  }
  const out: Scene[] = [];
  for (const r of raws) {
    const narration = clean(r.narration.join(" ").replace(/^\(|\)$/g, ""));
    if (!narration) continue;
    const visual = (r.visual || narration).slice(0, MAX_VISUAL);
    const parts = splitText(narration, MAX_NARRATION);
    if (parts.length === 1) out.push({ n: r.n, visual, narration: parts[0] });
    else parts.forEach((p, i) => out.push({ n: `${r.n}.${i + 1}`, visual, narration: p }));
  }
  return out;
}

/** Segundos aproximados de narración (antes de tener la voz real). */
export const narrationSeconds = (text: string) => Math.max(1, text.length / CHARS_PER_SECOND);

/** Revisa los topes de una producción. Devuelve el motivo en español, o null si está bien. */
export function checkLimits(scenes: Scene[]): string | null {
  if (scenes.length < 2) return "Necesitas al menos 2 escenas con narración.";
  if (scenes.length > MAX_SCENES) return `Tu guion tiene ${scenes.length} escenas y el máximo es ${MAX_SCENES}. Acórtalo o divídelo en dos videos.`;
  const secs = scenes.reduce((a, s) => a + narrationSeconds(s.narration), 0);
  if (secs > MAX_NARRATION_SECONDS) return "La narración pasa de 30 minutos. Acórtala o divídela en dos videos.";
  return null;
}

/**
 * Elige qué escenas se animan: primero el gancho (la primera), el cierre (la última) y el clímax
 * (la de en medio de la segunda mitad), después repartidas de forma pareja. Devuelve índices (0…n-1).
 */
export function pickAnimated(scenes: readonly unknown[], pct: number): number[] {
  const n = scenes.length;
  const k = Math.min(n, Math.max(0, Math.round(n * Math.max(0, Math.min(100, pct)) / 100)));
  if (!k) return [];
  const picked: number[] = [];
  const add = (i: number) => { if (i >= 0 && i < n && !picked.includes(i) && picked.length < k) picked.push(i); };
  add(0);
  add(n - 1);
  add(Math.round(n * 0.7));
  for (let step = 2; picked.length < k && step <= n * 2; step *= 2) {
    for (let j = 1; j < step && picked.length < k; j += 2) add(Math.round((n - 1) * j / step));
  }
  for (let i = 0; picked.length < k && i < n; i++) add(i);
  return picked.sort((a, b) => a - b);
}

export type Cost = { voice: number; images: number; clips: number; total: number; animated: number };

/** Costo en créditos de producir el video completo. */
export function estimateCost(scenes: readonly unknown[], pctAnimated: number): Cost {
  const animated = pickAnimated(scenes, pctAnimated).length;
  const voice = scenes.length * PRICES.voice;
  const images = scenes.length * PRICES.image;
  const clips = animated * PRICES.clip;
  return { voice, images, clips, total: voice + images + clips, animated };
}

export type SubChunk = { text: string; lines: string[]; start: number; end: number };

/** Parte un texto en renglones de hasta `maxLine` caracteres sin cortar palabras. */
function wrap(text: string, maxLine: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (w.length > maxLine) {
      if (cur) { out.push(cur); cur = ""; }
      for (let i = 0; i < w.length; i += maxLine) out.push(w.slice(i, i + maxLine));
      continue;
    }
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= maxLine) cur += ` ${w}`;
    else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Subtítulos de una escena: bloques de hasta 2 renglones de 42 caracteres, con tiempos
 * proporcionales a los caracteres. Cubren todo el texto y sus tiempos suman `durationSec`.
 * No hace falta Whisper: la voz lee exactamente este texto.
 */
export function subtitleChunks(text: string, durationSec: number, maxLine = 42, maxLines = 2): SubChunk[] {
  const lines = wrap(clean(text), maxLine);
  if (!lines.length || durationSec <= 0) return [];
  const blocks: string[][] = [];
  for (let i = 0; i < lines.length; i += maxLines) blocks.push(lines.slice(i, i + maxLines));
  const weights = blocks.map(b => b.join(" ").length);
  const total = weights.reduce((a, b) => a + b, 0);
  let t = 0;
  return blocks.map((b, i) => {
    const start = t;
    const end = i === blocks.length - 1 ? durationSec : t + (durationSec * weights[i]) / total;
    t = end;
    return { text: b.join(" "), lines: b, start, end };
  });
}

/** 75 → "01:15"; 3725 → "1:02:05". */
export function timecode(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const pad = (x: number) => String(x).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`;
}

function chapterTitle(s: Scene): string {
  const first = (s.narration.match(/^[^.!?…]+/)?.[0] ?? s.narration).trim();
  const words = first.split(/\s+/).slice(0, 7).join(" ");
  const t = words.length > 48 ? `${words.slice(0, 47).trim()}…` : words;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Capítulos para la descripción de YouTube: empiezan en 00:00, entre 3 y 8 bloques (uno por minuto
 * aprox.) y cada uno de 10 s o más, como pide YouTube. Con menos de 30 s devuelve solo "00:00".
 */
export function chapters(scenes: Scene[], durations: number[]): string[] {
  if (!scenes.length) return [];
  const starts: number[] = [];
  let t = 0;
  scenes.forEach((_, i) => { starts.push(t); t += durations[i] ?? narrationSeconds(scenes[i].narration); });
  const total = t;
  if (total < 30) return [`00:00 ${chapterTitle(scenes[0])}`];
  const count = Math.min(8, Math.max(3, Math.round(total / 60)), scenes.length);
  const idx: number[] = [0];
  for (let c = 1; c < count; c++) {
    const target = (total * c) / count;
    let best = idx[idx.length - 1] + 1;
    for (let i = best; i < scenes.length; i++) if (Math.abs(starts[i] - target) < Math.abs(starts[best] - target)) best = i;
    if (best < scenes.length && starts[best] - starts[idx[idx.length - 1]] >= 10 && total - starts[best] >= 10) idx.push(best);
  }
  return idx.map(i => `${timecode(i === 0 ? 0 : starts[i])} ${chapterTitle(scenes[i])}`);
}

export const VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
export type Voice = typeof VOICES[number];
export const VOICE_LABEL: Record<Voice, string> = {
  onyx: "Grave y seria", echo: "Masculina tranquila", alloy: "Neutra", nova: "Femenina con energía",
  shimmer: "Femenina suave", fable: "Narrador de cuentos",
};

/** La IA elige la voz según el estilo o el tema (se puede cambiar). */
export function suggestVoice(style: string, topic = ""): Voice {
  const s = `${style} ${topic}`.toLowerCase();
  if (/document|historia|misterio|crimen|guerra/.test(s)) return "onyx";
  if (/curios|dato|top|ranking|sabías|sabias/.test(s)) return "nova";
  if (/animaci|infantil|cuento|niñ|mascot|perr|gat/.test(s)) return "nova";
  if (/anime/.test(s)) return "shimmer";
  if (/pintura|espiritu|zen|filosof|estoic|medita|alma|dios/.test(s)) return "shimmer";
  if (/minimal/.test(s)) return "alloy";
  if (/cinemat/.test(s)) return "echo";
  return "onyx";
}

/** Título y miniatura que el Creador deja al final del guion ("TÍTULO:" / "MINIATURA:"). */
export function scriptMeta(script: string): { title: string; thumbnail: string } {
  const pick = (re: RegExp) => clean((script.match(re)?.[1] ?? "").replace(/^["“]|["”]$/g, ""));
  return {
    title: pick(/^\s*[*_#]*\s*(?:TÍTULO|TITULO|TITLE|TITRE)\s*[*_]*\s*:\s*(.+)$/im).slice(0, 100),
    thumbnail: pick(/^\s*[*_#]*\s*(?:MINIATURA|THUMBNAIL|MINIATURE)\s*[*_]*\s*:\s*(.+)$/im).slice(0, 120),
  };
}

const STOP = new Set("a al algo como con cual cuando de del desde donde el ella en entre es esa ese eso esta este esto estos fue ha hay la las le lo los mas más me mi muy no nos o para pero por porque que qué se si sin sobre su sus te tu tus un una uno unos y ya yo vas va son ser the of and to in is it your you for on with this that how why what".split(" "));

/** Etiquetas sugeridas para YouTube a partir del título y el tema (máx. 12, sin repetir). */
export function tagsFrom(...texts: string[]): string[] {
  const words = texts.join(" ").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)
    .filter(w => w.length > 3 && !STOP.has(w) && !/^\d+$/.test(w));
  const out: string[] = [];
  for (const w of words) if (!out.includes(w)) out.push(w);
  const pairs: string[] = [];
  for (let i = 0; i + 1 < words.length && pairs.length < 4; i++) {
    const p = `${words[i]} ${words[i + 1]}`;
    if (!pairs.includes(p)) pairs.push(p);
  }
  return [...pairs, ...out].slice(0, 12);
}

/** Descripción lista para pegar en YouTube: resumen, capítulos y aviso de IA. */
export function buildDescription(opts: { title: string; topic?: string; chapters: string[]; tags: string[] }): string {
  const intro = opts.topic?.trim() || opts.title;
  const hashtags = opts.tags.slice(0, 3).map(t => `#${t.replace(/\s+/g, "")}`).join(" ");
  return [
    intro,
    "",
    opts.chapters.length > 1 ? "Capítulos:" : "",
    ...(opts.chapters.length > 1 ? opts.chapters : []),
    "",
    "Si te gustó, suscríbete para ver el próximo video.",
    "Video narrado con voz generada por IA. Imágenes creadas con IA.",
    "",
    hashtags,
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").trim();
}

/** Estilos visuales del Creador de YouTube (los mismos nombres que entiende yt-produce). */
export const YT_STYLES = ["Cinematográfico", "Animación 2D", "Anime", "Pintura", "Minimalista", "Documental"] as const;
