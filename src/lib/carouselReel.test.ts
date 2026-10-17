import { describe, expect, it } from "vitest";
import { parseClone, REEL_LINK_RE } from "./carousel";

// Respuesta de reel-analyze { step: "carrusel" } (Reel → Carrusel): misma forma que carousel-clone.
const RESP = {
  convertible: { nivel: "bajo", por_que: "Es un sketch sin algo que enseñar." },
  analisis: {
    resumen: "Siete números de CEO", gancho_original: "7 números de CEO", por_que_funciona: "Curiosidad por completar la lista.",
    laminas: [{ n: 1, posicion: "gancho", composicion: "Plano medio", artefacto: "Lista cerrada", idea: "Promete 7 números" }],
    estilo: { colores: [], letra: "", estilo_cercano: "poster", empieza: "oscuro", fotos: "" },
  },
  adn: [{ id: "a1", parte: "Lista cerrada", que_es: "", importa: true, por_que: "" }],
  mantener: ["a1"], mejoras: ["Una idea por lámina"], necesitas: [],
  carrusel: {
    idea: "7 números", portadas: [{ titulo: "7 números de *dueño*", subtitulo: "Los que nadie mira", pastilla: "GUÍA" }], recomendada: 0,
    laminas: [
      { tipo: "respuesta", titulo: "Son estos", texto: "Uno por lámina", original: 1 },
      { tipo: "tarjetas", titulo: "Costo y valor", items: [{ titulo: "Costo", texto: "Por cliente" }, { titulo: "Valor", texto: "Por cliente" }], original: 0 },
      { tipo: "solucion", titulo: "Mídelos cada mes", texto: "Una hoja basta", original: 0 },
      { tipo: "llamada", titulo: "Lo que no mides no crece", palabra: "SCORECARD", texto: "Te mando la plantilla", original: 0 },
    ],
    pie: "Guárdalo.",
  },
  analysis_id: "00000000-0000-0000-0000-000000000000", clone_id: null,
  source: { url: "https://www.instagram.com/reel/DeCjErWjX5e/", images: [], owner: "danmartell", likes: 100, comments: 831 },
  reel: { shortcode: "DeCjErWjX5e", convertible: { nivel: "bajo", por_que: "Es un sketch sin algo que enseñar." } },
};

describe("Reel → Carrusel en el estudio", () => {
  it("lee la respuesta del Reel como un modelado y guarda qué tan bien se presta", () => {
    const out = parseClone(RESP, "oscuro", "tema");
    expect(out).not.toBeNull();
    expect(out!.info.reel).toEqual({ shortcode: "DeCjErWjX5e", fit: "bajo", why: "Es un sketch sin algo que enseñar." });
    expect(out!.info.source.images).toEqual([]);
    expect(out!.info.style.colors).toEqual([]);
    expect(out!.draft.slides[0].kind).toBe("portada");
    expect(out!.draft.slides.at(-1)?.kind).toBe("llamada");
  });

  it("un carrusel normal no trae datos de Reel", () => {
    const { reel: _r, ...plain } = RESP;
    expect(parseClone(plain, "oscuro", "tema")!.info.reel).toBeUndefined();
  });

  it("reconoce enlaces de Reels y no los de carruseles", () => {
    expect(REEL_LINK_RE.exec("https://www.instagram.com/reel/DeCjErWjX5e/?igsh=x")?.[1]).toBe("DeCjErWjX5e");
    expect(REEL_LINK_RE.exec("https://www.instagram.com/danmartell/reels/DeCjErWjX5e/")?.[1]).toBe("DeCjErWjX5e");
    expect(REEL_LINK_RE.test("https://www.instagram.com/p/DeCjErWjX5e/")).toBe(false);
  });
});
