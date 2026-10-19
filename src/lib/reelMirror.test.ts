import { describe, expect, it, vi } from "vitest";
import { cleanBase, cleanVersion, promptB, tramoTexts, type Base, type BriefB } from "../../supabase/functions/_shared/reelLayers";
import { scriptFidelity, textFidelity } from "../../supabase/functions/_shared/reelFidelity";
import { checkMirror, mirrorBase, writeReelVersion } from "../../supabase/functions/_shared/reelVersion";
import { parecido, publishText, teleprompterLines } from "./reel";

const words = Array.from({ length: 100 }, (_, i) => `p${i}`);
const original = words.join(" ");
const base = cleanBase({
  idioma: "es", resumen: "Referencia sintética para medir cambios, no un Reel real.",
  transcripcion: [{ s: 0, texto: original }],
  estructura: [{ inicio: 0, fin: 30, etiqueta: "Guion" }],
})!;
const brief: BriefB = { product: "", who: "", nicho: "", oferta: "", palabra: "", handle: "" };
const draft = (kept: number) => ({
  guion: [{ inicio: 0, fin: 30, original: 0, dices: words.map((w, i) => i < kept ? w : `c${i}`).join(" ") }],
  ganchos: [], cierre: "",
});
const version = (kept: number) => cleanVersion(draft(kept), "espejo", "", 1)!;

describe("Espejo: objetivo 95 %, mínimo real del 90 %", () => {
  it("no agrega un cierre nuevo cuando el original no lo tenía y no se pidió personalizarlo", () => {
    const p = promptB(base, "espejo", brief);
    expect(p).toContain("Si no tenía llamada a la acción, no agregues una");
    expect(version(95).publicar.palabra_clave).toBe("");
    expect(publishText(version(95))).not.toMatch(/\bComenta\s/);
    expect(promptB(base, "espejo", { ...brief, palabra: "NOVA" })).toContain("Palabra clave del cierre: NOVA");
  });
  it("rechaza el caso del 61 % que el limpiador anterior aceptaba como Espejo", () => {
    const bad = version(61);
    expect(bad.nivel).toBe("espejo");
    expect(checkMirror(base, bad)).toEqual({ version: null, reason: expect.stringContaining("61 %") });
  });

  it("acepta 95 exacto y usa la misma medición en el servidor y el teleprompter", () => {
    const result = checkMirror(base, version(95)).version!;
    expect(result.espejo_validado).toBe(true);
    expect(parecido(result)).toBe(95);
    expect(scriptFidelity(result)?.passes).toBe(true);
    expect(textFidelity(original, teleprompterLines(result).join(" "))?.percent).toBe(95);
    expect(parecido(checkMirror(base, version(90)).version!)).toBe(90);
    expect(checkMirror(base, version(89)).version).toBeNull();
  });

  it("89,9 no pasa por redondear; 94,9 todavía no cumple el objetivo del 95 %", () => {
    const long = Array.from({ length: 1000 }, (_, i) => `p${i}`);
    const below = textFidelity(long.join(" "), long.map((w, i) => i < 949 ? w : `c${i}`).join(" "))!;
    expect(below.percent).toBe(94.9);
    expect(below.passes).toBe(true);
    expect(below.onTarget).toBe(false);
    const rejected = textFidelity(long.join(" "), long.map((w, i) => i < 899 ? w : `c${i}`).join(" "))!;
    expect(rejected.percent).toBe(89.9);
    expect(rejected.passes).toBe(false);
    expect(textFidelity(original, original + " un discurso totalmente nuevo que antes no estaba aquí y añade muchas más palabras")?.passes).toBe(false);
    expect(textFidelity(original, [...words].reverse().join(" "))?.passes).toBe(false);
  });

  it("no acepta una copia idéntica, una referencia inventada ni tramos omitidos o movidos", () => {
    expect(checkMirror(base, version(100)).version).toBeNull();
    const forged = version(61);
    forged.guion[0].original_texto = forged.guion[0].dices;
    expect(checkMirror(base, forged).version).toBeNull();
    for (const change of [{ original: null }, { original: 1 }, { fin: 29 }]) {
      const v = version(95);
      Object.assign(v.guion[0], change);
      expect(checkMirror(base, v).version).toBeNull();
    }
    expect(checkMirror({ ...base, estructura: [...base.estructura, { ...base.estructura[0], inicio: 30, fin: 40 }] }, version(95)).version).toBeNull();
  });

  it("valida el cierre y cada gancho que ofrece, incluido el elegido en pantalla", () => {
    const v = version(95);
    v.cierre = "Este cierre añadido es completamente diferente y cambia el resultado";
    expect(checkMirror(base, v).version).toBeNull();
    v.cierre = "";
    v.ganchos = [v.guion[0].dices, "Un gancho que cambia todo el guion"];
    const checked = checkMirror(base, v).version!;
    expect(checked.ganchos).toHaveLength(1);
    expect(parecido(checked, 0)).toBe(95);
    expect(parecido({ ...checked, ganchos: v.ganchos }, 1)).toBeLessThan(95);
  });

  it("conserva tramos largos completos, sin el recorte anterior de 500/700 caracteres", () => {
    const b: Base = { ...base, transcripcion: [{ s: 0, texto: original }, { s: 1, texto: original }, { s: 2, texto: original }] };
    const full = b.transcripcion.map(t => t.texto).join(" ");
    const v = cleanVersion({ guion: [{ inicio: 0, fin: 30, original: 0, dices: full.replace("p99", "c99") }] }, "espejo", "", 1)!;
    expect(full.length).toBeGreaterThan(700);
    expect(tramoTexts(b)[0]).toBe(full);
    expect(v.guion[0].dices.length).toBe(full.length);
    expect(checkMirror(b, v).version?.espejo_validado).toBe(true);
  });

  it("una referencia incompleta no se convierte en un porcentaje verificable", () => {
    expect(parecido(version(95))).toBeNull();
    expect(checkMirror({ ...base, transcripcion: [] }, version(95)).version).toBeNull();
    const gap = { ...base, transcripcion: [{ s: 0, texto: original }, { s: 31, texto: "Texto omitido" }],
      estructura: [{ ...base.estructura[0], fin: 20 }, { ...base.estructura[0], inicio: 40, fin: 50 }] };
    expect(checkMirror(gap, { ...version(95), guion: [...version(95).guion.map(t => ({ ...t, fin: 20 })), { ...version(95).guion[0], inicio: 40, fin: 50, original: 1 }] }).version).toBeNull();
  });
});

