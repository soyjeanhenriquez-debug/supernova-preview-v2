import { describe, expect, it } from "vitest";
import { scrubUrl } from "./analytics";

describe("scrubUrl: nada de tokens hacia PostHog", () => {
  it("borra el token de un enlace de acceso por correo", () => {
    expect(scrubUrl("https://supernova-six-eta.vercel.app/#access_token=eyJabc&refresh_token=xyz&type=magiclink"))
      .toBe("https://supernova-six-eta.vercel.app/#[oculto]");
  });
  it("borra los errores de enlace caducado", () => {
    expect(scrubUrl("https://x.app/#error=access_denied&error_code=otp_expired")).toBe("https://x.app/#[oculto]");
  });
  it("borra ?t= (baja de correos) y ?code=", () => {
    expect(scrubUrl("https://x.app/unsub?t=secreto123")).toBe("https://x.app/unsub?t=[oculto]");
    expect(scrubUrl("https://x.app/app?code=abc&checkout=success")).toBe("https://x.app/app?code=[oculto]&checkout=success");
  });
  it("deja intactas las pantallas normales", () => {
    expect(scrubUrl("https://x.app/app#/ofertas")).toBe("https://x.app/app#/ofertas");
    expect(scrubUrl("https://x.app/app#/mi-negocio")).toBe("https://x.app/app#/mi-negocio");
  });
});
