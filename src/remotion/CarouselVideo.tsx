import { AbsoluteFill, Img, interpolate, Sequence, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * Carrusel animado (17-oct-2026, opcional): las láminas ya diseñadas (PNG) pasan una tras otra con un
 * movimiento suave. "reel" = 1080×1920 con la lámina centrada sobre negro; "feed" = 1080×1350.
 * Se ve en el Player y se descarga gratis armado en el navegador (renderMediaOnWeb).
 */
export type CarouselAnim = "deslizar" | "zoom" | "aparecer";
export type CarouselVideoProps = { frames: string[]; per: number; anim: CarouselAnim; format: "reel" | "feed"; brand: string; aspect: "4:5" | "1:1" };

export const FPS = 30;
const T = 10; // cuadros de transición
export const carouselFrames = (n: number, per: number) => Math.max(1, Math.round(n * per * FPS));
export const carouselSize = (format: "reel" | "feed", aspect: "4:5" | "1:1") => ({ width: 1080, height: format === "reel" ? 1920 : aspect === "4:5" ? 1350 : 1080 });

function Slide({ src, anim, len, aspect }: { src: string; anim: CarouselAnim; len: number; aspect: "4:5" | "1:1" }) {
  const f = useCurrentFrame();
  const { width } = useVideoConfig();
  const enter = interpolate(f, [0, T], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const exit = interpolate(f, [len - T, len], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const h = aspect === "4:5" ? 1350 : 1080;
  let transform = "", opacity = 1;
  if (anim === "deslizar") transform = `translateX(${(1 - enter) * width - exit * width}px)`;
  if (anim === "zoom") { transform = `scale(${interpolate(f, [0, len], [1, 1.06])})`; opacity = enter * (1 - exit); }
  if (anim === "aparecer") { transform = `translateY(${(1 - enter) * 60}px) scale(${0.96 + enter * 0.04})`; opacity = enter * (1 - exit); }
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <Img src={src} style={{ width: 1080, height: h, transform, opacity, display: "block" }} />
    </AbsoluteFill>
  );
}

// Fondo negro liso: el armado en el navegador no pinta degradados CSS, así la vista previa y el video son iguales.
export function CarouselVideo({ frames, per, anim, aspect }: CarouselVideoProps) {
  const len = Math.round(per * FPS);
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {frames.map((src, i) => (
        <Sequence key={i} from={i * len} durationInFrames={len}>
          <Slide src={src} anim={anim} len={len} aspect={aspect} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
