/**
 * R2-15 · Reglas del manual en los textos que ve la persona (12-oct-2026).
 * Barrido de src/pages y src/components (+ tarjetas de src/lib/tools.ts) con el compilador de TypeScript
 * (src/test/visibleText.ts): solo texto JSX y frases entre comillas, nunca comentarios ni claves internas.
 *
 * Reglas (supernova/CLAUDE.md y memoria "Decir modelar"):
 *  - nunca "clonar / clona / clonamos…" (se dice "modelar" o "hacer tu versión");
 *  - español latino: nada de "vídeo", "móvil", "ordenador" ni voseo;
 *  - al cliente nunca cuántos dólares vale un crédito;
 *  - sin promesas: "gana US$X", resultados con plazo ("vende … en 30 días"), "garantizado".
 * Las pantallas de admin (solo Jean) no cuentan, salvo las plantillas de correo que reciben los clientes.
 * Falsos positivos → ALLOW con motivo. Fallos reales conocidos → it.fails con su dueño (ver reporte).
 */
import { describe, expect, it } from "vitest";
import path from "node:path";
import { appFiles, projectRoot, visibleStrings, type VisibleString } from "./visibleText";

const L = "(?<!\\p{L})";
const R = "(?!\\p{L})";
const RULES: Record<string, RegExp> = {
  clonar: new RegExp(`${L}cl[oó]n(ar|a|amos|as|e|en|es|ado|ada|ados|adas|aci[oó]n|ala|alo|alos|alas|arlo|arla|an)${R}`, "iu"),
  "vídeo": new RegExp(`${L}vídeos?${R}`, "iu"),
  "móvil": new RegExp(`${L}móvil(es)?${R}`, "iu"),
  ordenador: new RegExp(`${L}ordenador(es)?${R}`, "iu"),
  // Solo formas que únicamente existen con voseo ("escribí"/"elegí" también son primera persona: fuera).
  voseo: new RegExp(`${L}(vos|sos|tenés|podés|querés|sabés|hacés|necesitás|tocá|probá|mirá|pegá|creá|usá|descargá|hacé|andá|vení|fijate|decime|contame)${R}`, "iu"),
  "dólares por crédito": /(por|cada|1|un)\s+cr[ée]dito[^.\n]{0,20}(US\$|\$|d[óo]lar)|(US\$|\$)\s*[\d.,]+\s*(por|el|cada|\/)\s*cr[ée]dito|cr[ée]dito\s*=\s*(US\$|\$)/iu,
  "gana dinero": new RegExp(`${L}gan(a|ar|ás|as|arás|aras|e|es|ará|aría|arías)${R}\\s+(hasta\\s+)?(US\\$|\\$|\\d[\\d.,]*\\s*(d[óo]lares|pesos|usd|mil)${R}|dinero|plata|miles)`, "iu"),
  "resultado con plazo": new RegExp(`${L}(gan\\p{L}*|vend\\p{L}*|factur\\p{L}*|baj\\p{L}*|pierd\\p{L}*|adelgaz\\p{L}*|corrig\\p{L}*|resultados?|clientes|ventas|ingresos)${R}[^.\\n]{0,40}\\b(en|desde)\\s+(solo\\s+|s[óo]lo\\s+|unos\\s+|menos\\s+de\\s+)?(\\d+|el\\s+primer)\\s+(d[íi]as?|semanas?|horas?)`, "iu"),
  garantizado: /garantizad[oa]s?|garantizamos|te garantiz/iu,
};
// Una prohibición ("nada de ingresos garantizados", "Ningún texto garantiza", "nunca \"clonar\"") no rompe la regla.
const NEGATED = /(nunca|ning[úu]n[oa]?|nada de|sin|ni|no)\s+(["'“«]?\p{L}+["'”»,]?\s+){0,6}["'“«]?$/iu;

/** Falsos positivos revisados a mano: archivo + trozo + motivo. */
const ALLOW: { file: string; text: RegExp; why: string }[] = [];

/** Fallos reales a la fecha (12-oct-2026): siguen en el reporte con su dueño y su arreglo. */
const KNOWN: { rule: string; file: string; text: RegExp; owner: string }[] = [
];

const ADMIN = /src\/(pages|components)\/admin\//;
const files = [...appFiles(), path.join(projectRoot, "src/lib/tools.ts")];
const all: VisibleString[] = files.flatMap(f => visibleStrings(f)).filter(s => {
  if (!ADMIN.test(s.file)) return true;
  // De admin solo cuentan las plantillas de correo (las lee el cliente en su bandeja).
  return /AdminMensajes\.tsx$/.test(s.file) && /\{\{nombre\}\}/.test(s.text);
});

function hits(rule: string): VisibleString[] {
  const re = RULES[rule];
  return all.filter(s => {
    const m = s.text.match(re);
    if (!m) return false;
    if (["garantizado", "gana dinero", "clonar"].includes(rule) && NEGATED.test(s.text.slice(Math.max(0, m.index! - 80), m.index!))) return false;
    return !ALLOW.some(a => s.file === a.file && a.text.test(s.text));
  });
}
const show = (h: VisibleString[], rule: string) => h.map(x => { const m = x.text.match(RULES[rule])!; return `${x.file}:${x.line} …${x.text.slice(Math.max(0, m.index! - 50), m.index! + 60)}…`; });
const isKnown = (rule: string) => (s: VisibleString) => KNOWN.some(k => k.rule === rule && k.file === s.file && k.text.test(s.text));

describe("R2 · manual en los textos visibles", () => {
  it("el barrido lee de verdad la app (cientos de textos, sin comentarios)", () => {
    expect(all.length).toBeGreaterThan(1500);
    expect(all.some(s => /Hacer mi versi[óo]n/.test(s.text))).toBe(true);
    expect(all.every(s => !/^\s*(\/\/|\/\*)/.test(s.text))).toBe(true);
  });

  for (const rule of Object.keys(RULES)) {
    it(`sin "${rule}" nuevo en lo que ve la persona`, () => {
      expect(show(hits(rule).filter(s => !isKnown(rule)(s)), rule)).toEqual([]);
    });
  }

  it("el barrido detecta lo que debe detectar (prueba de la red)", () => {
    const t = (rule: string, s: string) => RULES[rule].test(s);
    expect(t("clonar", "Clónala en 3 toques")).toBe(true);
    expect(t("clonar", "carrusel-clon")).toBe(false);
    expect(t("vídeo", "Mira el vídeo")).toBe(true);
    expect(t("vídeo", "Mira el video")).toBe(false);
    expect(t("voseo", "Tocá el botón")).toBe(true);
    expect(t("voseo", "Toca el botón")).toBe(false);
    expect(t("dólares por crédito", "Cada crédito vale US$0,01")).toBe(true);
    expect(t("dólares por crédito", "2.000 créditos por US$20")).toBe(false);
    expect(t("gana dinero", "Gana US$500 al mes")).toBe(true);
    expect(t("gana dinero", "Ganar 50 créditos")).toBe(false);
    expect(t("resultado con plazo", "Vende tus primeros 10 cursos en 7 días")).toBe(true);
    expect(t("resultado con plazo", "si no terminas tu producto en 30 días, te devolvemos el 100 %")).toBe(false);
  });

  // Fallo real (12-oct-2026). Dueño probable: agente de lenguaje / correos. Las plantillas de correo de
  // Admin → Mensajes (las recibe el cliente) dicen "Clónala en 3 toques", "elige una oferta que ya vende
  // y clónala" y "la forma de clonar una en 3 toques". Arreglo: "Modélala" / "haz tu versión".
  it("correos a clientes sin 'clonar' (AdminMensajes)", () => {
    expect(show(hits("clonar").filter(s => /AdminMensajes/.test(s.file)), "clonar")).toEqual([]);
  });

  // Fallo real (12-oct-2026). Dueño probable: Plan de lanzamiento / ética de textos. El paso "Tu promesa"
  // enseña a escribir resultado + plazo: hint "qué consigue la persona y en cuánto tiempo", ejemplos
  // "Haz y vende tus primeros postres en 30 días" y "Corrige tu postura sin esfuerzo desde el primer día"
  // (resultado físico). El manual prohíbe prometer resultados, salud o plazos.
  it("el Plan de lanzamiento no enseña promesas con plazo", () => {
    expect(show(hits("resultado con plazo").filter(s => /LaunchPlanPage/.test(s.file)), "resultado con plazo")).toEqual([]);
  });
});
