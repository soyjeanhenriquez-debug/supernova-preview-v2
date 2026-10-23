import { describe, it, expect } from "vitest";
import { ESTRATEGA_FORMAT_OPTIONS, ESTRATEGA_COST, stepMessage } from "./estratega";
import { ESTRATEGA_ACTION, ESTRATEGA_FORMATS, ESTRATEGA_SYSTEM, estrategaContext, isEstrategaStep } from "../../supabase/functions/_shared/estratega";

describe("Estratega de anuncios", () => {
  it("cliente y servidor usan los mismos formatos y los mismos cobros", () => {
    expect(ESTRATEGA_FORMAT_OPTIONS.map(f => f.id).sort()).toEqual(Object.keys(ESTRATEGA_FORMATS).sort());
    for (const step of ["chat", "estrategia", "guiones", "produccion"] as const) {
      expect(ESTRATEGA_COST[step].action).toBe(ESTRATEGA_ACTION[step]);
    }
    expect(ESTRATEGA_ACTION.chat).toBeNull(); // las dudas no cobran
  });

  it("solo acepta pasos conocidos", () => {
    expect(isEstrategaStep("guiones")).toBe(true);
    expect(isEstrategaStep("vsl-main")).toBe(false);
    expect(isEstrategaStep(undefined)).toBe(false);
  });

  it("la ficha va recortada y delimitada, y los formatos desconocidos se ignoran", () => {
    const ctx = estrategaContext("x".repeat(5000), ["ugc-camara", "inventado", "ugc-camara"]);
    expect(ctx).toContain("<<<");
    expect(ctx.match(/x/g)!.length).toBe(2000);
    expect(ctx).toContain("UGC a cámara");
    expect(ctx).not.toContain("inventado");
    expect(estrategaContext("", [])).toContain("vacía");
  });

  it("habla latino, sin voseo ni 'clonar' como instrucción, y con el gate de ángulos", () => {
    expect(ESTRATEGA_SYSTEM).not.toMatch(/\b(vídeo|querés|probá|vos)\b/i);
    expect(ESTRATEGA_SYSTEM).toContain("nunca \"clonar\"");
  });

  it("los botones escriben un mensaje claro aunque la caja esté vacía", () => {
    expect(stepMessage("guiones", "", ["voz-broll"])).toBe("Desarrolla estos ángulos: elige los 3 mejores. Formato: Voz en off + imágenes.");
    expect(stepMessage("produccion", "", [])).toBe("Pasa a producción: el último guion.");
  });
});
