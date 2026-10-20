import { useMemo } from "react";
import { AbsoluteFill, Img, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio, Video } from "@remotion/media";
import { screenAt, screensOf, showWord, type Word } from "@/lib/subtitleStyles";
import { ConvText, FONTS, SoftTitle } from "@/remotion/SubsVideo";

/**
 * Plantilla de "Mi historia animada" (20-oct-2026, modelado de un reel de referencia de Jean): escenas
 * de tu personaje con cortes secos y un zoom suave (o la animación de la escena si la pagaste),
 * rótulo grande al empezar cada capítulo, pantallas negras con la frase que gira la historia y
 * subtítulos estilo Conversación. Se ve en la vista previa (Player) y se descarga armada en el
 * navegador (renderMediaOnWeb), igual que Sube tu video. Todo el texto en SVG (ver SubsVideo).
 */
export type StoryScene = {
  t0: number;
  t1: number;
  tipo: "imagen" | "negro";
  img: string | null;
  clip: string | null;
  /** En negro: la frase en pantalla. */
  texto: string;
  /** Solo en la primera escena de cada capítulo. */
  rotulo: string;
};

export type StoryProps = {
  scenes: StoryScene[];
  /** Voz IA por bloques (cada uno empieza en `at` segundos) o tu voz grabada (un solo audio en 0). */
  audios: { src: string; at: number }[];
  words: Word[];
  /** Título fijo arriba, opcional (las palabras entre *asteriscos* van en azul). */
  titulo: string;
};

const ROTULO_SEG = 2.6;

export function StoryVideo(p: StoryProps) {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  const t = frame / fps;
  const screens = useMemo(() => screensOf(p.words, 4), [p.words]);
  const now = p.scenes.find(s => t >= s.t0 && t < s.t1) ?? null;
  const sc = now?.tipo === "negro" ? null : screenAt(screens, t);
  const cap = [...p.scenes].reverse().find(s => s.rotulo && t >= s.t0 && t < s.t0 + ROTULO_SEG) ?? null;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {p.scenes.map((s, i) => {
        const from = Math.round(s.t0 * fps);
        const dur = Math.max(1, Math.round(s.t1 * fps) - from);
        return (
          <Sequence key={i} from={from} durationInFrames={dur} premountFor={fps}>
            {s.tipo === "negro" ? <Negro texto={s.texto} W={W} H={H} /> : <Escena s={s} i={i} dur={dur} />}
          </Sequence>
        );
      })}
      {p.audios.map((a, i) => (
        <Sequence key={`a${i}`} from={Math.round(a.at * fps)}>
          <Audio src={a.src} />
        </Sequence>
      ))}
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", left: 0, top: 0 }}>
        {p.titulo.trim() && <SoftTitle text={p.titulo} W={W} H={H} />}
        {sc && <ConvText line={sc.words.map(w => showWord(w.w, false, true)).join(" ")} cx={W / 2} cy={H * 0.5} W={W} />}
        {cap && <Rotulo text={cap.rotulo} W={W} H={H} startFrame={Math.round(cap.t0 * fps)} />}
      </svg>
    </AbsoluteFill>
  );
}

/** Imagen con zoom suave hacia adentro o afuera (alterna por escena), o la animación pagada. */
function Escena({ s, i, dur }: { s: StoryScene; i: number; dur: number }) {
  const frame = useCurrentFrame();
  const k = interpolate(frame, [0, dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const zoomIn = i % 2 === 0;
  const scale = zoomIn ? 1.04 + 0.1 * k : 1.14 - 0.1 * k;
  const pan = (i % 3 - 1) * 1.5 * k; // un paneo leve, distinto en cada escena
  const style = { width: "100%", height: "100%", objectFit: "cover" as const };
  if (s.clip) return <AbsoluteFill><Video src={s.clip} muted loop style={style} /></AbsoluteFill>;
  if (!s.img) return <AbsoluteFill style={{ backgroundColor: "#111114" }} />;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img src={s.img} style={{ ...style, transform: `scale(${scale}) translateX(${pan}%)`, transformOrigin: "50% 40%" }} />
    </AbsoluteFill>
  );
}

function Negro({ texto, W, H }: { texto: string; W: number; H: number }) {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        <ConvText line={texto.replace(/[.,;:]+$/, "")} cx={W / 2} cy={H * 0.5} W={W} size={0.05} />
      </svg>
    </AbsoluteFill>
  );
}

/** Rótulo del capítulo: blanco grueso, abajo, en hasta 2 líneas, con un pop corto al entrar. */
function Rotulo({ text, W, H, startFrame }: { text: string; W: number; H: number; startFrame: number }) {
  const frame = useCurrentFrame();
  const pop = interpolate(frame - startFrame, [0, 5], [0.85, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lines: string[] = [];
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const last = lines[lines.length - 1];
    if (last && (last + " " + w).length <= 20) lines[lines.length - 1] = last + " " + w;
    else lines.push(w);
  }
  const shown = lines.slice(0, 2);
  const longest = Math.max(...shown.map(l => l.length));
  const fs = Math.min(W * 0.072, (W * 0.9) / Math.max(1, longest * 0.56));
  const cx = W / 2, cy = H * 0.76;
  return (
    <g transform={`translate(${cx} ${cy}) scale(${pop}) translate(${-cx} ${-cy})`} fontFamily={FONTS.manrope} fontWeight={800} fontSize={fs} textAnchor="middle" strokeLinejoin="round">
      {shown.map((l, i) => (
        <g key={i}>
          <text x={cx} y={cy + i * fs * 1.15 + fs * 0.06} fill="#000000" fillOpacity={0.35} stroke="#000000" strokeOpacity={0.35} strokeWidth={fs * 0.24}>{l}</text>
          <text x={cx} y={cy + i * fs * 1.15} fill="#FFFFFF">{l}</text>
        </g>
      ))}
    </g>
  );
}
