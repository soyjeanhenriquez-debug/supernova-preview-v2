/**
 * Chequeo antes de armar un video en el navegador (renderMediaOnWeb). Remotion marca "webgl-unsupported" como error,
 * pero WebGL solo hace falta para movimientos 3D, y nuestras plantillas (ToolReel, StoryVideo, SubsVideo) solo usan
 * 2D: acercar, deslizar y girar en el plano. Sin esto, un Chrome sin aceleración de gráficos no podía descargar
 * (25-oct-2026, Jean: "WebGL is not supported. 3D CSS transforms will fail."). Los demás errores sí bloquean.
 */
export type RenderIssue = { type: string; message: string; severity: string };

export function blockingIssue(check: { canRender: boolean; issues: RenderIssue[] }): string | null {
  const bad = check.issues.filter(i => i.severity === "error" && i.type !== "webgl-unsupported");
  if (!bad.length) return null;
  return bad[0].message || "Tu navegador no puede armar el video.";
}
