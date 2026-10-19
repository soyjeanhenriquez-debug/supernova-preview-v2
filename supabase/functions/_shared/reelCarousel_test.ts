// Prueba de reelCarousel (funciones puras). Correr: deno test -A supabase/functions/_shared/reelCarousel_test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { cleanBase } from "./reelLayers.ts";
import { asCarouselMode, cleanReelCarousel, nivelFromBody, promptC, reelAnalisis, slidesFor, storedMode } from "./reelCarousel.ts";

const BASE = cleanBase({
  idioma: "es", duracion_s: 40, resumen: "Siete números que todo dueño de negocio debe conocer.",
  transcripcion: [
    { s: 0, texto: "Solo hay 7 números que todo CEO debería conocer." },
    { s: 4, texto: "Uno: cuánto te cuesta conseguir un cliente." },
    { s: 12, texto: "Dos: cuánto te deja cada cliente." },
    { s: 30, texto: "Comenta SCORECARD y te mando la plantilla." },
  ],
  gancho: { se_ve: "Plano medio", se_dice: "Solo hay 7 números", texto_pantalla: "7 números de CEO", por_que: "Lista cerrada con cifra" },
  estructura: [
    { inicio: 0, fin: 4, funcion: "gancho", etiqueta: "Lista cerrada", que_pasa: "Promete 7 números", se_ve: "Plano medio" },
    { inicio: 4, fin: 12, funcion: "fundamento", etiqueta: "Número 1", que_pasa: "Costo por cliente", se_ve: "Texto en pantalla" },
    { inicio: 12, fin: 30, funcion: "fundamento", etiqueta: "Número 2", que_pasa: "Valor de cada cliente", se_ve: "Texto en pantalla" },
    { inicio: 30, fin: 40, funcion: "cta", etiqueta: "Plantilla", que_pasa: "Pide comentar la palabra", se_ve: "Señala abajo" },
  ],
  formula_gancho: "lista cerrada + cifra", mecanismo: "Curiosidad por completar la lista.", claves: ["Lista", "Ritmo", "Regalo"],
  cta: { tipo: "comentar palabra", palabra: "scorecard" }, debilidades: ["Muy rápido"],
})!;

const BRIEF = { handle: "jean", world: "", line: "" };

Deno.test("cuántas láminas: una por idea, entre 4 y 9", () => {
  assertEquals(slidesFor(BASE), 4); // 3 ideas → mínimo 4
});

Deno.test("el prompt lleva los tramos con lo que dice cada uno y el modo pedido", () => {
  const tema = promptC(BASE, "espejo", BRIEF, "CTX");
  assert(tema.includes("1. 0–4 s · gancho (Lista cerrada)"));
  assert(tema.includes("Dice: «Uno: cuánto te cuesta conseguir un cliente.»"));
  assert(tema.includes("ESPEJO (95 % de fidelidad creativa)"));
  assert(tema.includes("NO a las palabras"));
  assert(!tema.includes("9 de cada 10 palabras"));
  assert(tema.includes("Palabra clave del remate: SCORECARD"));
  assert(tema.includes("CTX"));
  const prod = promptC(BASE, "adaptacion", BRIEF, "OFERTA: Curso de finanzas");
  assert(prod.includes("TU VERSIÓN · VENDER"));
  assert(prod.includes("Curso de finanzas"));
  assert(!prod.includes("ESPEJO (95 %"));
  assert(promptC(BASE, "recrear", BRIEF, "").includes("RECREAR (75 %)"));
  assert(promptC(BASE, "inspiracion", BRIEF, "").includes("REINVENTAR (50 %)"));
});

Deno.test("modos del carrusel: pedidos viejos y lo que se guarda en la base", () => {
  assertEquals(nivelFromBody({ mode: "producto" }), "adaptacion");
  assertEquals(nivelFromBody({ mode: "tema" }), "espejo");
  assertEquals(nivelFromBody({ nivel: "recrear", mode: "producto" }), "recrear");
  assertEquals(storedMode("adaptacion"), "producto");
  assertEquals(storedMode("inspiracion"), "tema");
});

Deno.test("el análisis de referencia sale del Reel, no de la IA", () => {
  const a = reelAnalisis(BASE);
  assertEquals(a.laminas.length, 4);
  assertEquals(a.laminas[1], { n: 2, posicion: "fundamento", composicion: "Texto en pantalla", artefacto: "Número 1", idea: "Costo por cliente" });
  assertEquals(a.gancho_original, "7 números de CEO");
  assertEquals(a.estilo.colores, []);
});

Deno.test("limpia la respuesta: tipos válidos, 'original' dentro de rango y la última es llamada", () => {
  const out = cleanReelCarousel({
    convertible: { nivel: "ALTO", por_que: "Es una lista" },
    adn: [{ id: "a1", parte: "Lista cerrada", importa: true }, { id: "a2", parte: "Regalo" }],
    mantener: ["a1", "a9"], mejoras: ["Una idea por lámina"], necesitas: ["Prepara la plantilla"],
    carrusel: {
      portadas: [{ titulo: "7 números de dueño" }, { titulo: "" }], recomendada: 5,
      laminas: [
        { tipo: "respuesta", titulo: "Son estos 7", original: 2 },
        { tipo: "inventado", titulo: "Costo por cliente", original: 99 },
        { tipo: "tarjetas", titulo: "Valor de cada cliente", original: 3 },
        { tipo: "solucion", titulo: "Comenta", palabra: "plantilla!", original: 4 },
        { tipo: "tarjetas", titulo: "", texto: "", items: [] },
      ],
    },
  }, BASE);
  assert(out);
  assertEquals(out.convertible.nivel, "alto");
  assertEquals(out.carrusel.portadas.length, 1);
  assertEquals(out.carrusel.recomendada, 0);
  assertEquals(out.carrusel.laminas.length, 4); // la vacía se descarta
  assertEquals(out.carrusel.laminas[1].tipo, "tarjetas");
  assertEquals(out.carrusel.laminas[1].original, 0);
  assertEquals(out.carrusel.laminas[3].tipo, "llamada");
  assertEquals(out.carrusel.laminas[3].palabra, "PLANTILLA");
  assertEquals(out.mantener, ["a1"]);
  assertEquals(out.analisis.laminas.length, 4);
});

Deno.test("sin portada o con menos de 3 láminas no sirve", () => {
  assertEquals(cleanReelCarousel({ carrusel: { portadas: [], laminas: [{ titulo: "a" }, { titulo: "b" }, { titulo: "c" }] } }, BASE), null);
  assertEquals(cleanReelCarousel({ carrusel: { portadas: [{ titulo: "x" }], laminas: [{ titulo: "a" }] } }, BASE), null);
});

Deno.test("modo: solo 'producto' cambia; lo demás es 'tema'", () => {
  assertEquals(asCarouselMode("producto"), "producto");
  assertEquals(asCarouselMode("raro"), "tema");
});
