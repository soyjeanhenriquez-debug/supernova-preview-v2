import { describe, expect, it } from "vitest";
import { STOCK_INFLUENCERS, SPOKEN_MAX, guessGenero, lineFromGuion, voicePrompt } from "./influencers";

describe("influencers", () => {
  it("los 4 avatares de SUPERNOVA son variados y dicen que son IA", () => {
    expect(STOCK_INFLUENCERS).toHaveLength(4);
    expect(new Set(STOCK_INFLUENCERS.map(s => `${s.genero}-${s.edad}`)).size).toBe(4);
    expect(new Set(STOCK_INFLUENCERS.map(s => s.pais)).size).toBe(4);
    for (const s of STOCK_INFLUENCERS) {
      expect(s.personaje.bio).toMatch(/Personaje creado con IA$/);
      expect(s.personaje.bio.length).toBeLessThanOrEqual(160);
      expect(s.foto).toMatch(/^\/avatares\/[a-z]+\.webp$/);
    }
  });

  it("deduce el género del aspecto (con tildes y ñ)", () => {
    expect(guessGenero({ nombre: "Lucía", aspecto: "Señora de cabello gris" })).toBe("mujer");
    expect(guessGenero({ nombre: "Beto", aspecto: "Hombre joven con gorra" })).toBe("hombre");
    expect(guessGenero({ nombre: "Ana", aspecto: "Hombre", genero: "mujer" })).toBe("mujer");
  });

  it("la voz siempre pide español latino y respeta el género", () => {
    expect(voicePrompt("hombre", "serena")).toMatch(/masculina.*español latinoamericano/);
    expect(voicePrompt("mujer", "no-existe")).toMatch(/femenina cálida/);
  });

  it("la línea hablada cabe en 10 s", () => {
    const largo = "a".repeat(200);
    expect(lineFromGuion({ gancho: "Hola", cta: "Sígueme" })).toBe("Hola Sígueme");
    expect(lineFromGuion({ gancho: largo, cta: largo })).toBe(largo);
    expect(lineFromGuion({ gancho: "x".repeat(400), cta: "" }).length).toBe(SPOKEN_MAX);
  });
});
