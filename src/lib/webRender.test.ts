import { describe, expect, it } from "vitest";
import { blockingIssue } from "@/lib/webRender";

describe("chequeo antes de armar el video en el navegador", () => {
  it("sin WebGL igual deja armar (las plantillas solo usan movimientos 2D)", () => {
    expect(blockingIssue({ canRender: false, issues: [{ type: "webgl-unsupported", message: "WebGL is not supported. 3D CSS transforms will fail.", severity: "error" }] })).toBeNull();
  });
  it("los demás errores sí bloquean, y los avisos no", () => {
    expect(blockingIssue({ canRender: false, issues: [{ type: "video-codec-unsupported", message: "Sin H.264", severity: "error" }] })).toBe("Sin H.264");
    expect(blockingIssue({ canRender: true, issues: [{ type: "x", message: "aviso", severity: "warning" }] })).toBeNull();
  });
});
