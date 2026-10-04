import { describe, expect, it } from "vitest";
import {
  VIDEO_PRICE, VIDEO_TEMPLATES, buildShots, cleanBrief, hasForbiddenClaim, improvePrompt, parseImprovedLines,
  planCost, publishText, recommendTemplate, serieFromBrief, shortPhrase, shotPrompt, videoSizeFor, VIDEO_RULES, type VideoBrief,
} from "./videoTemplates";

const brief: VideoBrief = {
  product: "Recetario digital de comidas rápidas para la semana",
  who: "Mamás que trabajan y no tienen tiempo de cocinar",
  promise: "Tener la comida de la semana lista en una tarde",
};
const TESTIMONIAL = /me funcion[oó]|compr[eé]|gan[eé]/i;

describe("buildShots", () => {
  it("anuncio = 3 tomas de 5 s (gancho, demo, llamada) en todas las plantillas", () => {
    for (const t of VIDEO_TEMPLATES) {
      const shots = buildShots("anuncio", t.id, brief);
      expect(shots).toHaveLength(3);
      expect(shots.map(s => s.role)).toEqual(["gancho", "demo", "llamada"]);
      expect(shots.every(s => s.seconds === 5)).toBe(true);
    }
  });
  it("UGC = 1 toma de 10 s con presentador", () => {
    for (const t of VIDEO_TEMPLATES) {
      const shots = buildShots("ugc", t.id, brief);
      expect(shots).toHaveLength(1);
      expect(shots[0]).toMatchObject({ role: "presentador", seconds: 10 });
      expect(shots[0].line.split(/\s+/).length).toBeLessThanOrEqual(28);
    }
  });
  it("las líneas del anuncio son cortas (caben en 5 s)", () => {
    for (const t of VIDEO_TEMPLATES) for (const s of buildShots("anuncio", t.id, brief)) {
      expect(s.line.split(/\s+/).length).toBeLessThanOrEqual(14);
    }
  });
});

describe("planCost", () => {
  it("costo total = tomas × precio", () => {
    expect(planCost(buildShots("anuncio", "problema_solucion", brief))).toBe(3 * VIDEO_PRICE[5]);
    expect(planCost(buildShots("anuncio", "demostracion", brief))).toBe(165);
    expect(planCost(buildShots("ugc", "tres_razones", brief))).toBe(VIDEO_PRICE[10]);
    expect(planCost([])).toBe(0);
  });
});

