import { useMemo } from "react";
import { AbsoluteFill, Img, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio, Video } from "@remotion/media";
import type { Word } from "@/lib/subtitleStyles";
import { FONTS } from "@/remotion/SubsVideo";
import { pantallas, type Forma, type Pantalla } from "@/lib/reelDinamico";

/**
 * Plantilla del reel dinámico (24-oct-2026, segunda referencia de Jean): un plano cada ~1,5 s; tú a pantalla
 * completa o abajo en pantalla dividida (con la app o una imagen arriba), la app en un celular grande o B-roll de
 * cine. Tus labios siguen sin cortes dentro de cada tramo; cada corte lleva un acercamiento en salto o una
 * transición (barrido, glitch, destello, zoom) con su efecto de sonido. Subtítulos de 1 a 3 palabras cortados en
 * las pausas, la palabra clave resaltada y el CTA final con un golpe grande. Nada tapa la cara.
 * Se ve en el Player y se descarga armada en el navegador (renderMediaOnWeb). Todo el texto en SVG.
 */
export type RDMedia = { url: string; video: boolean; vertical: boolean };
export type RDPlano = { t0: number; t1: number; forma: Forma; tramo: number; top: RDMedia | null; enfasis: string };
export type RDTramo = { desde: number; hasta: number; clip: string | null; img: string | null };
export type RDProps = {
  planos: RDPlano[];
  tramos: RDTramo[];
  audio: string | null;
  words: Word[];
  palabra: string;
  acento: string;
  fondo: string;
  sfx: boolean;
  /** Subtítulos ya editados (capa independiente); si no vienen, salen de la voz. */
  subs?: Pantalla[];
  /** Tu logo (Mi identidad): sale en el cierre. */
  logo?: string | null;
};

type Trans = "salto" | "barrido" | "glitch" | "destello" | "zoom";
const TRANS: Trans[] = ["barrido", "glitch", "zoom", "destello"];
const SFX: Record<Exclude<Trans, "salto">, string> = { barrido: "/sfx/whoosh.mp3", zoom: "/sfx/whoosh.mp3", glitch: "/sfx/glitch.mp3", destello: "/sfx/hit.mp3" };
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/** Tipo de corte al entrar a cada plano: entre planos tuyos del mismo tramo, salto (acercamiento); si no, se alterna. */
function cortes(planos: RDPlano[]): Trans[] {
  let k = 0;
  return planos.map((p, i) => {
    if (i === 0) return "salto";
    const a = planos[i - 1];
    const tuyo = (f: Forma) => f === "tu" || f === "dividida";
    if (tuyo(a.forma) && tuyo(p.forma) && a.tramo === p.tramo) return "salto";
    return TRANS[k++ % TRANS.length];
  });
}

