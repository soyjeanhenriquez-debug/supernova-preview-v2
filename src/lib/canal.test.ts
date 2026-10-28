import { describe, expect, it } from "vitest";
import { enlaceCanal } from "./offers";

const ad = "https://www.facebook.com/ads/archive/render_ad/?id=123";
describe("Cómo vende cada oferta (28-oct-2026)", () => {
  it("página de ventas: lleva a su página", () => {
    expect(enlaceCanal({ canal: "pagina", canal_url: "https://misitio.com", sample_ad_url: ad })).toEqual({ href: "https://misitio.com", texto: "Ver su página de ventas" });
  });
  it("WhatsApp: abre el anuncio (la API no da el número)", () => {
    expect(enlaceCanal({ canal: "whatsapp", canal_url: null, sample_ad_url: ad })?.texto).toBe("Ver el anuncio y su botón de WhatsApp");
  });
  it("sin revisar: el anuncio original; nunca un enlace que no sea https", () => {
    expect(enlaceCanal({ canal: null, canal_url: null, sample_ad_url: ad })?.texto).toBe("Ver el anuncio original");
    expect(enlaceCanal({ canal: "pagina", canal_url: "javascript:alert(1)", sample_ad_url: null })).toBeNull();
  });
});
