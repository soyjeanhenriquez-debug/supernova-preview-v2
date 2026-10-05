import { describe, expect, it } from "vitest";
import {
  accentRuns, carouselRequest, posterPrompt, slideTwoScore, storyTest, ADMIN_DESIGN, coverCheck, draftCarousel, kindPlan, parseCarousel, retone, sanitizeDesign, toneFor, withCover, DEFAULT_DESIGN,
} from "./carousel";
import { contrast, palette, toneColors } from "./carouselTheme";

const brief = { product: "Ebook de recetas rápidas", who: "Mamás que trabajan", promise: "Cocinar en 20 minutos", price: "US$9" };

const answer = () => JSON.stringify({
  portadas: [
    { titulo: "El error que te roba la *cena*", subtitulo: "Y cómo evitarlo", pastilla: "3 pasos", por_que: "Curiosidad" },
    { titulo: "Cocina *rápido* sin pedir comida", subtitulo: "", pastilla: "guía", por_que: "Beneficio" },
    { titulo: "¿Cenas tarde *otra vez*?", subtitulo: "", pastilla: "guía", por_que: "Pregunta" },
  ],
  recomendada: 2,
  etiquetas: ["Lote", "Domingo 🔥", "Congelar"],
  revelar: ["Cocina en lote", "Congela por porciones", "Ten un plan B"],
  escena: "Una mujer diminuta frente a una olla gigante en el desierto",
  laminas: [
    { tipo: "respuesta", titulo: "Son *estas tres*", texto: "Ninguna pide talento.", puente: "Pero la primera falla siempre" },
    { tipo: "problema", etiqueta: "el error", titulo: "Lo que te *frena*", items: [{ titulo: "Sin plan", texto: "a" }, { titulo: "Sin tiempo", texto: "b" }, { titulo: "Sin ideas", texto: "c" }, { titulo: "de más", texto: "d" }], veredicto: "El plan gana.", puente: "¿Y entonces?" },
    { tipo: "comparacion", peso: "densa", titulo: "La *diferencia*", items: [{ titulo: "débil", texto: "Cocinar cada noche" }, { titulo: "", texto: "Cocinar una vez" }], veredicto: "Una vez basta.", puente: "Así se hace" },
    { tipo: "tarjetas", titulo: "Lo que *necesitas*", items: [{ titulo: "A", texto: "" }, { titulo: "B", texto: "" }], puente: "Ahora el orden" },
    { tipo: "pasos", titulo: "En *3 pasos*", items: [{ titulo: "Uno", texto: "" }], puente: "Y lo que nadie dice" },
    { tipo: "giro", peso: "corta", titulo: "Para que puedas cenar *sin pensar*" },
    { tipo: "llamada", titulo: "¿Lo *quieres*?", texto: "Escríbeme", palabra: "recetas!", items: [{ titulo: "Guárdalo" }] },
  ],
  pie: "Guárdalo para tu próxima cena.",
});

describe("carrusel: estructura", () => {
  it("plan de láminas: portada primero y llamada al final", () => {
    for (const n of [6, 8, 10]) {
      const p = kindPlan(n);
      expect(p).toHaveLength(n);
      expect(p[0]).toBe("portada");
      expect(p[n - 1]).toBe("llamada");
    }
  });
  it("ritmo: portada y lámina 2 son una unidad, el giro va en color de marca y el remate cambia", () => {
    expect(toneFor("portada", 0, "oscuro")).toBe("oscuro");
    expect(toneFor("respuesta", 1, "oscuro")).toBe("oscuro");
    expect(toneFor("problema", 2, "oscuro")).toBe("claro");
    expect(toneFor("tarjetas", 3, "oscuro")).toBe("oscuro");
    expect(toneFor("giro", 5, "oscuro")).toBe("degradado");
    expect(toneFor("llamada", 6, "claro")).toBe("oscuro");
    const d = draftCarousel(brief, 8);
    expect(retone(d.slides, "claro")[0].tone).toBe("claro");
  });
  it("el borrador gratis trae el texto del producto", () => {
    const d = draftCarousel(brief, 6);
    expect(d.slides.map(s => s.kind)).toEqual(["portada", "respuesta", "comparacion", "pasos", "giro", "llamada"]);
    expect(d.slides[0].reveal).toEqual(d.slides[1].reveal);
    expect(d.slides[5].body).toContain("Ebook de recetas rápidas");
  });
});

