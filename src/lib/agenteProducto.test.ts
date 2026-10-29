import { describe, expect, it } from "vitest";
import {
  ajustesFinales, armarPlan, contarRecetas, deducir, instruccionesParte, interpretarAjuste, notasIndice, otroEnfoque,
  pedidoIndice, precioSugerido, preguntasPendientes, promesaHonesta, recetasEscritas, recetasPorCapitulo, textoPaginaVenta,
  textoWhatsApp, MAX_PREGUNTAS, MAX_RECETAS, type Contexto,
} from "./agenteProducto";

// Caso guía: docs/propuestas/2026-10-29-lanzamiento-whatsapp.md
const dulce: Contexto = {
  nombre: "Dulce Sin Fuego",
  producto: "Recetario PDF de 60 rellenos y postres sin estufa ni horno, edición Navidad",
  paraQuien: "Mujeres que hacen dulces en casa y quieren venderlos por WhatsApp",
  promesa: "Haz rellenos y postres sin fuego: mezclas, enfrías y listo",
  precio: "US$1,99", priceAmount: 1.99, priceCurrency: "USD", prueba: "",
  oferta: null, voz: "", pais: "DO",
};

const vacio: Contexto = {
  nombre: "Mi producto", producto: "Algo que ayuda", paraQuien: "Gente", promesa: "Mejorar",
  precio: "", priceAmount: null, priceCurrency: null, prueba: "", oferta: null, voz: "", pais: null,
};

describe("Agente de producto · lo que ya sabe", () => {
  it("Dulce Sin Fuego: deduce recetario y 60 recetas sin preguntar", () => {
    const { valores, razones } = deducir(dulce);
    expect(valores.genero).toBe("recetario");
    expect(valores.recetas).toBe(60);
    expect(valores.largo).toBe("normal");
    expect(razones.genero).toBeTruthy();
    const preguntas = preguntasPendientes(dulce, valores).map(p => p.id);
    expect(preguntas).not.toContain("genero");
    expect(preguntas).not.toContain("largo");
    expect(preguntas).toEqual(["nivel", "tono"]);
  });

  it("con la voz del ADN no pregunta el tono", () => {
    const { valores } = deducir({ ...dulce, voz: "Directo y con humor; nada de sonar a vendedor." });
    expect(valores.tono).toBe("cercano");
    expect(preguntasPendientes(dulce, valores).map(p => p.id)).not.toContain("tono");
    expect(deducir({ ...dulce, voz: "Formal y profesional, sin bromas" }).valores.tono).toBe("limpio");
  });

  it("nunca hace más de 4 preguntas y cada una trae su recomendada entre las opciones", () => {
    const ps = preguntasPendientes(vacio, deducir(vacio).valores);
    expect(ps.length).toBeLessThanOrEqual(MAX_PREGUNTAS);
    expect(ps.length).toBe(4);
    for (const p of ps) expect(p.opciones.map(o => o.id)).toContain(p.recomendada);
  });

  it("'Decide tú' en todo: valores sensatos, nada vacío", () => {
    const a = ajustesFinales(deducir(vacio).valores, {});
    expect(a).toMatchObject({ genero: "guia", nivel: "principiante", largo: "normal", tono: "cercano" });
  });

  it("detecta el nivel por la ficha", () => {
    expect(deducir({ ...vacio, paraQuien: "Personas que empiezan desde cero" }).valores.nivel).toBe("principiante");
  });
});

describe("Agente de producto · lo que le pide al constructor", () => {
  const a = ajustesFinales(deducir(dulce).valores, { nivel: "principiante", tono: "cercano" });

  it("recetario = ebook con género, 60 recetas en 7 capítulos", () => {
    expect(pedidoIndice(a)).toEqual({ format: "ebook", size: "normal", tone: "cercano", genre: "recetario" });
    expect(recetasPorCapitulo(a)).toBe(9);
  });

  it("las notas caben en el tope del servidor (500)", () => {
    const largo = { ...a, extras: Array.from({ length: 20 }, (_, i) => `pedido número ${i} con bastante texto para llenar`) };
    const n = notasIndice(largo, { ...dulce, voz: "x".repeat(400), oferta: { nombre: "y".repeat(200), precioUsd: 1.85 } });
    expect(n.length).toBeLessThanOrEqual(500);
    expect(n).toContain("pedido número 19");
  });

  it("indicaciones por capítulo de recetario dicen cuántas recetas y caben en 500", () => {
    const t = instruccionesParte(a, { kind: "capitulo" });
    expect(t).toContain("9 recetas");
    expect(t.length).toBeLessThanOrEqual(500);
    expect(otroEnfoque(t).length).toBeLessThanOrEqual(500);
  });
});

