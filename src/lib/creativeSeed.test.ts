import { describe, it, expect, beforeEach } from "vitest";
import { setSeed, takeSeed, cleanSeed, safeImagePath, SEED_KEY, TARGET_SLUG, TARGET_PAGE, SEED_TARGETS } from "@/lib/creativeSeed";

const UID = "11111111-2222-3333-4444-555555555555";
const base = { source: "oferta" as const, target: "creativos" as const, title: "Guía", product: "Guía de inglés", who: "Adultos", promise: "Hablar" };

beforeEach(() => sessionStorage.clear());

describe("creativeSeed", () => {
  it("guarda y lee una sola vez", () => {
    setSeed(base);
    const s = takeSeed("creativos");
    expect(s).toMatchObject({ v: 1, product: "Guía de inglés", target: "creativos" });
    expect(takeSeed("creativos")).toBeNull();
  });
  it("recorta los textos largos", () => {
    setSeed({ ...base, title: "t".repeat(200), product: "p".repeat(500), hook: "h".repeat(400), evidence: "e".repeat(200) });
    const s = takeSeed(["creativos"])!;
    expect(s.title.length).toBe(80);
    expect(s.product.length).toBe(200);
    expect(s.hook!.length).toBe(140);
    expect(s.evidence!.length).toBe(80);
  });
  it("si el target no coincide, no la lee ni la borra", () => {
    setSeed(base);
    expect(takeSeed(["video_anuncio", "serie"])).toBeNull();
    expect(sessionStorage.getItem(SEED_KEY)).not.toBeNull();
    expect(takeSeed("creativos")).not.toBeNull();
  });
  it("caduca a los 10 minutos", () => {
    setSeed(base);
    expect(takeSeed("creativos", null, Date.now() + 11 * 60_000)).toBeNull();
    expect(sessionStorage.getItem(SEED_KEY)).toBeNull();
  });
  it("autostart solo vale antes de 2 minutos", () => {
    setSeed({ ...base, autostart: true });
    expect(takeSeed("creativos", null, Date.now() + 60_000)!.autostart).toBe(true);
    setSeed({ ...base, autostart: true });
    const late = takeSeed("creativos", null, Date.now() + 3 * 60_000)!;
    expect(late).not.toBeNull();
    expect(late.autostart).toBeUndefined();
  });
  it("descarta imagePath malicioso", () => {
    for (const bad of ["../x.webp", `${UID}/../otro/x.webp`, "/abs/x.webp", "https://evil.com/x.png", "otro-usuario/x.webp", `${UID}`, `${UID}//x`]) {
      expect(safeImagePath(bad)).toBeUndefined();
    }
    expect(safeImagePath(`${UID}/prod/a.webp`)).toBe(`${UID}/prod/a.webp`);
    expect(safeImagePath(`${UID}/prod/a.webp`, "99999999-2222-3333-4444-555555555555")).toBeUndefined();
    setSeed({ ...base, imagePath: "../../secreto.png" });
    expect(takeSeed("creativos")!.imagePath).toBeUndefined();
  });
  it("cleanSeed rechaza lo que no es una semilla", () => {
    expect(cleanSeed(null)).toBeNull();
    expect(cleanSeed({ ...base, v: 2, at: 1 })).toBeNull();
    expect(cleanSeed({ ...base, v: 1, at: 1, target: "otro" })).toBeNull();
    expect(cleanSeed({ ...base, v: 1, at: 1, title: "", product: "" })).toBeNull();
    expect(cleanSeed({ ...base, v: 1, at: 1, aspect: "3:2" })!.aspect).toBeUndefined();
    sessionStorage.setItem(SEED_KEY, "{roto");
    expect(takeSeed("creativos")).toBeNull();
  });
  it("cada target tiene pantalla y slug", () => {
    for (const t of SEED_TARGETS) { expect(TARGET_PAGE[t]).toBeTruthy(); expect(TARGET_SLUG[t]).toMatch(/^[a-z-]+$/); }
  });
});