describe("carrusel: pedido a la IA", () => {
  it("lleva las reglas del manual, el formato JSON y el gancho solo como referencia", () => {
    const p = carouselRequest({ goal: "vender", brief, slides: 8, hook: "Deja de pedir comida" });
    expect(p).toMatch(/Prohibido: promesas de ingresos/);
    expect(p).toMatch(/EL AGARRE \(lámina 2\)/);
    expect(p).toMatch(/GIRO/);
    expect(p).toMatch(/NO copies sus palabras/);
    expect(p).toContain("Ebook de recetas rápidas");
    expect((p.match(/"tipo"/g) ?? []).length).toBe(7);
    expect(p).toMatch(/Para que puedas/);
    expect(p).toMatch(/Nunca empieces acusando/);
  });
  it("desde un texto: incluye el texto de origen y pide no inventar", () => {
    const p = carouselRequest({ goal: "texto", brief, slides: 6, source: "Mi artículo sobre cocinar en lote." });
    expect(p).toContain("Mi artículo sobre cocinar en lote.");
    expect(p).toMatch(/no inventes datos/);
  });
});

describe("carrusel: lectura de la respuesta", () => {
  it("usa la portada recomendada, limpia y respeta los topes", () => {
    const d = parseCarousel("```json\n" + answer() + "\n```", 8)!;
    expect(d.pick).toBe(2);
    expect(d.rec).toBe(2);
    expect(d.slides).toHaveLength(8);
    expect(d.slides[0]).toMatchObject({ kind: "portada", title: "¿Cenas tarde *otra vez*?", tag: "GUÍA", chips: ["Lote", "Domingo", "Congelar"] });
    expect(d.slides[1]).toMatchObject({ kind: "respuesta", bridge: "Pero la primera falla siempre", reveal: ["Cocina en lote", "Congela por porciones", "Ten un plan B"] });
    expect(d.slides[0].reveal).toHaveLength(3);
    expect(d.slides[2].kicker).toBe("EL ERROR");
    expect(d.slides[2].items).toHaveLength(3);
    expect(d.slides[2]).toMatchObject({ verdict: "El plan gana.", bridge: "¿Y entonces?" });
    expect(d.slides[3].items.map(i => i.title)).toEqual(["DÉBIL", "SÍ"]);
    expect(d.slides[6]).toMatchObject({ kind: "giro", tone: "degradado", weight: "corta" });
    expect(d.slides[7]).toMatchObject({ kind: "llamada", cta: "RECETAS", tone: "claro" });
    expect(d.scene).toMatch(/olla gigante/);
    expect(d.caption).toMatch(/Guárdalo/);
  });
  it("devuelve null si no hay JSON útil", () => {
    expect(parseCarousel("lo siento", 7)).toBeNull();
    expect(parseCarousel('{"portadas":[]}', 7)).toBeNull();
  });
  it("cambiar de portada no toca el resto", () => {
    const d = parseCarousel(answer(), 8)!;
    const e = withCover(d, 0);
    expect(e.slides[0].title).toBe("El error que te roba la *cena*");
    expect(e.slides[0].tag).toBe("3 PASOS");
    expect(e.slides.slice(1)).toEqual(d.slides.slice(1));
  });
});

describe("carrusel: chequeo de portada", () => {
  it("aprueba una portada corta con una palabra de color", () => {
    expect(coverCheck("El error que te roba la *cena*").ok).toBe(true);
  });
  it("avisa de promesas de dinero, plazos y portadas largas", () => {
    expect(coverCheck("Gana *dinero* desde casa").ok).toBe(false);
    expect(coverCheck("Aprende a *cocinar* en 7 días").notes.join(" ")).toMatch(/plazos/);
    expect(coverCheck("Esta es una portada demasiado larga para leerse en un *segundo* nada más").notes.join(" ")).toMatch(/palabras/);
  });
  it("separa los tramos de color", () => {
    expect(accentRuns("Hola *mundo* bonito")).toEqual([{ text: "Hola ", accent: false }, { text: "mundo", accent: true }, { text: " bonito", accent: false }]);
  });
});