describe("Agente de producto · precio por ticket del nicho", () => {
  it("usa el precio de la ficha y lo pasa a la moneda del país", () => {
    const p = precioSugerido("recetario", dulce);
    expect(p.texto).toBe("US$1,99");
    expect(p.local).toBe("≈ RD$120");
  });
  it("la oferta modelada manda: mismo ticket, sin inventar", () => {
    const p = precioSugerido("recetario", { ...dulce, oferta: { nombre: "Doces sem fogo", precioUsd: 1.85 } });
    expect(p.monto).toBe(1.85);
    expect(p.razon).toMatch(/oferta que modelas/);
  });
  it("sin precio: el ticket típico del tipo de producto", () => {
    expect(precioSugerido("curso", vacio).monto).toBe(27);
    expect(precioSugerido("recetario", vacio).local).toBeNull();
  });
});

describe("Agente de producto · ajustes en una línea", () => {
  const base = ajustesFinales({ genero: "recetario", recetas: 60, largo: "normal" }, {});

  it("'hazlo más corto' baja recetas y rehace el índice", () => {
    const r = interpretarAjuste("hazlo más corto", base);
    expect(r.rehacer).toBe(true);
    expect(r.ajustes.recetas).toBe(40);
  });
  it("'agrega 10 recetas veganas' suma (con tope) y deja el pedido", () => {
    const r = interpretarAjuste("agrega 10 recetas veganas", base);
    expect(r.ajustes.recetas).toBe(MAX_RECETAS);
    expect(r.ajustes.extras.join(" ")).toContain("veganas");
    const r2 = interpretarAjuste("agrega 10 recetas veganas", r.ajustes);
    expect(r2.ajustes.recetas).toBe(MAX_RECETAS);
    expect(r2.respuesta).toContain("tope");
  });
  it("título y precio no rehacen el índice", () => {
    expect(interpretarAjuste("llámalo «Dulces de Navidad sin horno»", base)).toMatchObject({ rehacer: false, titulo: "Dulces de Navidad sin horno" });
    expect(interpretarAjuste("cóbralo a 4,99", base)).toMatchObject({ rehacer: false, precio: 4.99 });
  });
  it("tono y tipo de producto", () => {
    expect(interpretarAjuste("más formal", base)).toMatchObject({ rehacer: false, tono: "limpio" });
    expect(interpretarAjuste("hazlo un mini curso", base).ajustes.genero).toBe("curso");
  });
  it("cualquier otra cosa se toma como pedido", () => {
    const r = interpretarAjuste("que tenga un capítulo de empaques bonitos", base);
    expect(r.rehacer).toBe(true);
    expect(r.ajustes.extras).toContain("que tenga un capítulo de empaques bonitos");
  });
});

describe("Agente de producto · plan y textos de venta", () => {
  const a = ajustesFinales({ genero: "recetario", recetas: 60, largo: "normal" }, {});
  const piezas = [
    ...Array.from({ length: 7 }, (_, i) => ({ idx: i, kind: "capitulo" as const, module: null, title: `Categoría ${i + 1}`, brief: "" })),
    { idx: 7, kind: "bono" as const, module: null, title: "Lista de compras", brief: "" },
  ];

  it("plan con qué incluye, bono y precio", () => {
    const plan = armarPlan({ titulo: "Dulce Sin Fuego", subtitulo: "60 rellenos y postres sin horno", piezas, ajustes: a, ctx: dulce });
    expect(plan.incluye[0]).toBe("60 recetas paso a paso en 7 categorías");
    expect(plan.incluye).toContain("Bono: Lista de compras");
    expect(plan.precio.texto).toBe("US$1,99");
  });

  it("los textos de venta dicen las recetas que de verdad trae", () => {
    const plan = armarPlan({ titulo: "Dulce Sin Fuego", subtitulo: null, piezas, ajustes: a, ctx: dulce, recetasReales: 54 });
    const wa = textoWhatsApp(plan, dulce);
    expect(wa).toContain("54 recetas");
    expect(wa).toContain("US$1,99");
    expect(wa).toContain("RD$120");
    expect(textoPaginaVenta(plan, dulce)).toContain("54 recetas");
  });

  it("garantía solo si la ficha tiene una de verdad", () => {
    const plan = armarPlan({ titulo: "X", subtitulo: null, piezas, ajustes: a, ctx: dulce });
    expect(textoPaginaVenta(plan, dulce)).not.toMatch(/garant/i);
    const conGarantia = { ...dulce, prueba: "Si no te sirve, te devuelvo tu dinero en 7 días." };
    expect(textoWhatsApp(plan, conGarantia)).toContain("te devuelvo tu dinero");
  });

  it("la promesa se redacta como lo que enseña (nunca un resultado de salud)", () => {
    expect(promesaHonesta("Baja de peso con estos postres", "Dulces")).toMatch(/^Aprende paso a paso/);
    expect(promesaHonesta("Haz rellenos sin fuego", "Dulces")).toBe("Haz rellenos sin fuego");
  });

  it("cuenta recetas por '### nombre' y no las secciones", () => {
    const md = "## Rellenos\n### Relleno de coco\n**Rinde:** 1 torta\n### Ingredientes\n### Trufas de galleta\n";
    expect(contarRecetas(md)).toBe(2);
    expect(recetasEscritas([{ kind: "capitulo", content: md }, { kind: "bono", content: "### Lista" }], a)).toBe(2);
    expect(recetasEscritas([{ kind: "capitulo", content: md }], { genero: "guia" })).toBeNull();
  });
});
