import { beforeEach, describe, expect, it } from "vitest";
import { cleanSeed, setSeed, takeSeed, SEED_KEY, TARGET_SLUG, TARGET_PAGE, SEED_TARGETS, safeImagePath } from "./creativeSeed";

const UID = "11111111-2222-3333-4444-555555555555";
const base = { source: "oferta" as const, target: "creativos" as const, title: "Ebook de recetas", product: "Ebook de recetas", who: "Mamás", promise: "Cocinar rápido" };

describe("creativeSeed", () => {
  beforeEach(() => sessionStorage.clear());

  it("recorta los textos largos", () => {
    const s = cleanSeed({ ...base, title: "x".repeat(300), hook: "h".repeat(500), evidence: "e".repeat(200), at: Date.now() })!;
    expect(s.title.length).toBe(80);
    expect(s.hook!.length).toBe(140);
    expect(s.evidence!.length).toBe(80);
  });

  it("guarda y toma la semilla una sola vez", () => {
    setSeed({ ...base, autostart: true });
    const s = takeSeed(["creativos", "carrusel"]);
    expect(s?.title).toBe("Ebook de recetas");
    expect(s?.autostart).toBe(true);
    expect(takeSeed("creativos")).toBeNull();
  });

  it("caduca a los 10 minutos", () => {
    setSeed(base);
    expect(takeSeed("creativos", Date.now() + 11 * 60_000)).toBeNull();
    expect(sessionStorage.getItem(SEED_KEY)).toBeNull();
  });

  it("autostart vencido después de 2 minutos", () => {
    setSeed({ ...base, autostart: true });
    const s = takeSeed("creativos", Date.now() + 3 * 60_000);
    expect(s).not.toBeNull();
    expect(s!.autostart).toBe(false);
  });

  it("un destino que no coincide no la toma ni la borra", () => {
    setSeed({ ...base, target: "video_anuncio" });
    expect(takeSeed(["creativos", "carrusel"])).toBeNull();
    expect(takeSeed("video_anuncio")?.target).toBe("video_anuncio");
  });

  it("descarta imagePath malicioso", () => {
    expect(cleanSeed({ ...base, imagePath: `${UID}/../otro/x.webp`, at: 1 })!.imagePath).toBeUndefined();
    expect(cleanSeed({ ...base, imagePath: "https://evil.com/x.png", at: 1 })!.imagePath).toBeUndefined();
    expect(cleanSeed({ ...base, imagePath: "otro/x.webp", at: 1 })!.imagePath).toBeUndefined();
    expect(cleanSeed({ ...base, imagePath: `${UID}/p/x.webp`, at: 1 }, "99999999-2222-3333-4444-555555555555")!.imagePath).toBeUndefined();
    expect(cleanSeed({ ...base, imagePath: `${UID}/p/x.webp`, at: 1 }, UID)!.imagePath).toBe(`${UID}/p/x.webp`);
    expect(safeImagePath(`/${UID}/x.webp`)).toBeUndefined();
  });

  it("rechaza fuente o destino desconocidos", () => {
    expect(cleanSeed({ ...base, source: "x", at: 1 })).toBeNull();
    expect(cleanSeed({ ...base, target: "x", at: 1 })).toBeNull();
    expect(cleanSeed("hola")).toBeNull();
  });

  it("todos los destinos tienen pantalla y slug", () => {
    for (const t of SEED_TARGETS) { expect(TARGET_SLUG[t]).toMatch(/^[a-z-]+$/); expect(TARGET_PAGE[t]).toBeTruthy(); }
  });
});