describe("carrusel: sistema de diseño", () => {
  it("de un color salen fondos que no son blanco ni negro puros", () => {
    const p = palette("#c96442");
    expect(p.lightBg).not.toBe("#ffffff");
    expect(p.darkBg).not.toBe("#000000");
  });
  it("el texto y el acento se leen en los 3 tonos, aun con colores claros", () => {
    for (const brand of ["#c96442", "#e8a33d", "#3d7bf0", "#f5e663"]) {
      const claro = toneColors(brand, "claro");
      expect(contrast(claro.text, claro.bg)).toBeGreaterThanOrEqual(7);
      expect(contrast(claro.accent, claro.bg)).toBeGreaterThanOrEqual(3);
      const oscuro = toneColors(brand, "oscuro");
      expect(contrast(oscuro.text, oscuro.bg)).toBeGreaterThanOrEqual(7);
      expect(contrast(oscuro.accent, oscuro.bg)).toBeGreaterThanOrEqual(4.5);
      const deg = toneColors(brand, "degradado");
      expect(contrast(deg.text, brand)).toBeGreaterThanOrEqual(2.6);
    }
  });
  it("limpia lo guardado: color inválido, estilo raro y @ de más", () => {
    const d = sanitizeDesign({ brand: "red", style: "rara", handle: "@@mi.cuenta!", start: "x" });
    expect(d.brand).toBe(DEFAULT_DESIGN.brand);
    expect(d.style).toBe("editorial");
    expect(d.handle).toBe("mi.cuenta");
    expect(d.start).toBe("oscuro");
  });
});

describe("carrusel: portada póster", () => {
  it("pide la palabra resaltada enorme, el texto exacto y las reglas", () => {
    const d = parseCarousel(answer(), 8)!;
    const p = posterPrompt({ cover: d.slides[0], scene: d.scene, design: ADMIN_DESIGN, brief, aspect: "4:5", rules: "REGLAS", date: new Date(2026, 9, 5) });
    expect(p).toContain("«otra vez» va ENORME");
    expect(p).toContain("«oct 2026»");
    expect(p).toContain("«SUPERNOVA»");
    expect(p).toContain("olla gigante");
    expect(p).toContain("#e8502e");
    expect(p).toMatch(/EXACTAMENTE/);
    expect(p.endsWith("REGLAS")).toBe(true);
  });
});

describe("carrusel: la prueba de la historia", () => {
  it("un carrusel bien armado saca 6 de 6", () => {
    const d = parseCarousel(answer(), 8)!;
    const r = storyTest(d.slides);
    expect(r.filter(x => !x.ok).map(x => x.id)).toEqual([]);
  });
  it("una lista sin agarre, sin tirones y sin palabra clave saca menos de 4", () => {
    const d = parseCarousel(answer(), 8)!;
    const flat = d.slides.map((x, i) => ({ ...x, kind: i === 0 ? x.kind : "tarjetas" as const, bridge: undefined, cta: undefined, tone: "claro" as const, weight: "densa" as const }));
    expect(storyTest(flat).filter(x => x.ok).length).toBeLessThan(4);
  });
  it("mide la lámina 2 contra la portada", () => {
    expect(slideTwoScore(200, 120)).toMatchObject({ pct: 60, level: "fuerte" });
    expect(slideTwoScore(200, 80)).toMatchObject({ pct: 40, level: "normal" });
    expect(slideTwoScore(200, 40)).toMatchObject({ pct: 20, level: "debil" });
    expect(slideTwoScore(0, 10)).toBeNull();
  });
});

import { parseClone, parseReclone, recloneRequest, photoPrompt, brandFromClone } from "./carousel";

const cloneResponse = {
  analisis: {
    resumen: "Cinco reglas para una marca que no se puede copiar", por_que_funciona: "Toma partido y entrega un sistema.",
    laminas: [{ n: 1, posicion: "apertura", composicion: "palabra gigante sobre foto", artefacto: "", idea: "fórmula de marca" }, { n: 2, posicion: "agarre", composicion: "dos columnas", artefacto: "", idea: "lo visible se copia" }],
    estilo: { colores: ["#f26b1d", "#0b0b0b", "#f4efe6"], letra: "sans negra + serifa cursiva", estilo_cercano: "poster", empieza: "claro", fotos: "escenas de cine" },
  },
  adn: [
    { id: "a1", parte: "Portada que toma partido", que_es: "x", importa: true, por_que: "crea deseo" },
    { id: "a2", parte: "Formato Regla N + palabra gigante", que_es: "x", importa: true, por_que: "fácil de seguir" },
    { id: "a3", parte: "Remate con palabra clave", que_es: "x", importa: true, por_que: "conversación" },
    { id: "a4", parte: "Paleta naranja", que_es: "x", importa: false, por_que: "" },
  ],
  mantener: ["a1", "a2", "zz"],
  mejoras: ["Añadimos veredicto en cada regla"],
  carrusel: {
    idea: "El orden gana", portadas: [{ titulo: "Cocina *sin pensar*", subtitulo: "", pastilla: "5 reglas", por_que: "x" }], recomendada: 0, etiquetas: [], escena: "olla gigante en el desierto",
    laminas: [
      { tipo: "respuesta", titulo: "Lo visible se *copia*", texto: "Lo tuyo no.", puente: "Estas son las reglas" },
      { tipo: "regla", pastilla: "Regla 1", titulo: "*lote*", texto: "Cocina una vez.", veredicto: "Una olla, cuatro cenas.", escena: "cocina con ollas", puente: "La segunda" },
      { tipo: "regla", pastilla: "Regla 2", titulo: "*lista*", texto: "Compra con plan.", veredicto: "Sin lista no hay plan.", puente: "Y la clave" },
      { tipo: "giro", titulo: "Para que puedas cenar *sin decidir*" },
      { tipo: "llamada", titulo: "Cenar bien es *orden*", texto: "Te mando los menús.", palabra: "LOTE", items: [{ titulo: "Guárdalo" }] },
    ],
    pie: "x",
  },
  source: { url: "https://www.instagram.com/p/X/", images: ["https://a/1.jpg", "nope"], owner: "growithalex", likes: 270, comments: 207 },
};

