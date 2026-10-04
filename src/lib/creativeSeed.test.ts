import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEED_KEY, TARGET_SLUG, cleanSeed, setSeed, takeSeed } from "./creativeSeed";

const UID = "11111111-2222-3333-4444-555555555555";
const base = { source: "radar" as const, target: "video_anuncio" as const, title: "Recetas", product: "Recetario", who: "Mamás", promise: "Comer mejor" };

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; }, clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k),
  };
}

describe("creativeSeed", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { sessionStorage: memoryStorage() });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T10:00:00Z"));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("recorta los largos", () => {
    const s = cleanSeed({ ...base, v: 1, at: 1, title: "t".repeat(200), hook: "h".repeat(400) });
    expect(s?.title.length).toBe(80);
    expect(s?.hook?.length).toBe(140);
  });
  it("se borra al leerla y no la toma otra pantalla", () => {
    setSeed(base);
    expect(takeSeed("creativos")).toBeNull();
    expect(takeSeed(["video_anuncio", "video_ugc"])?.title).toBe("Recetas");
    expect(window.sessionStorage.getItem(SEED_KEY)).toBeNull();
  });
  it("caduca a los 10 min y autostart vence a los 2 min", () => {
    setSeed({ ...base, autostart: true });
    vi.setSystemTime(new Date("2026-10-04T10:03:00Z"));
    const s = takeSeed("video_anuncio");
    expect(s?.autostart).toBe(false);
    setSeed(base);
    vi.setSystemTime(new Date("2026-10-04T10:14:00Z"));
    expect(takeSeed("video_anuncio")).toBeNull();
  });
  it("descarta imagePath malicioso", () => {
    expect(cleanSeed({ ...base, v: 1, at: 1, imagePath: `${UID}/../otro/x.webp` })?.imagePath).toBeUndefined();
    expect(cleanSeed({ ...base, v: 1, at: 1, imagePath: "https://evil.com/x.png" })?.imagePath).toBeUndefined();
    expect(cleanSeed({ ...base, v: 1, at: 1, imagePath: `${UID}/prod/a.webp` })?.imagePath).toBe(`${UID}/prod/a.webp`);
  });
  it("slugs de video coinciden con las rutas del plan", () => {
    expect(TARGET_SLUG.video_anuncio).toBe("video-anuncio");
    expect(TARGET_SLUG.video_ugc).toBe("ugc");
  });
});
