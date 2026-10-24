import { useMemo } from "react";
import { AbsoluteFill, Img, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio, Video } from "@remotion/media";
import { screenAt, screensOf, showWord, type Word } from "@/lib/subtitleStyles";
import { FONTS } from "@/remotion/SubsVideo";
import type { Tipo } from "@/lib/reelIa";

/**
 * Plantilla del reel "Esta IA hace X" (24-oct-2026, ingeniería inversa de un reel de Jean): un plano por idea al ritmo
 * de la voz, título en caja negra arriba los primeros segundos (*asteriscos* en azul), subtítulos de 1 a 3 palabras en
 * MAYÚSCULAS a 3/4 de la altura, capturas reales flotando sobre un fondo desenfocado, la herramienta en un celular,
 * destellos cálidos al cambiar de bloque y "COMENTA «PALABRA»" arriba al final. Se ve en el Player y se descarga
 * armada en el navegador (renderMediaOnWeb). Todo el texto en SVG (ver SubsVideo).
 */
export type ReelScene = {
  t0: number; t1: number; tipo: Tipo; img: string | null; clip: string | null; shot: string | null;
  /** La captura es vertical (versión celular de la app): va en un celular grande que entra, baja y se acerca. */
  shotV?: boolean;
  /** La captura es una grabación de pantalla (video): se ve funcionando dentro del celular. */
  shotVideo?: boolean;
};
export type ReelProps = {
  scenes: ReelScene[];
  audio: string | null;
  words: Word[];
  titulo: string;
  palabra: string;
  /** Imagen para el fondo desenfocado de las capturas (el presentador o la primera imagen). */
  fondo: string | null;
};

const BLUE = "#38BDF8";
const TITLE_SEG = 3.6;
const CIERRE_SEG = 3.6;
const FLASH = 9; // cuadros del destello

export function ToolReel(p: ReelProps) {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const end = durationInFrames / fps;
  const screens = useMemo(() => screensOf(p.words, 3), [p.words]);
  const sc = screenAt(screens, t);
  // Destello al pasar entre bloques: del presentador a lo demás, o al primer "resultado".
  // Destello al cambiar de bloque: presentador ↔ lo demás, app ↔ B-roll, y al primer "resultado".
  const grupo = (t: Tipo) => (t === "presentador" ? 0 : t === "captura" || t === "marca" ? 1 : 2);
  const flashes = useMemo(() => p.scenes.filter((s, i) => i > 0 && (
    grupo(s.tipo) !== grupo(p.scenes[i - 1].tipo) || (s.tipo === "resultado" && p.scenes[i - 1].tipo !== "resultado")
  )).map(s => Math.round(s.t0 * fps)), [p.scenes, fps]);
  const flash = flashes.find(f => frame >= f - 3 && frame < f + FLASH);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0B0B0D" }}>
      {p.scenes.map((s, i) => {
        const from = Math.round(s.t0 * fps);
        const dur = Math.max(1, Math.round(s.t1 * fps) - from);
        return (
          <Sequence key={i} from={from} durationInFrames={dur} premountFor={fps}>
            <Plano s={s} i={i} dur={dur} fondo={p.fondo} W={W} H={H} />
          </Sequence>
        );
      })}
      {p.audio && <Audio src={p.audio} />}
      {flash !== undefined && <Destello frame={frame - flash} />}
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", left: 0, top: 0 }}>
        {p.titulo.trim() && t < TITLE_SEG && <CajaTitulo text={p.titulo} W={W} H={H} />}
        {p.palabra.trim() && t > end - CIERRE_SEG && <CajaTitulo text={`COMENTA *«${p.palabra.trim().toLocaleUpperCase("es")}»*`} W={W} H={H} />}
        {sc && <Sub key={sc.t0} line={sc.words.map(w => showWord(w.w, true)).join(" ")} W={W} H={H} startFrame={Math.round(sc.t0 * fps)} />}
      </svg>
    </AbsoluteFill>
  );
}

const cover = { width: "100%", height: "100%", objectFit: "cover" as const };