describe("carrusel: clonar con ADN ganador", () => {
  it("lee el ADN, mantiene solo ids válidos y arma el borrador con su largo y tipos", () => {
    const r = parseClone(cloneResponse)!;
    expect(r.info.keep).toEqual(["a1", "a2"]);
    expect(r.info.style).toMatchObject({ style: "poster", start: "claro" });
    expect(r.info.source.images).toEqual(["https://a/1.jpg"]);
    expect(r.draft.slides.map(s => s.kind)).toEqual(["portada", "respuesta", "regla", "regla", "giro", "llamada"]);
    expect(r.draft.slides[2]).toMatchObject({ tag: "Regla 1", verdict: "Una olla, cuatro cenas.", scene: "cocina con ollas" });
    expect(r.draft.slides[0].scene).toMatch(/olla gigante/);
    expect(r.draft.slides[5].cta).toBe("LOTE");
  });
  it("re-clonar manda solo el análisis: nada del texto original y las 3 partes elegidas", () => {
    const { info } = parseClone(cloneResponse)!;
    const p = recloneRequest({ info, keep: ["a2", "a3"], brief, goal: "vender" });
    expect(p).toMatch(/MANTIENES[\s\S]*Formato Regla N[\s\S]*Remate con palabra clave[\s\S]*CAMBIAS/);
    expect(p).toMatch(/Nunca copies palabras, fotos, nombres, marcas ni números/);
    expect(p).not.toContain("instagram.com");
    const back = parseReclone(JSON.stringify({ mejoras: ["m"], carrusel: cloneResponse.carrusel }))!;
    expect(back.improvements).toEqual(["m"]);
    expect(back.draft.slides).toHaveLength(6);
  });
  it("la foto de una lámina se pide sin texto y con la escena", () => {
    const { draft } = parseClone(cloneResponse)!;
    const p = photoPrompt({ slide: draft.slides[2], design: ADMIN_DESIGN, brief, aspect: "4:5", card: true, rules: "Personas latinas. Si hay texto, que sea exacto." });
    expect(p).toContain("cocina con ollas");
    expect(p).toMatch(/SIN ningún texto/);
    expect(p).not.toMatch(/Si hay texto/);
  });
  it("el color de marca del original es el más vivo", () => {
    expect(brandFromClone(["#0b0b0b", "#f26b1d", "#f4efe6"])).toBe("#f26b1d");
  });
});

import { sanitizeDesign as sanitize2, signatureLines } from "./carousel";
describe("carrusel: tu firma (lo que no se puede copiar)", () => {
  it("se guarda limpia y llega a la IA y a las fotos", () => {
    const d = sanitize2({ brand: "#e8502e", style: "poster", role: "estratega", world: "una cocina caribeña", line: "Cocina una vez.", receipt: "12.000 seguidores" });
    expect(d).toMatchObject({ role: "estratega", world: "una cocina caribeña", line: "Cocina una vez.", receipt: "12.000 seguidores" });
    expect(signatureLines(d).join(" ")).toMatch(/Cocina una vez[\s\S]*cocina caribeña/);
    expect(carouselRequest({ goal: "vender", brief, slides: 8, ...d })).toContain("MUNDO DE LA MARCA");
    const { draft } = parseClone(cloneResponse)!;
    expect(photoPrompt({ slide: draft.slides[2], design: d, brief, aspect: "4:5", card: false, rules: "R" })).toContain("cocina caribeña");
  });
});
