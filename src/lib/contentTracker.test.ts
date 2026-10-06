import { describe, expect, it } from "vitest";
import { cleanChannels, cleanGoals, freshChannels, kindFromPlatform, progressOf, statusFromChannels, weekSummary, DEFAULT_GOALS } from "./contentTracker";

describe("tracker de publicaciones", () => {
  it("cada tipo trae sus redes de fábrica sin publicar", () => {
    expect(Object.keys(freshChannels("corto"))).toEqual(["reels", "tiktok", "shorts"]);
    expect(Object.keys(freshChannels("texto"))).toEqual(["threads", "x"]);
    expect(progressOf(freshChannels("corto"))).toEqual({ done: 0, total: 3 });
  });
  it("la pieza queda publicada solo con el check en todas sus redes", () => {
    const ch = { reels: { done: true }, tiktok: { done: true }, shorts: { done: false } };
    expect(statusFromChannels(ch, "grabado")).toBe("grabado");
    expect(statusFromChannels({ ...ch, shorts: { done: true } }, "grabado")).toBe("publicado");
    expect(statusFromChannels(ch, "publicado")).toBe("grabado");
  });
  it("limpia lo guardado: redes desconocidas y enlaces que no son https fuera", () => {
    const c = cleanChannels({ reels: { done: true, url: "https://instagram.com/reel/abc", at: "2026-10-06" }, tiktok: { url: "javascript:alert(1)" }, myspace: { done: true } });
    expect(c).toEqual({ reels: { done: true, url: "https://instagram.com/reel/abc", at: "2026-10-06" }, tiktok: { done: false } });
  });
  it("resumen de la semana: publicadas contra la meta, publicaciones, leads, ventas y lo que más trae clientes", () => {
    const items = [
      { kind: "corto" as const, status: "publicado", due: "2026-10-06", channels: { reels: { done: true }, tiktok: { done: true } }, leads: 3, sales: 1 },
      { kind: "corto" as const, status: "grabado", due: "2026-10-07", channels: { reels: { done: true }, tiktok: { done: false } }, leads: 0, sales: 0 },
      { kind: "carrusel" as const, status: "publicado", due: "2026-10-08", channels: { instagram: { done: true } }, leads: 9, sales: 2 },
      { kind: "texto" as const, status: "publicado", due: "2026-09-01", channels: { x: { done: true } }, leads: 1, sales: 0 },
    ];
    const w = weekSummary(items, "2026-10-06", "2026-10-12", DEFAULT_GOALS);
    expect(w.byKind.find(b => b.kind === "corto")).toEqual({ kind: "corto", published: 1, planned: 2, goal: 5 });
    expect(w.posts).toBe(4);
    expect(w.leads).toBe(12);
    expect(w.sales).toBe(3);
    expect(w.best).toEqual({ kind: "carrusel", leads: 9 });
  });
  it("la meta se limpia y las plataformas viejas se traducen a tipo", () => {
    expect(cleanGoals({ corto: 3, largo: -1, texto: "x" })).toEqual({ ...DEFAULT_GOALS, corto: 3 });
    expect(kindFromPlatform("youtube")).toBe("largo");
    expect(kindFromPlatform("blog")).toBe("texto");
    expect(kindFromPlatform("reels")).toBe("corto");
  });
});