/** Un plano según su tipo. */
function Plano({ s, i, dur, fondo, W, H }: { s: ReelScene; i: number; dur: number; fondo: string | null; W: number; H: number }) {
  const frame = useCurrentFrame();
  const k = interpolate(frame, [0, dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (s.tipo === "captura" || s.tipo === "marca") {
    const shot = s.shot ?? s.img;
    const pop = interpolate(frame, [0, 6], [0.9, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const drift = 1 + 0.035 * k;
    const bg = fondo ?? s.img;
    return (
      <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#111114" }}>
        {bg && <Img src={bg} style={{ ...cover, filter: "blur(28px) brightness(0.55)", transform: "scale(1.15)" }} />}
        {shot && s.shotV ? (
          // Captura de celular (25-oct-2026, pedido de Jean: "versión celular para que se vea más fluido"): entra
          // deslizándose y la pantalla se acerca suave.
          // Proporción de la pantalla = la de la captura (≈ 390×690): no se recorta por los lados.
          <div style={{ position: "absolute", left: W * 0.2, width: W * 0.6, top: H * 0.075, height: W * 0.6 * 0.947 * 1.77 + W * 0.032,
            transform: `translateX(${interpolate(frame, [0, 7], [W * 0.12, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px) scale(${0.97 + 0.05 * k})`,
            opacity: interpolate(frame, [0, 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            borderRadius: W * 0.075, padding: W * 0.016, background: "#0E0E10", boxShadow: "0 40px 100px rgba(0,0,0,0.65), inset 0 0 0 2px #2A2A2E" }}>
            <div style={{ width: "100%", height: "100%", borderRadius: W * 0.06, overflow: "hidden", background: "#000" }}>
              {s.shotVideo
                ? <Video src={shot} muted style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
                // Captura fija: baja sola (como un scroll) si es más larga que la pantalla; si no, se acerca suave.
                : <Img src={shot} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `50% ${Math.round(easeInOut(k) * 100)}%`, transform: `scale(${1 + 0.04 * k})`, transformOrigin: "50% 0%" }} />}
            </div>
          </div>
        ) : shot && (s.tipo === "captura" ? (
          // Ventana blanca flotando con la web real (como el reel de referencia).
          <div style={{ position: "absolute", left: W * 0.05, width: W * 0.9, top: H * 0.27, transform: `scale(${pop * drift})`, transformOrigin: "50% 40%",
            borderRadius: W * 0.025, overflow: "hidden", background: "#FFFFFF", boxShadow: "0 30px 80px rgba(0,0,0,0.55)" }}>
            <div style={{ height: W * 0.045, background: "#F2F2F4", display: "flex", alignItems: "center", gap: W * 0.012, paddingLeft: W * 0.025 }}>
              {["#FF5F57", "#FEBC2E", "#28C840"].map(c => <span key={c} style={{ width: W * 0.016, height: W * 0.016, borderRadius: 99, background: c }} />)}
            </div>
            <Img src={shot} style={{ width: "100%", height: H * 0.34, objectFit: "cover", objectPosition: "top" }} />
          </div>
        ) : (
          // La herramienta dentro de un celular, levemente girado.
          // Alto ≈ 0,94 W: termina al 66 % de la altura, sin tapar los subtítulos (76 %).
          <div style={{ position: "absolute", left: W * 0.27, width: W * 0.46, top: H * 0.12, height: W * 0.46 * 2.05, transform: `scale(${pop * drift}) rotate(${-4 + 3 * k}deg)`,
            borderRadius: W * 0.07, padding: W * 0.018, background: "#0E0E10", boxShadow: "0 40px 90px rgba(0,0,0,0.6), inset 0 0 0 2px #2A2A2E" }}>
            <Img src={shot} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", borderRadius: W * 0.055 }} />
          </div>
        ))}
      </AbsoluteFill>
    );
  }
  if (!s.clip && !s.img) return <AbsoluteFill style={{ backgroundColor: "#111114" }} />;
  // B-roll estilo película (25-oct-2026, Jean: "fluidos, que impacten, estilo película"): entra con un barrido rápido
  // con desenfoque (whip), la cámara se mueve con fuerza y suavidad (empuje, paneo y un giro leve, con aceleración
  // de cine), y lleva color de película y viñeta. Si hay animación, la animación manda y la cámara solo acompaña.
  const dir = i % 2 === 0 ? 1 : -1;
  const whip = interpolate(frame, [0, 6], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const e = easeInOut(k);
  const move = s.clip
    ? `scale(${1.02 + 0.06 * e})`
    : `scale(${1.08 + 0.2 * e}) translateX(${dir * (2.5 - 5 * e)}%) translateY(${-1.5 * e}%) rotate(${dir * (0.8 - 1.6 * e)}deg)`;
  const media = { ...cover, transform: move, transformOrigin: "50% 45%" };
  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#000",
      transform: `translateX(${dir * whip * 18}%) scale(${1 + whip * 0.12})`, filter: whip > 0.02 ? `blur(${whip * 14}px)` : undefined }}>
      {s.clip ? <Video src={s.clip} muted loop style={media} /> : <Img src={s.img!} style={media} />}
      <CineGrade />
    </AbsoluteFill>
  );
}

/** Aceleración suave de cine (entra y sale despacio). */
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/** Color de película: sombras frías, luces cálidas y viñeta. Sin filtros (también va en Safari). */
function CineGrade() {
  return (
    <>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(10,30,60,0.28) 0%, rgba(0,0,0,0) 40%, rgba(255,140,40,0.10) 100%)", mixBlendMode: "soft-light" }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)" }} />
    </>
  );
}

