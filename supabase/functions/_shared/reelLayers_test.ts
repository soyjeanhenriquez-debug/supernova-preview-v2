// Prueba de reelLayers (funciones puras). Correr: deno test -A supabase/functions/_shared/reelLayers_test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { asNivel, cleanBase, cleanVersion, palabraClave, porQue, promptA, promptB, tramoTexts } from "./reelLayers.ts";

const BASE_IA = {
  idioma: "es", duracion_s: 88, resumen: "Advierte que quedan pocas semanas del año.",
  transcripcion: [{ s: 0, texto: "Faltan dos meses y medio para que acabe el año." }],
  gancho: { se_ve: "Sentado frente a la cámara", se_dice: "Faltan dos meses", texto_pantalla: "¡Faltan 2 meses!", por_que: "Urgencia de fin de año" },
  estructura: [
    { inicio: 0, fin: 7, funcion: "gancho", etiqueta: "Cuenta regresiva", que_pasa: "Muestra cuánto queda del año", se_ve: "Plano medio" },
    { inicio: 7, fin: 20, funcion: "problema", etiqueta: "Aplazar", que_pasa: "Describe la costumbre de aplazar", se_ve: "Mismo plano" },
  ],
  formula_gancho: "cuenta regresiva + reproche", mecanismo: "Miedo a repetir el año", claves: ["Ancla de fin de año", "Tono directo", "x"],
  cta: { tipo: "enlace", palabra: "activate!" }, debilidades: ["Muy largo", "Sin cortes"],
};

Deno.test("cleanBase deja la forma pactada y limpia la palabra del CTA", () => {
  const b = cleanBase(BASE_IA)!;
  assertEquals(b.estructura.length, 2);
  assertEquals(b.cta.palabra, "ACTIVATE");
  assertEquals(b.duracion_s, 88);
  assertEquals(porQue(b).timeline[0], { inicio: 0, fin: 7, etiqueta: "Cuenta regresiva", descripcion: "Muestra cuánto queda del año", se_ve: "Plano medio" });
});

Deno.test("cleanBase rechaza un análisis sin estructura", () => {
  assertEquals(cleanBase({ resumen: "algo" }), null);
  assertEquals(cleanBase(null), null);
});

Deno.test("palabraClave: una sola palabra en mayúsculas, con tildes y Ñ", () => {
  assertEquals(palabraClave("quiero año"), "QUIEROAÑO");
  assertEquals(palabraClave("grupo"), "GRUPO");
  assertEquals(palabraClave(42), "");
});

Deno.test("asNivel usa Adaptación por defecto", () => {
  assertEquals(asNivel("espejo"), "espejo");
  assertEquals(asNivel("calco"), "adaptacion");
  assertEquals(asNivel(undefined), "adaptacion");
});

Deno.test("la capa A no lleva nada del usuario (sirve para todas las cuentas)", () => {
  const p = promptA({ caption: "hola", owner: "alguien", views: 10, likes: 1, comments: 0, seconds: 30 });
  assert(!/Producto:|Su cuenta/.test(p));
  assert(p.includes('"formula_gancho"'));
});

Deno.test("la capa B lleva las reglas del nivel, el producto y la palabra clave", () => {
  const b = cleanBase(BASE_IA)!;
  const p = promptB(b, "espejo", { product: "Muscle Booster", who: "hombres ocupados", nicho: "", oferta: "", palabra: "", handle: "" });
  assert(p.includes("NIVEL ESPEJO"));
  assert(p.includes("Producto: Muscle Booster"));
  assert(p.includes("Palabra clave del cierre: ACTIVATE"));
  const q = promptB(b, "inspiracion", { product: "", who: "", nicho: "", oferta: "", palabra: "VIP", handle: "" });
  assert(q.includes("NIVEL INSPIRACIÓN") && q.includes("Palabra clave del cierre: VIP"));
});

Deno.test("cleanVersion: guion válido, 'original' dentro de rango y hashtags con #", () => {
  const v = cleanVersion({
    ganchos: ["A", "B", "C", "D"],
    guion: [{ inicio: 0, fin: 5, dices: "Hola", se_ve: "x", texto_pantalla: "y", original: 1 }, { inicio: 5, fin: 9, dices: "Chao", original: 7 }, { dices: "" }],
    cierre: "Comenta GRUPO", publicar: { copy: "Texto", palabra_clave: "grupo", hashtags: ["fitness", "#rutina"], comentario_fijado: "Te mando la guía" },
    ideas: [{ titulo: "no aplica" }],
  }, "espejo", "", 2)!;
  assertEquals(v.ganchos.length, 3);
  assertEquals(v.guion.length, 2);
  assertEquals(v.guion[0].original, 1);
  assertEquals(v.guion[1].original, null);
  assertEquals(v.publicar.hashtags, ["#fitness", "#rutina"]);
  assertEquals(v.publicar.palabra_clave, "GRUPO");
  assertEquals(v.ideas, []);
});

Deno.test("cleanVersion: sin guion no hay versión; en Inspiración guarda las ideas", () => {
  assertEquals(cleanVersion({ ganchos: ["a"] }, "adaptacion", "", 2), null);
  const v = cleanVersion({ guion: [{ dices: "x", original: 0 }], ideas: [{ titulo: "Idea 1", por_que: "p" }] }, "inspiracion", "", 2)!;
  assertEquals(v.ideas.length, 1);
  assertEquals(v.guion[0].original, null);
  assertEquals(v.publicar.palabra_clave, "GRUPO");
});

Deno.test("Espejo: cada tramo lleva lo que dice el original y la regla de 9 de cada 10 palabras", () => {
  const b = cleanBase({ ...BASE_IA, transcripcion: [{ s: 0, texto: "Faltan dos meses." }, { s: 3, texto: "Actívate." }, { s: 8, texto: "Siempre lo dejas para enero." }] })!;
  assertEquals(tramoTexts(b), ["Faltan dos meses. Actívate.", "Siempre lo dejas para enero."]);
  const p = promptB(b, "espejo", { product: "SUPERNOVA", who: "", nicho: "", oferta: "", palabra: "NOVA", handle: "" });
  assert(p.includes("Dice: «Faltan dos meses. Actívate.»"));
  assert(p.includes("9 de cada 10 palabras"));
  assert(p.includes("es la BASE de tu versión"));
  assert(!promptB(b, "adaptacion", { product: "", who: "", nicho: "", oferta: "", palabra: "", handle: "" }).includes("Dice: «"));
});
