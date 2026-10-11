import { describe, expect, it } from "vitest";
import { isAdCreativeImage } from "@/components/AdMediaPreview";

describe("portada de los anuncios del Radar", () => {
  it("acepta la imagen del creativo", () => {
    expect(isAdCreativeImage("https://scontent-lax3-1.xx.fbcdn.net/v/t39.35426-6/123_n.jpg?x=1")).toBe(true);
  });
  it("descarta la silueta gris y la foto de perfil", () => {
    expect(isAdCreativeImage("https://scontent-lax7-1.xx.fbcdn.net/v/t1.30497-1/84628_n.png")).toBe(false);
    expect(isAdCreativeImage("https://scontent-lax3-2.xx.fbcdn.net/v/t39.30808-1/1_n.jpg")).toBe(false);
    expect(isAdCreativeImage(null)).toBe(false);
  });
});