/** Destello cálido de luz entre bloques. */
function Destello({ frame }: { frame: number }) {
  const o = interpolate(frame, [-3, 1, FLASH], [0, 0.85, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ background: "radial-gradient(circle at 70% 30%, #FFE3B0 0%, #FFB347 35%, rgba(255,140,40,0.0) 75%)", opacity: o, mixBlendMode: "screen" }} />;
}

/** Caja negra arriba con texto grueso; las palabras entre *asteriscos* van en azul. */
function CajaTitulo({ text, W, H }: { text: string; W: number; H: number }) {
  const tokens = text.toLocaleUpperCase("es").split(/\s+/).filter(Boolean);
  const lines: string[][] = [[]];
  for (const tk of tokens) {
    const cur = lines[lines.length - 1];
    if (cur.join(" ").replace(/\*/g, "").length + tk.length > 16 && cur.length) lines.push([tk]); else cur.push(tk);
  }
  const shown = lines.slice(0, 3);
  const longest = Math.max(...shown.map(l => l.join(" ").replace(/\*/g, "").length));
  const fs = Math.min(W * 0.085, (W * 0.78) / Math.max(1, longest * 0.5));
  const lh = fs * 1.05;
  const bw = Math.min(W * 0.92, longest * fs * 0.52 + fs * 1.1);
  const top = H * 0.06;
  let blue = false;
  return (
    <g fontFamily={FONTS.anton} fontSize={fs} textAnchor="middle">
      <rect x={(W - bw) / 2} y={top} width={bw} height={shown.length * lh + fs * 0.55} rx={fs * 0.12} fill="#000000" fillOpacity={0.9} />
      {shown.map((ln, i) => (
        <text key={i} x={W / 2} y={top + fs * 0.25 + (i + 1) * lh - fs * 0.12}>
          {ln.map((tk, j) => {
            if (tk.startsWith("*")) blue = true;
            const color = blue ? BLUE : "#FFFFFF";
            if (tk.endsWith("*")) blue = false;
            return <tspan key={j} fill={color}>{(j ? " " : "") + tk.replace(/\*/g, "")}</tspan>;
          })}
        </text>
      ))}
    </g>
  );
}

/** Subtítulo: 1 a 3 palabras, gruesas, blancas con sombra, a 3/4 de la altura, con un pop al entrar. */
function Sub({ line, W, H, startFrame }: { line: string; W: number; H: number; startFrame: number }) {
  const frame = useCurrentFrame();
  const pop = interpolate(frame - startFrame, [0, 4], [0.88, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fs = Math.min(W * 0.072, (W * 0.88) / Math.max(1, line.length * 0.6));
  const cx = W / 2, cy = H * 0.76;
  return (
    <g transform={`translate(${cx} ${cy}) scale(${pop}) translate(${-cx} ${-cy})`} fontFamily={FONTS.manrope} fontWeight={800} fontSize={fs} textAnchor="middle" strokeLinejoin="round">
      <text x={cx} y={cy + fs * 0.07} fill="#000000" fillOpacity={0.45} stroke="#000000" strokeOpacity={0.45} strokeWidth={fs * 0.22}>{line}</text>
      <text x={cx} y={cy} fill="#FFFFFF">{line}</text>
    </g>
  );
}
