import { describe, expect, it } from "vitest";
import { MODEL_GUIDE, adviceFor, bestFor, imageTag } from "./modelAdvice";
import { VIDEO_MODELS } from "./avatarStudio";

describe("modelAdvice", () => {
  // Omni y Grok ya están en el estudio (20-oct-2026); sin ellos se prueba el respaldo.
  const sinNuevos = VIDEO_MODELS.filter(m => m.id !== "omni" && m.id !== "grok");
  it("sin hablar: recomienda Grok si está, si no Kling 2.5", () => {
    expect(bestFor("sin-hablar", VIDEO_MODELS)?.id).toBe("grok");
    expect(adviceFor("sin-hablar", VIDEO_MODELS, "grok")?.ok).toBe(true);
    expect(bestFor("sin-hablar", sinNuevos)?.id).toBe("kling25");
    const tip = adviceFor("sin-hablar", sinNuevos, "seedance-mini");
    expect(tip?.ok).toBe(false);
    expect(tip?.text).toContain("Kling 2.5 Turbo");
  });
  it("habla: solo recomienda Omni; sin Omni no empuja a otro", () => {
    expect(adviceFor("habla", sinNuevos.filter(m => m.talks), "seedance-mini")).toBeNull();
    const tip = adviceFor("habla", VIDEO_MODELS.filter(m => m.talks), "seedance-mini");
    expect(tip?.best.id).toBe("omni");
    expect(tip?.text).toContain("labios");
  });
  it("imagen: GPT Image 2 = lo más real, Nano Banana Pro = creativo", () => {
    expect(imageTag({ id: "gpt-image-2", label: "GPT Image 2" })).toBe("Lo más real");
    expect(imageTag({ id: "nano-banana-pro", label: "Nano Banana Pro" })).toBe("Creativo y animado");
    expect(imageTag({ id: "nano-banana-2", label: "Nano Banana 2" })).toBeNull();
  });
  it("nunca nombra proveedores", () => {
    expect(MODEL_GUIDE).not.toMatch(/fal|apimart|higgsfield|kie|google flow/i);
  });
});
