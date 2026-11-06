import { AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio, Video } from "@remotion/media";
import { FONTS } from "@/remotion/SubsVideo";
import { segundosDe, type PlanMontaje, type Segmento } from "@/lib/montaje";
import type { Word } from "@/lib/subtitleStyles";

/**
 * «Edita tus tomas como tu referencia» (06-nov-2026): une los trozos de las tomas en el orden del plan, con su
 * sonido, transiciones simples (corte, zoom lento, fundido), un rótulo corto por trozo y el rótulo fijo de arriba
 * (como «Por solo $15.000 pesos» en la referencia de Cindy). Se arma en el navegador (renderMediaOnWeb): no cuesta.
 * Con voz nueva (06-nov-2026, Jean: «todo en la misma voz»): las tomas van sin sonido, la voz encima y subtítulos
 * palabra por palabra. Los planos que se crean con IA y aún no existen se ven como un aviso (es el storyboard).
 * Zona segura de reels: textos entre el 10 % y el 80 % del alto.
 */
export type MontajeProps = {
  clips: string[];
  plan: PlanMontaje;
  /** Planos creados con IA (en el orden de plan.nuevas); null = todavía no se crea. */
  nuevas?: (string | null)[];
  /** Voz nueva con los tiempos de cada palabra. */
  voz?: { src: string; words: Word[] } | null;
  subs?: boolean;
};
export const MONTAJE_FPS = 30;
export const MONTAJE_SIZE = { width: 720, height: 1280 };
const AMBER = "#F5A83B";

export const framesDe = (s: Segmento) => Math.max(1, Math.round(segundosDe(s) * MONTAJE_FPS));
export const totalFrames = (p: PlanMontaje) => Math.max(MONTAJE_FPS, p.segmentos.reduce((a, s) => a + framesDe(s), 0));

function PorCrear({ desc }: { desc: string }) {
  return (
    <AbsoluteFill style={{ background: "linear-gradient(160deg,#1c1c1c,#0a0a0a)", justifyContent: "center", alignItems: "center", padding: 60 }}>
      <div style={{ border: `3px dashed ${AMBER}`, borderRadius: 28, padding: "40px 34px", textAlign: "center", fontFamily: FONTS.manrope }}>
        <div style={{ color: AMBER, fontWeight: 800, fontSize: 34 }}>Plano por crear con IA</div>
        <div style={{ color: "#ddd", fontWeight: 600, fontSize: 30, marginTop: 14, lineHeight: 1.25 }}>{desc}</div>
      </div>
    </AbsoluteFill>
  );
}

function Trozo({ seg, src, muda, desc }: { seg: Segmento; src: string | null; muda: boolean; desc: string }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = framesDe(seg);
  const scale = seg.transicion === "zoom" ? interpolate(f, [0, n], [1, 1.1], { extrapolateRight: "clamp" }) : 1;
  const opacity = seg.transicion === "fundido" ? interpolate(f, [0, 8], [0, 1], { extrapolateRight: "clamp" }) : 1;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000", opacity }}>
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        {src
          ? <Video src={src} trimBefore={Math.round(seg.desde * fps)} playbackRate={seg.vel ?? 1} loop={!!seg.loop} muted={muda}
              style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <PorCrear desc={desc} />}
      </AbsoluteFill>
      {seg.texto && (
        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: "24%" }}>
          <div style={{ maxWidth: "80%", textAlign: "center", fontFamily: FONTS.manrope, fontWeight: 800, fontSize: 46, lineHeight: 1.15,
            color: "#fff", textShadow: "0 3px 14px rgba(0,0,0,.75)" }}>{seg.texto}</div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}

/** Subtítulos de a 3 palabras; la que se está diciendo va en ámbar. Entre el 55 % y el 70 % del alto. */
function Subtitulos({ words }: { words: Word[] }) {
  const f = useCurrentFrame();
  const t = f / MONTAJE_FPS;
  const i = words.findIndex(w => t < w.t1);
  if (i < 0 || t < words[0].t0 - 0.1) return null;
  const g = Math.floor(i / 3) * 3;
  const grupo = words.slice(g, g + 3);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: "58%" }}>
      <div style={{ maxWidth: "84%", textAlign: "center", fontFamily: FONTS.manrope, fontWeight: 800, fontSize: 52, lineHeight: 1.15,
        color: "#fff", textShadow: "0 3px 14px rgba(0,0,0,.85), 0 0 3px rgba(0,0,0,.9)" }}>
        {grupo.map((w, k) => <span key={k} style={{ color: g + k === i ? AMBER : "#fff" }}>{w.w}{k < grupo.length - 1 ? " " : ""}</span>)}
      </div>
    </AbsoluteFill>
  );
}

export function MontajeVideo({ clips, plan, nuevas = [], voz = null, subs = true }: MontajeProps) {
  let desde = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {plan.segmentos.map((seg, i) => {
        const esNueva = seg.toma === 0 && !!seg.nueva;
        const src = esNueva ? nuevas[seg.nueva! - 1] ?? null : clips[seg.toma - 1];
        if (!esNueva && !src) return null;
        const from = desde;
        desde += framesDe(seg);
        return (
          <Sequence key={i} from={from} durationInFrames={framesDe(seg)}>
            <Trozo seg={seg} src={src} muda={!!voz || esNueva} desc={esNueva ? plan.nuevas?.[seg.nueva! - 1]?.desc ?? "" : ""} />
          </Sequence>
        );
      })}
      {voz && <Audio src={voz.src} />}
      {voz && subs && voz.words.length > 0 && <Subtitulos words={voz.words} />}
      {plan.rotulo && (
        <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: "11%" }}>
          <div style={{ background: "#fff", color: "#111", borderRadius: 10, padding: "8px 18px", fontFamily: FONTS.manrope, fontWeight: 800,
            fontSize: 34, maxWidth: "80%", textAlign: "center" }}>{plan.rotulo}</div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}
