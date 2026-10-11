import { describe, expect, it } from "vitest";
import { normalizeAdsLibraryUrl } from "./demo-winning-ads";

describe("enlaces de la Biblioteca de anuncios", () => {
  it("render_ad conserva el id (así la tarjeta puede mostrar el creativo)", () => {
    expect(normalizeAdsLibraryUrl("https://www.facebook.com/ads/archive/render_ad/?id=1234567890", "x")).toBe("https://www.facebook.com/ads/library/?id=1234567890");
  });
  it("una URL rara cae en una búsqueda, nunca en un enlace inseguro", () => {
    expect(normalizeAdsLibraryUrl("javascript://facebook.com/ads/archive/render_ad/?id=1", "curso")).toContain("/ads/library/");
    expect(normalizeAdsLibraryUrl("https://evil.com/ads/archive/render_ad/?id=123456", "curso")).not.toContain("evil.com");
  });
});
