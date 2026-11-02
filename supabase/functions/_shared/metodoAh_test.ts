// Prueba de metodoAh (funciones puras). Correr: deno test -A supabase/functions/_shared/metodoAh_test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { FINAL, aplicarCambio, cambioPrompt, limpiarPrompt, modeloImagen, parsePlan, planPrompt, prompt6C, promptPersonaje, repartir, soloCambia, type Opciones } from "./metodoAh.ts";

const O: Opciones = { modo: "auto", duracion: 30, voz: "off", plantilla: "libre", conCara: false };
const ESC = (i: number, s = 5) => ({ id: `x${i}`, segundos: s, proposito: "Presenta", voz: "Hola", lugar: "luxury hotel hallway at night", ropa: "black satin mini dress", accion: "walks and glances back at the camera", plano: "medium shot from behind, slight low angle, wide iPhone lens", luz: "direct harsh iPhone flash", movimiento: "two steps forward; handheld follow", transicion: "Corte al ascensor" });
const RAW = JSON.stringify({
  titulo: "Noche de lujo", modo: "A", estilo: "",
  brief: { publico: "mujeres 20-30", plataforma: "Reels", angulo: "aspiracional", gancho: "mirada atrás", final: "risa", novedad: "flash" },
  personaje: { nombre: "Lia", edad: 16, genero: "woman", cara: "soft oval face", ojos: "almond brown eyes", pelo: "long dark brown hair", piel: "warm olive skin with pores", rasgos: "subtle freckles", cuerpo: "slim", gestos: "relaxed", ropa_base: "black satin mini dress", anclas: ["freckles on nose", "dark brown hair"] },
  escenas: [ESC(1, 4), ESC(2, 6), ESC(3, 5), ESC(4, 5), ESC(5, 5), ESC(6, 5)],
});

Deno.test("reparte las duraciones: suma exacta y 3–8 s por escena", () => {
  for (const [total, n] of [[15, 4], [30, 6], [45, 9]] as const) {
    const r = repartir([10, 1, 4, 4, 4, 4, 4, 4, 4].slice(0, n), total);
    assertEquals(r.reduce((a, b) => a + b, 0), total);
    assert(r.every((s) => s >= 3 && s <= 8), String(r));
  }
  // si no caben (7 × 3 s > 15 s) la suma se respeta igual
  assertEquals(repartir([4, 4, 4, 4, 4, 4, 4], 15).reduce((a, b) => a + b, 0), 15);
});

Deno.test("el plan se valida: ids nuevos, suma = duración, protagonista adulto", () => {
  const p = parsePlan(RAW, O);
  assert(!("error" in p));
  assertEquals(p.escenas.map((e) => e.id), ["S01", "S02", "S03", "S04", "S05", "S06"]);
  assertEquals(p.escenas.reduce((a, e) => a + e.segundos, 0), 30);
  assertEquals(p.personaje.edad, 18);
  assertEquals(p.modo, "A");
});

Deno.test("sin voz, las escenas no llevan texto hablado", () => {
  const p = parsePlan(RAW, { ...O, voz: "ninguna" });
  assert(!("error" in p) && p.escenas.every((e) => e.voz === ""));
});

Deno.test("plan inválido o sin datos visuales → error en español", () => {
  assert("error" in parsePlan("no es json", O));
  assert("error" in parsePlan(JSON.stringify({ escenas: [{ lugar: "x" }, {}, {}, {}, {}] }), O));
});

Deno.test("todo prompt termina en el final obligatorio y sin palabras prohibidas", () => {
  const p = parsePlan(RAW, O);
  assert(!("error" in p));
  for (const s of [promptPersonaje(p, false), ...p.escenas.map((e) => prompt6C(p, e, false)), limpiarPrompt("A hyperrealistic AI-generated CGI render of a cat. No text, no watermark, no distortion.")]) {
    assert(s.endsWith(FINAL), s);
    assertEquals(s.split(FINAL).length, 2, "el final no se repite");
    assert(!/hyper-?realistic|ai-generated|\bcgi\b|\brender/i.test(s), s);
  }
});

Deno.test("los 6 bloques del método están en el prompt de cada escena", () => {
  const p = parsePlan(RAW, O);
  assert(!("error" in p));
  const s = prompt6C(p, p.escenas[0], false);
  for (const trozo of ["iPhone photo, medium shot", "direct harsh iPhone flash", "Lia, a 18-year-old woman", "Wearing black satin mini dress", "luxury hotel hallway", "model-level", "visible pores", "freckles on nose"]) assert(s.includes(trozo), trozo);
});

Deno.test("con la cara de la persona no se inventa su cara", () => {
  const p = parsePlan(RAW, { ...O, conCara: true });
  assert(!("error" in p));
  const s = prompt6C(p, p.escenas[0], true);
  assert(s.includes("exact same person as the reference photo"));
  assert(!s.includes("soft oval face"));
});

Deno.test("cambiar solo la ropa congela todo lo demás", () => {
  const p = parsePlan(RAW, O);
  assert(!("error" in p));
  const e = p.escenas[2];
  assert(cambioPrompt(e, "ropa", "algo rojo").includes('campo "ropa"'));
  const n = aplicarCambio(e, "ropa", JSON.stringify({ valor: "red silk slip dress with gold hoops" }));
  assert(!("error" in n));
  assertEquals(n.ropa, "red silk slip dress with gold hoops");
  assertEquals({ ...n, ropa: e.ropa }, e);
  assert(soloCambia("ropa").includes("change ONLY the outfit"));
  assert("error" in aplicarCambio(e, "luz", "{}"));
});

Deno.test("modelo de imagen según el catálogo AH y guía de plantilla en el prompt", () => {
  assertEquals(modeloImagen("A"), "gpt-image-2");
  assertEquals(modeloImagen("B"), "gpt-image-2");
  assertEquals(modeloImagen("C"), "nano-banana-pro");
  assert(planPrompt("una idea", { ...O, plantilla: "monologo" }).includes("Monólogo que vende"));
  assert(planPrompt("una idea", { ...O, duracion: 15 }).includes("entre 3 y 4 escenas"));
});
