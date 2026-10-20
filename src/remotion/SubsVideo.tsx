import { useMemo } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio, Video } from "@remotion/media";
import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { loadFont as loadManrope } from "@remotion/google-fonts/Manrope";
import { loadFont as loadSerif } from "@remotion/google-fonts/InstrumentSerif";
import { loadFont as loadScript } from "@remotion/google-fonts/KaushanScript";
import { screenAt, screensOf, showWord, SUB_STYLE_BY_ID, zoomAt, zoomCuts, type StyleId, type Word } from "@/lib/subtitleStyles";

/**
 * Plantilla de "Sube tu video" (16-oct-2026, Fase A): tu video + subtítulos con estilo + portada +
 * título arriba + cierre "COMENTA PALABRA". La misma plantilla se ve en la vista previa (Player) y se
 * descarga armada en el navegador (renderMediaOnWeb); después también en la nube (Remotion Lambda).
 * Todo el texto va en SVG: el renderizador del navegador solo pone las letras web dentro de SVG, y el
 * brillo se hace con trazos en capas (los filtros no funcionan en Safari).
 */
const anton = loadAnton("normal", { weights: ["400"], subsets: ["latin", "latin-ext"] }).fontFamily;
const manrope = loadManrope("normal", { weights: ["600", "700", "800"], subsets: ["latin", "latin-ext"] }).fontFamily;
const serif = loadSerif("italic", { weights: ["400"], subsets: ["latin", "latin-ext"] }).fontFamily;
const script = loadScript("normal", { weights: ["400"], subsets: ["latin", "latin-ext"] }).fontFamily;
/** Las mismas letras, para que las tarjetas de estilos se vean como el video. */
export const FONTS = { anton, manrope, serif, script };

const AMBER = "#F5A83B";
const YELLOW = "#F5C518";
const BLUE = "#38BDF8";

export type SubsProps = {
  src: string;
  /** Voz procesada (voz grave): si viene, el video va sin sonido y suena esta. */
  audioSrc: string | null;
  words: Word[];
  style: StyleId;
  portada: { titulo: string; acento: string } | null;
  /** En los estilos que lo permiten (Impacto, Conversación). Las palabras entre *asteriscos* van en azul. */
  tituloArriba: string;
  /** Acercamiento alterno entre frases, como cortes en salto (estilo Conversación). */
  zoom?: boolean;
  /** Palabra clave del cierre ("COMENTA «PALABRA»"), en los últimos 2,5 s. Vacío = sin cierre. */
  cierre: string;
};

/** Tamaño de letra que entra en el ancho: base, pero más chico si la línea es larga. */
const fit = (base: number, text: string, maxW: number, k: number) => Math.min(base, maxW / Math.max(1, text.length * k));