describe("prompts", () => {
  const all = (presenter: boolean) => VIDEO_TEMPLATES.flatMap(t => [
    ...buildShots("anuncio", t.id, brief).map(s => shotPrompt(s, "anuncio", { presenter })),
    ...buildShots("ugc", t.id, brief).map(s => shotPrompt(s, "ugc", { presenter })),
  ]);
  it("ningún prompt suena a testimonio, aunque la ficha lo traiga", () => {
    const dirty: VideoBrief = { product: "Curso de ventas", who: "Emprendedores", promise: "Yo lo compré y me funcionó: gané 500 dólares" };
    const prompts = [...all(false), ...all(true), ...VIDEO_TEMPLATES.flatMap(t => buildShots("ugc", t.id, dirty).map(s => shotPrompt(s, "ugc")))];
    for (const p of prompts) {
      // Las reglas nombran lo prohibido para negarlo; fuera de las reglas no puede aparecer.
      const body = p.split("\nReglas:")[0];
      expect(body).not.toMatch(TESTIMONIAL);
      expect(hasForbiddenClaim(body)).toBe(false);
    }
  });
  it("todos llevan español latino y las reglas del manual", () => {
    for (const p of all(false)) {
      expect(p).toMatch(/español latino/);
      expect(p).toMatch(/no es un testimonio/);
      expect(p).toMatch(/Personaje creado con IA/);
      expect(p).toMatch(/Sin dinero/);
    }
  });
  it("con presentador, la persona es la de la imagen inicial", () => {
    const [s] = buildShots("ugc", "problema_solucion", brief);
    expect(shotPrompt(s, "ugc", { presenter: true })).toMatch(/imagen inicial/);
    expect(shotPrompt(s, "ugc")).toMatch(/labios sincronizados/);
  });
  it("el gancho de referencia nunca entra si trae promesas", () => {
    const [s] = buildShots("anuncio", "problema_solucion", brief);
    expect(shotPrompt(s, "anuncio", { hook: "Gana US$300 en 7 días" })).not.toMatch(/US\$300/);
    expect(shotPrompt(s, "anuncio", { hook: "¿Cocinas todos los días?" })).toMatch(/no la digas literal/);
  });
  it("las comillas del usuario no rompen el diálogo", () => {
    const [s] = buildShots("ugc", "demostracion", { ...brief, product: 'Kit "Fácil"' });
    const p = shotPrompt(s, "ugc");
    expect((p.match(/"/g) ?? []).length).toBe(2);
  });
});

describe("cleanBrief y hasForbiddenClaim", () => {
  it("detecta testimonios con y sin tilde", () => {
    expect(hasForbiddenClaim("Lo compré ayer")).toBe(true);
    expect(hasForbiddenClaim("a mí me funcionó")).toBe(true);
    expect(hasForbiddenClaim("gané clientes")).toBe(true);
    expect(hasForbiddenClaim("bajé 5 kilos")).toBe(true);
    expect(hasForbiddenClaim("Genera US$500 al mes")).toBe(true);
    expect(hasForbiddenClaim("resultados en 7 días")).toBe(true);
  });
  it("no marca textos normales", () => {
    expect(hasForbiddenClaim("Recetas fáciles para la semana")).toBe(false);
    expect(hasForbiddenClaim("Compra en línea fácil")).toBe(false);
    expect(hasForbiddenClaim("Ganancia de tiempo")).toBe(false);
  });
  it("quita la promesa prohibida y recorta", () => {
    const b = cleanBrief({ product: "x".repeat(500), promise: "Gana 1000 dólares" });
    expect(b.product.length).toBe(200);
    expect(b.promise).toBe("");
    expect(cleanBrief({}).product).toBe("tu producto");
  });
  it("shortPhrase corta en palabra completa", () => {
    expect(shortPhrase("Recetario digital de comidas rápidas para la semana.", 30)).toBe("Recetario digital de comidas");
    expect(shortPhrase("Corto.", 30)).toBe("Corto");
  });
});

describe("recommendTemplate", () => {
  it("elige por la idea y explica el porqué", () => {
    expect(recommendTemplate({ ...brief, hook: "El mito de cocinar sano" }, "ugc").id).toBe("mito_realidad");
    expect(recommendTemplate({ ...brief, hook: "¿Cómo cocinar en una tarde?" }, "ugc").id).toBe("pregunta_frecuente");
    expect(recommendTemplate({ ...brief, angle: "lo que nadie te cuenta" }, "anuncio").id).toBe("nadie_te_dice");
    expect(recommendTemplate(brief, "anuncio").id).toBe("demostracion");
    const r = recommendTemplate({ ...brief, product: "Crema natural" }, "ugc");
    expect(r.id).toBe("problema_solucion");
    expect(r.reason.length).toBeGreaterThan(10);
  });
});

describe("parseImprovedLines", () => {
  it("acepta N líneas válidas", () => {
    expect(parseImprovedLines('Aquí va: ["Uno dos tres", "Cuatro cinco", "Seis siete"]', 3, "anuncio")).toEqual(["Uno dos tres", "Cuatro cinco", "Seis siete"]);
  });
  it("rechaza número equivocado, JSON roto o testimonio", () => {
    expect(parseImprovedLines('["a b c d", "e f g h"]', 3, "anuncio")).toBeNull();
    expect(parseImprovedLines("sin json", 2, "ugc")).toBeNull();
    expect(parseImprovedLines("1. Uno dos tres\n2. Cuatro cinco\n3. Seis siete", 3, "anuncio")).toEqual(["Uno dos tres", "Cuatro cinco", "Seis siete"]);
    expect(parseImprovedLines('["Lo compré y me encantó"]', 1, "ugc")).toBeNull();
    expect(parseImprovedLines(`["${"x".repeat(300)}"]`, 1, "ugc")).toBeNull();
  });
  it("el prompt de mejora pide referencia, no copia", () => {
    const { system, user } = improvePrompt(buildShots("anuncio", "problema_solucion", brief), { ...brief, hook: "Cocina 1 vez" }, "anuncio");
    expect(system).toMatch(/JSON de 3/);
    expect(user).toMatch(/no lo copies/);
  });
});

describe("reglas", () => {
  it("las reglas no traen frases en primera persona (el servidor revisa el prompt entero)", () => {
    expect(VIDEO_RULES).not.toMatch(TESTIMONIAL);
  });
  it("la serie desde una idea trae 3 escenas sin promesas", () => {
    const s = serieFromBrief(brief);
    expect(s).toHaveLength(3);
    expect(s.some(hasForbiddenClaim)).toBe(false);
  });
});

describe("formato y publicación", () => {
  it("4:5 de una imagen pasa a vertical", () => {
    expect(videoSizeFor("4:5", "anuncio")).toBe("9:16");
    expect(videoSizeFor("16:9", "ugc")).toBe("16:9");
    expect(videoSizeFor(undefined, "clip")).toBe("9:16");
  });
  it("el texto sugerido avisa que es IA y no promete", () => {
    const t = publishText(brief, "ugc");
    expect(t).toMatch(/Personaje creado con IA/);
    expect(hasForbiddenClaim(t)).toBe(false);
  });
});
