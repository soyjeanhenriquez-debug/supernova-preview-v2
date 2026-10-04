import { describe, expect, it } from "vitest";
import { aiAspect, buildSlots, MODE_COUNT, RULES, variationSpec, textLine, adCopyRequest, aspectOptions, type StudioMode, type PromptCtx } from "./imagePrompts";
import { sanitizeKit, kitReferences } from "./brandKit";

const brief = { product: "Ebook de recetas rápidas", who: "Mamás que trabajan", promise: "Cocinar en 20 minutos" };
const MODES: StudioMode[] = ["creativo", "carrusel", "miniatura", "foto_ugc", "foto_producto", "variar"];
const UID = "11111111-2222-3333-4444-555555555555";

describe("imagePrompts", () => {
  it("cada modo devuelve N espacios con su formato", () => {
    for (const m of MODES) {
      const { aspect } = aiAspect(m);
      const slots = buildSlots(m, { brief, aspect });
      expect(slots).toHaveLength(MODE_COUNT[m]);
      expect(new Set(slots.map(s => s.id)).size).toBe(slots.length);
      for (const s of slots) expect(s.aspect).toBe(aspect);
    }
  });

  it("las reglas del manual van en todos los prompts", () => {
    for (const m of MODES) for (const s of buildSlots(m, { brief, aspect: "4:5" })) {
      expect(s.prompt).toContain(RULES);
      expect(s.prompt).toMatch(/latina/i);
    }
  });

  it("la paleta del kit aparece cuando existe y no aparece si no", () => {
    const kit = { colors: ["#ff8800", "#111111"], style: "minimalista y cálido" };
    for (const m of MODES) {
      for (const s of buildSlots(m, { brief, aspect: "4:5", kit })) {
        expect(s.prompt).toContain("#ff8800");
        expect(s.prompt).toContain("minimalista y cálido");
      }
      for (const s of buildSlots(m, { brief, aspect: "4:5" })) expect(s.prompt).not.toContain("paleta de marca");
    }
  });

  it("el gancho de referencia nunca entra como texto exacto", () => {
    const hook = "El secreto que nadie te cuenta";
    const line = textLine("", hook);
    expect(line).toMatch(/NUEVO/);
    expect(line).toMatch(/sin copiar/);
    expect(line).not.toMatch(/exactamente/);
    const ctx: PromptCtx = { brief, aspect: "4:5", hook };
    for (const s of buildSlots("creativo", ctx)) expect(s.prompt).toMatch(/sin copiar/);
    expect(adCopyRequest("creativo", ctx)).toMatch(/NO copies/);
  });

  it("el texto del usuario va exacto", () => {
    expect(textLine("Hazlo hoy", "otro")).toBe("Texto grande en la imagen, exactamente: «Hazlo hoy».");
  });

  it("con fotos de referencia se pide respetar el producto", () => {
    const s = buildSlots("foto_producto", { brief, aspect: "1:1", hasRefs: true });
    for (const x of s) expect(x.prompt).toMatch(/imágenes de referencia/);
  });

  it("la IA elige el formato y respeta el de la semilla si sirve", () => {
    expect(aiAspect("creativo").aspect).toBe("4:5");
    expect(aiAspect("miniatura").aspect).toBe("16:9");
    expect(aiAspect("miniatura", "9:16").aspect).toBe("9:16");
    expect(aiAspect("creativo", "9:16").aspect).toBe("9:16");
    expect(aiAspect("carrusel", "16:9").aspect).toBe("4:5");
    for (const m of MODES) expect(aspectOptions(m)).toContain(aiAspect(m).aspect);
  });

  it("la variación pide imagen a imagen", () => {
    const v = variationSpec(4, "4:5", { brief, aspect: "4:5" });
    expect(v.prompt).toMatch(/imagen de referencia/);
    expect(v.prompt).toContain(RULES);
  });

  it("el pedido de texto del anuncio no promete ingresos", () => {
    expect(adCopyRequest("carrusel", { brief })).toMatch(/sin promesas de ingresos/);
  });
});

describe("brandKit", () => {
  it("limpia colores, estilo y rutas ajenas", () => {
    const k = sanitizeKit({
      colors: ["#FF8800", "rojo", "#ff8800", "#000000", "#111111", "#222222", "#333333", "#444444"],
      style: "  x ".repeat(100),
      logo_path: "99999999-2222-3333-4444-555555555555/p/logo.webp",
      ref_paths: [`${UID}/p/refs/1.webp`, `${UID}/../x.webp`, "https://evil.com/a.png", `${UID}/p/refs/2.webp`],
    }, UID);
    expect(k.colors).toEqual(["#ff8800", "#000000", "#111111", "#222222", "#333333"]);
    expect(k.style.length).toBeLessThanOrEqual(200);
    expect(k.logo_path).toBeNull();
    expect(k.ref_paths).toEqual([`${UID}/p/refs/1.webp`, `${UID}/p/refs/2.webp`]);
  });

  it("manda máximo 3 referencias con el logo primero", () => {
    const k = sanitizeKit({ logo_path: `${UID}/p/refs/logo.webp`, ref_paths: [1, 2, 3].map(i => `${UID}/p/refs/${i}.webp`) }, UID);
    expect(kitReferences(k)).toEqual([`${UID}/p/refs/logo.webp`, `${UID}/p/refs/1.webp`, `${UID}/p/refs/2.webp`]);
  });
});

describe("formatNumber", () => {
  it("usa punto de miles también con 4 cifras", async () => {
    const { formatNumber } = await import("./imagePrompts");
    expect(formatNumber(2000)).toBe("2.000");
    expect(formatNumber(1840)).toBe("1.840");
    expect(formatNumber(18)).toBe("18");
    expect(formatNumber(1234567)).toBe("1.234.567");
  });
});