describe("generación y corrección acotada", () => {
  it("corrige 61 → 95 y solo entrega la versión que pasa", async () => {
    const generate = vi.fn().mockResolvedValueOnce(draft(61)).mockResolvedValueOnce(draft(95));
    const result = await writeReelVersion(base, "espejo", brief, { generate, remainingMs: () => 60_000 });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.version?.espejo_validado).toBe(true);
    expect(parecido(result.version!)).toBe(95);
  });

  it("si ambas fallan, no devuelve ningún guion como exitoso", async () => {
    const generate = vi.fn().mockResolvedValue(draft(61));
    const result = await writeReelVersion(base, "espejo", brief, { generate, remainingMs: () => 60_000 });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.version).toBeNull();
  });

  it("no gasta otra llamada si ya pasa o si no queda tiempo", async () => {
    const good = vi.fn().mockResolvedValue(draft(95));
    await writeReelVersion(base, "espejo", brief, { generate: good, remainingMs: () => 60_000 });
    expect(good).toHaveBeenCalledTimes(1);
    const bad = vi.fn().mockResolvedValue(draft(61));
    expect((await writeReelVersion(base, "espejo", brief, { generate: bad, remainingMs: () => 29_999 })).version).toBeNull();
    expect(bad).toHaveBeenCalledTimes(1);
  });

  it("busca mejorar un 90 % hasta el 95 %", async () => {
    const generate = vi.fn().mockResolvedValueOnce(draft(90)).mockResolvedValueOnce(draft(95));
    const result = await writeReelVersion(base, "espejo", brief, { generate, remainingMs: () => 60_000 });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(parecido(result.version!)).toBe(95);
  });

  it("mantiene el mejor resultado válido si la corrección empeora, falla o se queda sin tiempo", async () => {
    for (const kept of [61, 90, 94]) {
      const generate = vi.fn().mockResolvedValueOnce(draft(92)).mockResolvedValueOnce(draft(kept));
      const result = await writeReelVersion(base, "espejo", brief, { generate, remainingMs: () => 60_000 });
      expect(parecido(result.version!)).toBe(Math.max(92, kept));
    }
    const generate = vi.fn().mockResolvedValueOnce(draft(92)).mockRejectedValueOnce(new Error("timeout"));
    const result = await writeReelVersion(base, "espejo", brief, { generate, remainingMs: () => 60_000 });
    expect(parecido(result.version!)).toBe(92);
    const noTime = vi.fn().mockResolvedValue(draft(90));
    const fallback = await writeReelVersion(base, "espejo", brief, { generate: noTime, remainingMs: () => 29_999 });
    expect(parecido(fallback.version!)).toBe(90);
    expect(noTime).toHaveBeenCalledTimes(1);
  });

  it("Adaptación e Inspiración mantienen su generación sin imponer el mínimo de Espejo", async () => {
    for (const nivel of ["adaptacion", "inspiracion"] as const) {
      const generate = vi.fn().mockResolvedValue(draft(61));
      const result = await writeReelVersion(base, nivel, brief, { generate, remainingMs: () => 60_000 });
      expect(result.version?.nivel).toBe(nivel);
      expect(result.version?.espejo_validado).toBeUndefined();
      expect(generate).toHaveBeenCalledTimes(1);
    }
  });
});

describe("referencia en otro idioma", () => {
  it("traduce antes de adaptar y reutiliza la traducción guardada", async () => {
    const foreign = { ...base, idioma: "en", transcripcion: [{ s: 0, texto: "An original English script." }] };
    const translated = [{ s: 0, texto: original }];
    const generate = vi.fn().mockResolvedValue({ traduccion: translated });
    const ref = await mirrorBase(foreign, generate);
    expect(ref.transcripcion).toEqual(translated);
    expect(checkMirror(ref, version(95)).version?.espejo_validado).toBe(true);
    await mirrorBase({ ...foreign, espejo_traduccion: ref.espejo_traduccion }, generate);
    expect(generate).toHaveBeenCalledTimes(1);
    await mirrorBase(base, generate);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("rechaza traducciones que omiten bloques o alteran sus segundos", async () => {
    for (const traduccion of [[], [{ s: 1, texto: original }], [{ s: 0, texto: "" }]]) {
      await expect(mirrorBase({ ...base, idioma: "en" }, vi.fn().mockResolvedValue({ traduccion }))).rejects.toThrow("traducción completa");
    }
  });
});
