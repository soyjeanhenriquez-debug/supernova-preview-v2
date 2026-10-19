import { describe, expect, it, vi } from "vitest";
import { cleanBase, promptB, type BriefB } from "../../supabase/functions/_shared/reelLayers";
import { writeReelVersion, type QaInput } from "../../supabase/functions/_shared/reelVersion";
import { PUNTOS } from "../../supabase/functions/_shared/contentQa";

/**
 * ESPEJO = fidelidad creativa (Jean, 19-oct-2026). Ya no hay mínimo del 90 % de texto: la versión pasa
 * por chequeos fijos y una revisión semántica; una falla crítica permite UNA corrección y, si sigue,
 * no se entrega (el servidor devuelve el cobro). La IA está simulada: estas pruebas no gastan nada.
 */
const base = cleanBase({
  idioma: "es", resumen: "Reflexión sobre la humildad y la grandeza.",
  transcripcion: [
    { s: 0, texto: "La verdadera grandeza no se anuncia." },
    { s: 4, texto: "Los grandes de verdad sirven sin pedir aplausos y escuchan más de lo que hablan cada día de su vida." },
  ],
  gancho: { se_dice: "La verdadera grandeza no se anuncia", texto_pantalla: "Grandeza", se_ve: "Plano medio", por_que: "Contradicción" },
  estructura: [{ inicio: 0, fin: 4, funcion: "gancho", que_pasa: "Plantea la idea" }, { inicio: 4, fin: 20, funcion: "giro", que_pasa: "Ejemplos de humildad" }],
  referencia: { tema: "Humildad y grandeza", tesis: "La grandeza real es humilde", intencion: "inspiración", argumentos: [], preservar: ["humildad"], no_introducir: ["ventas", "tecnología"] },
})!;
const brief: BriefB = { palabra: "", handle: "" };
const qa: QaInput = { objetivo: "atraer", policy: "interes", ofertas: ["Workshop de Negocios Digitales con IA"], privada: "", estilo: "Natural" };
const guion = (dices: string) => ({ ganchos: ["Lo grande de verdad no hace ruido"], guion: [{ inicio: 0, fin: 4, dices: "Lo grande de verdad no hace ruido.", original: 0 }, { inicio: 4, fin: 20, dices, original: 1 }], cierre: "Guárdalo para un día difícil.", publicar: { copy: "Humildad.", hashtags: ["humildad"] } });
const juez = (falla: string[] = []) => ({ checks: [...PUNTOS.espejo.map(p => p.id), "sin_inventos", "tono", "aporta"].map(id => ({ id, ok: !falla.includes(id), nota: falla.includes(id) ? "Cambió el tema a negocios" : "" })) });
const isJudge = (p: string) => p.startsWith("Eres editor de contenido y revisas UNA pieza");

describe("ESPEJO con fidelidad creativa", () => {
  it("el prompt ya no exige el 90 % de texto y prohíbe copiar frases distintivas", () => {
    const p = promptB(base, "espejo", brief, "");
    expect(p).not.toMatch(/90 %|19 de cada 20/);
    expect(p).toContain("no copies frases distintivas");
    expect(p).toContain("No introducir: ventas · tecnología");
  });

  it("entrega a la primera cuando la revisión no encuentra fallas críticas", async () => {
    const generate = vi.fn(async (p: string) => (isJudge(p) ? juez() : guion("Quien es grande de verdad ayuda sin buscar aplausos y escucha antes de hablar.")));
    const r = await writeReelVersion(base, "espejo", brief, "", qa, { generate, remainingMs: () => 120_000 });
    expect(r.version?.revision?.ok).toBe(true);
    expect(r.version?.revision?.semantica).toBe(true);
    expect(r.version?.revision?.corregida).toBe(false);
    expect(generate).toHaveBeenCalledTimes(2); // versión + revisión
  });

  it("si cambia el tema, corrige UNA vez y entrega la corregida", async () => {
    let judged = 0;
    const generate = vi.fn(async (p: string) => (isJudge(p) ? juez(judged++ === 0 ? ["tema"] : []) : guion("Quien es grande de verdad ayuda sin buscar aplausos.")));
    const r = await writeReelVersion(base, "espejo", brief, "", qa, { generate, remainingMs: () => 120_000 });
    expect(r.version?.revision?.corregida).toBe(true);
    expect(generate).toHaveBeenCalledTimes(4);
    expect(generate.mock.calls[2][0]).toContain("CORRIGE TU INTENTO ANTERIOR");
  });

  it("si sigue fallando en lo crítico, no se entrega (el servidor devuelve el cobro)", async () => {
    const generate = vi.fn(async (p: string) => (isJudge(p) ? juez(["tema"]) : guion("Así vendes tu curso con IA.")));
    const r = await writeReelVersion(base, "espejo", brief, "", qa, { generate, remainingMs: () => 120_000 });
    expect(r.version).toBeNull();
    expect(r.reason).toContain("conserve el tema");
    expect(generate).toHaveBeenCalledTimes(4);
  });

  it("copiar 10 palabras seguidas del original es falla crítica aunque la IA diga que está bien", async () => {
    const copia = "Los grandes de verdad sirven sin pedir aplausos y escuchan más de lo que hablan";
    let n = 0;
    const generate = vi.fn(async (p: string) => (isJudge(p) ? juez() : guion(n++ === 0 ? copia : "Quien es grande ayuda en silencio.")));
    const r = await writeReelVersion(base, "espejo", brief, "", qa, { generate, remainingMs: () => 120_000 });
    expect(r.version?.revision?.corregida).toBe(true);
    expect(r.version?.guion[1].dices).toBe("Quien es grande ayuda en silencio.");
  });

  it("meter una oferta en Espejo es falla crítica", async () => {
    const generate = vi.fn(async (p: string) => (isJudge(p) ? juez() : { ...guion("La humildad abre puertas."), cierre: "Únete al Workshop de Negocios Digitales con IA" }));
    const r = await writeReelVersion(base, "espejo", brief, "", qa, { generate, remainingMs: () => 120_000 });
    expect(r.version).toBeNull();
  });

  it("sin tiempo para la revisión semántica, entrega solo con los chequeos fijos y lo marca", async () => {
    const generate = vi.fn(async () => guion("Quien es grande ayuda en silencio."));
    const r = await writeReelVersion(base, "espejo", brief, "", qa, { generate, remainingMs: () => 10_000 });
    expect(r.version?.revision?.semantica).toBe(false);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
