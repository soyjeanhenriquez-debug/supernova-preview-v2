import { AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Video } from "@remotion/media";
import { FONTS } from "@/remotion/SubsVideo";
import type { PlanMontaje, Segmento } from "@/lib/montaje";

/**
 * «Edita tus tomas como tu referencia» (06-nov-2026): une los trozos de las tomas en el orden del plan, con su
 * sonido, transiciones simples (corte, zoom lento, fundido), un rótulo corto por trozo y el rótulo fijo de arriba
 * (como «Por solo $15.000 pesos» en la referencia de Cindy). Se arma en el navegador (renderMediaOnWeb): no cuesta.
 * Zona segura de reels: textos entre el 10 % y el 80 % del alto.
 */
export type MontajeProps = { clips: string[]; plan: PlanMontaje };
export const MONTAJE_FPS = 30;
export const MONTAJE_SIZE = { width: 720, height: 1280 };

export const framesDe = (s: Segmento) => Math.max(1, Math.round((s.hasta - s.desde) * MONTAJE_FPS));
export const totalFrames = (p: PlanMontaje) => Math.max(MONTAJE_FPS, p.segmentos.reduce((a, s) => a + framesDe(s), 0));

function Trozo({ seg, src }: { seg: Segmento; src: string }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = framesDe(seg);
  const scale = seg.transicion === "zoom" ? interpolate(f, [0, n], [1, 1.1], { extrapolateRight: "clamp" }) : 1;
  const opacity = seg.transicion === "fundido" ? interpolate(f, [0, 8], [0, 1], { extrapolateRight: "clamp" }) : 1;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000", opacity }}>
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <Video src={src} trimBefore={Math.round(seg.desde * fps)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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

export function MontajeVideo({ clips, plan }: MontajeProps) {
  let desde = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {plan.segmentos.map((seg, i) => {
        const src = clips[seg.toma - 1];
        const from = desde;
        desde += framesDe(seg);
        return src ? <Sequence key={i} from={from} durationInFrames={framesDe(seg)}><Trozo seg={seg} src={src} /></Sequence> : null;
      })}
      {plan.rotulo && (
        <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: "11%" }}>
          <div style={{ background: "#fff", color: "#111", borderRadius: 10, padding: "8px 18px", fontFamily: FONTS.manrope, fontWeight: 800,
            fontSize: 34, maxWidth: "80%", textAlign: "center" }}>{plan.rotulo}</div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}