export function ReelDinamico(p: RDProps) {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const end = durationInFrames / fps;
  const trans = useMemo(() => cortes(p.planos), [p.planos]);
  const subs = useMemo(() => p.subs ?? pantallas(p.words, p.planos.map(x => x.enfasis).filter(Boolean)), [p.subs, p.words, p.planos]);
  const idx = Math.max(0, p.planos.findIndex(x => t >= x.t0 && t < x.t1));
  const cur = p.planos[idx];
  // El CTA entra con el último plano (o en los últimos 2,6 s).
  const ctaT = Math.max(p.planos.length ? p.planos[p.planos.length - 1].t0 : end, end - 2.6);
  const enCta = !!p.palabra.trim() && t >= ctaT;
  // Transición del corte más cercano (unos cuadros antes y después).
  const cutF = cur ? Math.round(cur.t0 * fps) : 0;
  const tr = trans[idx] ?? "salto";
  const f = frame - cutF;
  const stage = transStyle(tr, f, W);
  const sub = enCta ? null : subs.find(s => t >= s.t0 && t < s.t1 + 0.05) ?? null;
  const subY = !cur ? 0.72 : cur.forma === "dividida" ? 0.5 : cur.forma === "tu" ? 0.72 : cur.forma === "app" ? 0.88 : 0.8;
  // Un "pop" por palabra clave (no más de uno cada 1,2 s).
  const pops = useMemo(() => {
    const out: number[] = [];
    for (const s of subs) if (s.enfasis && (!out.length || s.t0 - out[out.length - 1] > 1.2)) out.push(s.t0);
    return out;
  }, [subs]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0B0B0D" }}>
      <AbsoluteFill style={stage}>
        {p.tramos.map((tr, k) => {
          const from = Math.round(tr.desde * fps);
          const dur = Math.max(1, Math.round(tr.hasta * fps) - from);
          return (
            <Sequence key={`t${k}`} from={from} durationInFrames={dur} premountFor={fps}>
              <Presentador tramo={tr} k={k} planos={p.planos} desde={tr.desde} W={W} H={H} />
            </Sequence>
          );
        })}
        {p.planos.map((pl, i) => {
          if (pl.forma === "tu") return null;
          const from = Math.round(pl.t0 * fps);
          const dur = Math.max(1, Math.round(pl.t1 * fps) - from);
          return (
            <Sequence key={`p${i}`} from={from} durationInFrames={dur} premountFor={fps}>
              <Arriba pl={pl} i={i} dur={dur} acento={p.acento} fondo={p.fondo} W={W} H={H} />
            </Sequence>
          );
        })}
      </AbsoluteFill>
      {tr === "destello" && f >= -2 && f < 8 && <AbsoluteFill style={{ backgroundColor: "#FFFFFF", opacity: interpolate(f, [-2, 0, 8], [0, 0.9, 0], clamp) }} />}
      {tr === "glitch" && f >= 0 && f < 5 && <Glitch f={f} acento={p.acento} />}
      {p.audio && <Audio src={p.audio} />}
      {p.sfx && p.planos.map((pl, i) => trans[i] !== "salto" && (
        <Sequence key={`s${i}`} from={Math.max(0, Math.round(pl.t0 * fps) - 3)} durationInFrames={Math.round(fps * 0.8)}>
          <Audio src={SFX[trans[i] as Exclude<Trans, "salto">]} volume={trans[i] === "destello" ? 0.35 : 0.28} />
        </Sequence>
      ))}
      {p.sfx && pops.map((s, i) => (
        <Sequence key={`k${i}`} from={Math.round(s * fps)} durationInFrames={Math.round(fps * 0.4)}>
          <Audio src="/sfx/pop.mp3" volume={0.22} />
        </Sequence>
      ))}
      {p.sfx && enCta && (
        <Sequence from={Math.round(ctaT * fps)} durationInFrames={Math.round(fps * 0.9)}>
          <Audio src="/sfx/hit.mp3" volume={0.5} />
        </Sequence>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", left: 0, top: 0 }}>
        {sub && <Subtitulo key={sub.t0} texto={sub.texto} enfasis={sub.enfasis} gancho={sub === subs[0]} y={H * subY} W={W} start={Math.round(sub.t0 * fps)} acento={p.acento} />}
        {enCta && <Cta palabra={p.palabra.trim().toLocaleUpperCase("es")} f={frame - Math.round(ctaT * fps)} W={W} H={H} acento={p.acento} />}
      </svg>
      {enCta && p.logo && <Img src={p.logo} style={{ position: "absolute", left: W * 0.39, width: W * 0.22, top: H * 0.5, height: W * 0.22, objectFit: "contain", opacity: interpolate(frame - Math.round(ctaT * fps), [0, 6], [0, 1], clamp) }} />}
    </AbsoluteFill>
  );
}

/** Movimiento de todo el cuadro en el corte (los subtítulos no se mueven). */
function transStyle(tr: Trans, f: number, W: number): React.CSSProperties {
  if (tr === "barrido" && f >= 0 && f < 6) {
    const k = interpolate(f, [0, 6], [1, 0], clamp);
    return { transform: `translateX(${k * W * 0.22}px)`, filter: `blur(${k * 16}px)` };
  }
  if (tr === "zoom" && f >= 0 && f < 7) {
    const k = interpolate(f, [0, 7], [1, 0], clamp);
    return { transform: `scale(${1 + 0.35 * ease(k)})`, filter: `blur(${k * 10}px)` };
  }
  if (tr === "glitch" && f >= 0 && f < 5) return { transform: `translateX(${(f % 2 ? -1 : 1) * W * 0.03}px)` };
  return {};
}

/** Glitch de 4-5 cuadros: franjas corridas y un velo del color de acento. */
function Glitch({ f, acento }: { f: number; acento: string }) {
  const franjas = [0.12, 0.38, 0.61, 0.83];
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill style={{ backgroundColor: acento, opacity: 0.35, mixBlendMode: "difference" }} />
      {franjas.map((y, i) => (
        <div key={i} style={{ position: "absolute", left: 0, right: 0, top: `${y * 100}%`, height: `${3 + ((f + i) % 3) * 2}%`,
          backgroundColor: i % 2 ? "rgba(255,0,90,0.35)" : "rgba(0,255,220,0.35)", transform: `translateX(${((f + i) % 2 ? 1 : -1) * 6}%)` }} />
      ))}
    </AbsoluteFill>
  );
}

/**
 * Tú hablando durante un tramo: el mismo video sigue (los labios no se cortan) y cambia de lugar según el plano:
 * a pantalla completa ("tu"), abajo ("dividida") o escondido debajo de la app / el B-roll. En cada plano nuevo se
 * alterna un acercamiento (corte en salto).
 */
function Presentador({ tramo, k, planos, desde, W, H }: { tramo: RDTramo; k: number; planos: RDPlano[]; desde: number; W: number; H: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = desde + frame / fps;
  const mios = planos.filter(x => x.tramo === k);
  const j = Math.max(0, mios.findIndex(x => t >= x.t0 && t < x.t1));
  const pl = mios[j];
  const forma = pl?.forma ?? "tu";
  const visible = forma === "tu" || forma === "dividida";
  const zoom = j % 2 ? 1.16 : 1.0;
  // El primer plano del reel entra con un empujón de cámara.
  const hook = desde === 0 && j === 0 ? interpolate(frame, [0, 10], [1.12, 1], clamp) : 1;
  const media: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover", objectPosition: forma === "dividida" ? "50% 22%" : "50% 30%",
    transform: `scale(${zoom * hook})`, transformOrigin: "50% 28%" };
  const box: React.CSSProperties = forma === "dividida"
    ? { position: "absolute", left: 0, top: H * 0.5, width: W, height: H * 0.5, overflow: "hidden" }
    : { position: "absolute", inset: 0, overflow: "hidden" };
  return (
    <div style={{ ...box, opacity: visible ? 1 : 0 }}>
      {tramo.clip ? <Video src={tramo.clip} muted style={media} /> : tramo.img ? <Img src={tramo.img} style={media} /> : <AbsoluteFill style={{ backgroundColor: "#16161A" }} />}
    </div>
  );
}

/** Lo que va arriba (dividida) o a pantalla completa (app, B-roll). */
function Arriba({ pl, i, dur, acento, fondo, W, H }: { pl: RDPlano; i: number; dur: number; acento: string; fondo: string; W: number; H: number }) {
  const frame = useCurrentFrame();
  const k = interpolate(frame, [0, dur], [0, 1], clamp);
  const m = pl.top;
  const pop = interpolate(frame, [0, 5], [0.86, 1], clamp);
  if (pl.forma === "broll") {
    const dir = i % 2 ? -1 : 1;
    const e = ease(k);
    const move = m?.video ? `scale(${1.04 + 0.06 * e})` : `scale(${1.1 + 0.18 * e}) translateX(${dir * (2 - 4 * e)}%) rotate(${dir * (0.6 - 1.2 * e)}deg)`;
    return (
      <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#000" }}>
        {m && <Medio m={m} style={{ width: "100%", height: "100%", objectFit: "cover", transform: move }} />}
        <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.5) 100%)" }} />
      </AbsoluteFill>
    );
  }
  if (pl.forma === "app") {
    // La app en un celular grande sobre un fondo limpio con luz del color de acento (sin el fondo borroso sucio).
    const pw = W * 0.72, ph = pw * 1.95;
    return (
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 40%, ${acento}55 0%, #0B0B0D 62%)` }}>
        <div style={{ position: "absolute", left: (W - pw) / 2, top: (H - ph) / 2 - H * 0.04, width: pw, height: ph,
          transform: `scale(${pop * (1 + 0.04 * k)})`, borderRadius: W * 0.08, padding: W * 0.018, background: "#0E0E10",
          boxShadow: `0 40px 120px rgba(0,0,0,0.7), 0 0 0 2px #2A2A2E, 0 0 80px ${acento}40` }}>
          <div style={{ width: "100%", height: "100%", borderRadius: W * 0.065, overflow: "hidden", background: "#000" }}>
            {m && <Medio m={m} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />}
          </div>
        </div>
      </AbsoluteFill>
    );
  }
  // Dividida: la mitad de arriba (la de abajo es tuya).
  const vertical = !!m?.vertical;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H * 0.5, overflow: "hidden", background: fondo }}>
      {m && (vertical ? (
        <div style={{ position: "absolute", left: (W - H * 0.44 / 1.95) / 2, top: H * 0.03, width: H * 0.44 / 1.95, height: H * 0.44,
          transform: `scale(${pop})`, borderRadius: W * 0.04, padding: W * 0.01, background: "#0E0E10", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
          <div style={{ width: "100%", height: "100%", borderRadius: W * 0.03, overflow: "hidden" }}>
            <Medio m={m} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
          </div>
        </div>
      ) : (
        <div style={{ position: "absolute", left: W * 0.04, top: H * 0.025, width: W * 0.92, height: H * 0.45, borderRadius: W * 0.04, overflow: "hidden",
          transform: `scale(${pop})`, boxShadow: "0 20px 60px rgba(0,0,0,0.45)" }}>
          <Medio m={m} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${1.05 + 0.08 * ease(k)})` }} />
        </div>
      ))}
    </div>
  );
}

function Medio({ m, style }: { m: RDMedia; style: React.CSSProperties }) {
  return m.video ? <Video src={m.url} muted style={style} /> : <Img src={m.url} style={style} />;
}

/**
 * Subtítulo de 1 a 3 palabras con pop. La palabra clave va en una caja del color de acento; el primero del gancho,
 * en letra serif cursiva grande (como la referencia).
 */
function Subtitulo({ texto, enfasis, gancho, y, W, start, acento }: { texto: string; enfasis: boolean; gancho: boolean; y: number; W: number; start: number; acento: string }) {
  const frame = useCurrentFrame();
  const pop = interpolate(frame - start, [0, 3], [0.8, 1], clamp);
  const cx = W / 2;
  if (gancho) {
    const fs = Math.min(W * 0.13, (W * 0.9) / Math.max(1, texto.length * 0.42));
    const t = texto.charAt(0) + texto.slice(1).toLocaleLowerCase("es");
    return (
      <g transform={`translate(${cx} ${y}) scale(${pop}) translate(${-cx} ${-y})`} fontFamily={FONTS.serif} fontStyle="italic" fontSize={fs} textAnchor="middle">
        <text x={cx} y={y} fill="#000" fillOpacity={0.35} stroke="#000" strokeOpacity={0.35} strokeWidth={fs * 0.12}>{t}</text>
        <text x={cx} y={y} fill="#FFFFFF">{t}</text>
      </g>
    );
  }
  const fs = Math.min(W * (enfasis ? 0.088 : 0.074), (W * 0.86) / Math.max(1, texto.length * 0.6));
  const bw = texto.length * fs * 0.62 + fs * 0.8;
  return (
    <g transform={`translate(${cx} ${y}) scale(${pop * (enfasis ? 1.06 : 1)}) translate(${-cx} ${-y})`} fontFamily={FONTS.manrope} fontWeight={800} fontSize={fs} textAnchor="middle" strokeLinejoin="round">
      {enfasis ? (
        <>
          <rect x={cx - bw / 2} y={y - fs * 0.92} width={bw} height={fs * 1.25} rx={fs * 0.18} fill={acento} />
          <text x={cx} y={y} fill="#0B0B0D">{texto}</text>
        </>
      ) : (
        <>
          <text x={cx} y={y + fs * 0.06} fill="#000" fillOpacity={0.5} stroke="#000" strokeOpacity={0.5} strokeWidth={fs * 0.24}>{texto}</text>
          <text x={cx} y={y} fill="#FFFFFF">{texto}</text>
        </>
      )}
    </g>
  );
}

/**
 * CTA final con contundencia (Jean: "no se presenta la palabra del CTA final con contundencia"): "COMENTA" y la
 * palabra gigante entre comillas, que cae con rebote y una sacudida, sobre un degradado oscuro en la parte de abajo
 * (no tapa la cara).
 */
function Cta({ palabra, f, W, H, acento }: { palabra: string; f: number; W: number; H: number; acento: string }) {
  const cx = W / 2;
  const a = interpolate(f, [0, 4], [0, 1], clamp);
  const golpe = f < 3 ? 1.9 - 0.3 * f : interpolate(f, [3, 6, 9], [1, 1.08, 1], clamp);
  const sacude = f >= 3 && f < 9 ? (f % 2 ? -1 : 1) * W * 0.008 : 0;
  const texto = `«${palabra}»`;
  const fs = Math.min(W * 0.19, (W * 0.92) / Math.max(1, texto.length * 0.48));
  const y = H * 0.8;
  return (
    <g opacity={a}>
      <defs>
        <linearGradient id="cta-sombra" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity={0} />
          <stop offset="1" stopColor="#000" stopOpacity={0.75} />
        </linearGradient>
      </defs>
      <rect x={0} y={H * 0.55} width={W} height={H * 0.45} fill="url(#cta-sombra)" />
      <text x={cx} y={y - fs * 1.05} fontFamily={FONTS.manrope} fontWeight={800} fontSize={W * 0.075} fill="#FFFFFF" textAnchor="middle" letterSpacing={W * 0.006}>COMENTA</text>
      <g transform={`translate(${cx + sacude} ${y}) scale(${golpe}) translate(${-cx} ${-y})`} fontFamily={FONTS.anton} fontSize={fs} textAnchor="middle" strokeLinejoin="round">
        <text x={cx} y={y} fill="#000" stroke="#000" strokeWidth={fs * 0.14}>{texto}</text>
        <text x={cx} y={y} fill={acento}>{texto}</text>
      </g>
    </g>
  );
}