/** Aparece con un pequeño "pop" en los primeros cuadros. */
function usePop(startFrame: number) {
  const frame = useCurrentFrame();
  return interpolate(frame - startFrame, [0, 4], [0.86, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
}

export function SubsVideo(p: SubsProps) {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const def = SUB_STYLE_BY_ID[p.style];
  const screens = useMemo(() => screensOf(p.words, def.porPantalla), [p.words, def.porPantalla]);
  const end = durationInFrames / fps;
  const showPortada = !!p.portada?.titulo.trim() && t < 1.3;
  const showCierre = !!p.cierre.trim() && t > end - 2.5;
  const sc = showPortada || showCierre ? null : screenAt(screens, t);
  const cuts = useMemo(() => (p.zoom ? zoomCuts(p.words) : [0]), [p.zoom, p.words]);
  const scale = zoomAt(cuts, t);
  const titulo = def.tituloArriba && p.tituloArriba.trim() && !showPortada;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {/* El acercamiento va hacia la cara (arriba del centro); los textos no se mueven. */}
      <Video src={p.src} muted={!!p.audioSrc} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})`, transformOrigin: "50% 35%" }} />
      {p.audioSrc && <Audio src={p.audioSrc} />}
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", left: 0, top: 0 }}>
        {titulo && (p.style === "impacto" ? <TopTitle text={p.tituloArriba} W={W} H={H} /> : <SoftTitle text={p.tituloArriba} W={W} H={H} />)}
        {sc && <Caption key={sc.t0} words={sc.words} t={t} style={p.style} W={W} H={H} startFrame={Math.round(sc.t0 * fps)} />}
        {showPortada && p.portada && <Portada titulo={p.portada.titulo} acento={p.portada.acento} W={W} H={H} />}
        {showCierre && <Cierre palabra={p.cierre} W={W} H={H} startFrame={Math.round((end - 2.5) * fps)} />}
      </svg>
    </AbsoluteFill>
  );
}

function Caption({ words, t, style, W, H, startFrame }: { words: Word[]; t: number; style: StyleId; W: number; H: number; startFrame: number }) {
  const def = SUB_STYLE_BY_ID[style];
  const pop = usePop(startFrame);
  const shown = words.map(w => showWord(w.w, def.mayusculas, def.comas));
  const line = shown.join(" ");
  const cx = W / 2, cy = H * def.y, maxW = W * 0.88;
  const g = (s: number) => `translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})`;

  if (style === "impacto") {
    const fs = fit(W * 0.1, line, maxW, 0.47);
    return (
      <g transform={g(pop)} fontFamily={anton} fontSize={fs} textAnchor="middle">
        <text x={cx + fs * 0.05} y={cy + fs * 0.06} fill="#000000" fillOpacity={0.55}>{line}</text>
        <text x={cx} y={cy} fill="#FFFFFF" stroke="#000000" strokeWidth={fs * 0.09} paintOrder="stroke" strokeLinejoin="round">{line}</text>
      </g>
    );
  }
  if (style === "conversacion") return <ConvText line={line} cx={cx} cy={cy} W={W} />;
  if (style === "minimal") {
    const fs = fit(W * 0.05, line, maxW, 0.55);
    return (
      <g fontFamily={manrope} fontWeight={600} fontSize={fs} textAnchor="middle">
        <text x={cx + 1.5} y={cy + 2} fill="#000000" fillOpacity={0.4}>{line}</text>
        <text x={cx} y={cy} fill="#FFFFFF">{line}</text>
      </g>
    );
  }
  if (style === "brillo") {
    const fs = fit(W * 0.095, line, maxW, 0.42);
    return (
      <g transform={g(pop)} fontFamily={serif} fontStyle="italic" fontSize={fs} textAnchor="middle" strokeLinejoin="round">
        <text x={cx} y={cy} fill="none" stroke="#FFFFFF" strokeOpacity={0.12} strokeWidth={fs * 0.34}>{line}</text>
        <text x={cx} y={cy} fill="none" stroke="#FFFFFF" strokeOpacity={0.22} strokeWidth={fs * 0.16}>{line}</text>
        <text x={cx + fs * 0.03} y={cy + fs * 0.04} fill="#000000" fillOpacity={0.35}>{line}</text>
        <text x={cx} y={cy} fill="#FFFFFF">{line}</text>
      </g>
    );
  }
  if (style === "caja") {
    const fs = fit(W * 0.06, line, maxW - W * 0.06, 0.58);
    const bw = Math.min(W * 0.94, line.length * fs * 0.56 + fs * 0.9);
    return (
      <g fontFamily={manrope} fontWeight={800} fontSize={fs} textAnchor="middle">
        <rect x={cx - bw / 2} y={cy - fs * 1.02} width={bw} height={fs * 1.42} rx={fs * 0.24} fill="#000000" fillOpacity={0.74} />
        <text x={cx} y={cy} fill="#FFFFFF">{line}</text>
      </g>
    );
  }
  // resaltado y clásico: Manrope gruesa con borde negro; en "resaltado" la palabra que se dice va en ámbar.
  const fs = fit(W * 0.064, line, maxW, 0.6);
  return (
    <g fontFamily={manrope} fontWeight={800} fontSize={fs} textAnchor="middle">
      <text x={cx} y={cy} stroke="#000000" strokeWidth={fs * 0.1} paintOrder="stroke" strokeLinejoin="round" fill="#FFFFFF">
        {words.map((w, i) => (
          <tspan key={i} fill={style === "resaltado" && t >= w.t0 && t < w.t1 ? AMBER : "#FFFFFF"}>{(i ? " " : "") + shown[i]}</tspan>
        ))}
      </text>
    </g>
  );
}

/**
 * Subtítulo del estilo Conversación (reel de referencia de Jean): chico, seminegrito, sin borde; una
 * sombra suave lo despega del fondo. También lo usa Mi historia animada (StoryVideo).
 */
export function ConvText({ line, cx, cy, W, size = 0.046 }: { line: string; cx: number; cy: number; W: number; size?: number }) {
  const fs = fit(W * size, line, W * 0.88, 0.55);
  return (
    <g fontFamily={manrope} fontWeight={700} fontSize={fs} textAnchor="middle">
      <text x={cx} y={cy + fs * 0.06} fill="#000000" fillOpacity={0.18} stroke="#000000" strokeOpacity={0.18} strokeWidth={fs * 0.22} strokeLinejoin="round">{line}</text>
      <text x={cx + fs * 0.03} y={cy + fs * 0.05} fill="#000000" fillOpacity={0.45}>{line}</text>
      <text x={cx} y={cy} fill="#FFFFFF">{line}</text>
    </g>
  );
}

/** Título fijo arriba (Impacto), en caja negra; las palabras entre *asteriscos* van en azul. */
function TopTitle({ text, W, H }: { text: string; W: number; H: number }) {
  const tokens = text.toLocaleUpperCase("es").split(/\s+/).filter(Boolean);
  const lines: string[][] = [[]];
  for (const tk of tokens) {
    const cur = lines[lines.length - 1];
    if (cur.join(" ").replace(/\*/g, "").length + tk.length > 18 && cur.length) lines.push([tk]); else cur.push(tk);
  }
  const shown = lines.slice(0, 3);
  const fs = W * 0.072;
  let blue = false;
  return (
    <g fontFamily={anton} fontSize={fs} textAnchor="middle">
      {shown.map((ln, i) => {
        const plain = ln.join(" ").replace(/\*/g, "");
        const bw = Math.min(W * 0.94, plain.length * fs * 0.5 + fs * 0.6);
        const y = H * 0.1 + i * fs * 1.12;
        return (
          <g key={i}>
            <rect x={W / 2 - bw / 2} y={y - fs * 0.92} width={bw} height={fs * 1.14} fill="#000000" />
            <text x={W / 2} y={y}>
              {ln.map((tk, j) => {
                const starts = tk.startsWith("*"), ends = tk.endsWith("*");
                if (starts) blue = true;
                const color = blue ? BLUE : "#FFFFFF";
                if (ends) blue = false;
                return <tspan key={j} fill={color}>{(j ? " " : "") + tk.replace(/\*/g, "")}</tspan>;
              })}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Título arriba de Conversación: blanco grueso con sombra suave, sin caja; *asteriscos* en azul. */
export function SoftTitle({ text, W, H }: { text: string; W: number; H: number }) {
  const tokens = text.split(/\s+/).filter(Boolean);
  const lines: string[][] = [[]];
  for (const tk of tokens) {
    const cur = lines[lines.length - 1];
    if (cur.join(" ").replace(/\*/g, "").length + tk.length > 24 && cur.length) lines.push([tk]); else cur.push(tk);
  }
  const shown = lines.slice(0, 3);
  const longest = Math.max(...shown.map(ln => ln.join(" ").replace(/\*/g, "").length));
  const fs = fit(W * 0.066, "x".repeat(longest), W * 0.9, 0.58);
  let blue = false;
  return (
    <g fontFamily={manrope} fontWeight={800} fontSize={fs} textAnchor="middle" strokeLinejoin="round">
      {shown.map((ln, i) => {
        const y = H * 0.1 + i * fs * 1.18;
        const plain = ln.join(" ").replace(/\*/g, "");
        return (
          <g key={i}>
            <text x={W / 2} y={y + fs * 0.06} fill="#000000" fillOpacity={0.3} stroke="#000000" strokeOpacity={0.3} strokeWidth={fs * 0.24}>{plain}</text>
            <text x={W / 2} y={y}>
              {ln.map((tk, j) => {
                const starts = tk.startsWith("*"), ends = tk.endsWith("*");
                if (starts) blue = true;
                const color = blue ? BLUE : "#FFFFFF";
                if (ends) blue = false;
                return <tspan key={j} fill={color}>{(j ? " " : "") + tk.replace(/\*/g, "")}</tspan>;
              })}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Portada del primer segundo: título grueso + una palabra a mano en amarillo, cruzada encima. */
function Portada({ titulo, acento, W, H }: { titulo: string; acento: string; W: number; H: number }) {
  const pop = usePop(0);
  const t = titulo.toLocaleUpperCase("es").trim();
  const fs = fit(W * 0.17, t, W * 0.9, 0.47);
  const cx = W / 2, cy = H * 0.5;
  const as = fit(W * 0.14, acento, W * 0.8, 0.5);
  return (
    <g transform={`translate(${cx} ${cy}) scale(${pop}) translate(${-cx} ${-cy})`} textAnchor="middle">
      <text x={cx} y={cy} fontFamily={anton} fontSize={fs} fill="#FFFFFF" stroke="#000000" strokeOpacity={0.35} strokeWidth={fs * 0.05} paintOrder="stroke">{t}</text>
      {acento.trim() && (
        <text x={cx + W * 0.08} y={cy + as * 0.75} fontFamily={script} fontSize={as} fill={YELLOW} stroke="#000000" strokeOpacity={0.3} strokeWidth={as * 0.04} paintOrder="stroke"
          transform={`rotate(-8 ${cx + W * 0.08} ${cy + as * 0.75})`}>{acento.trim()}</text>
      )}
    </g>
  );
}

/** Cierre: "COMENTA" y la palabra clave grande en ámbar. */
function Cierre({ palabra, W, H, startFrame }: { palabra: string; W: number; H: number; startFrame: number }) {
  const pop = usePop(startFrame);
  const word = `«${palabra.toLocaleUpperCase("es").trim()}»`;
  const fs = W * 0.085, ws = fit(W * 0.15, word, W * 0.9, 0.5);
  const cx = W / 2, cy = H * 0.5;
  return (
    <g transform={`translate(${cx} ${cy}) scale(${pop}) translate(${-cx} ${-cy})`} fontFamily={anton} textAnchor="middle" stroke="#000000" strokeWidth={fs * 0.08} paintOrder="stroke">
      <text x={cx} y={cy - fs * 0.4} fontSize={fs} fill="#FFFFFF">COMENTA</text>
      <text x={cx} y={cy + ws * 0.85} fontSize={ws} fill={AMBER}>{word}</text>
    </g>
  );
}
