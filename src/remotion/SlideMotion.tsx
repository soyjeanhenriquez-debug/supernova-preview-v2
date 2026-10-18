import { AbsoluteFill, Img } from "remotion";
import { Video } from "@remotion/media";

/**
 * "Dar vida a esta lámina" (17-oct-2026, pedido de Jean): la lámina en video, como un GIF. Abajo, el video
 * IA de la foto de fondo (solo la foto, para que la IA no deforme las letras). Arriba, la misma lámina
 * convertida en PNG transparente con el texto nítido. "tuit" = la foto ocupa el 78 % de arriba.
 */
export type SlideMotionProps = { video: string; overlay: string; area: "full" | "tuit"; height: number };

export const MOTION_FPS = 30;

export function SlideMotion({ video, overlay, area, height }: SlideMotionProps) {
  const vh = area === "tuit" ? Math.round(height * 0.78) : height;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      <Video src={video} muted style={{ position: "absolute", left: 0, top: 0, width: "100%", height: vh, objectFit: "cover", objectPosition: area === "tuit" ? "center 25%" : "center" }} />
      <Img src={overlay} style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%" }} />
    </AbsoluteFill>
  );
}
