import { describe, expect, it } from "vitest";
import {
  deleteProduction, getMedia, getProduction, listProductions, progressOf, putMedia, resumeState, saveProduction,
  type ProductionMeta, type SceneState,
} from "./productionStore";

const sc = (p: Partial<SceneState> = {}): SceneState => ({ n: "1", visual: "v", narration: "n", voice: "pending", image: "pending", clip: "none", ...p });
const prod = (id: string, scenes: SceneState[], uid = "u1"): ProductionMeta => ({
  id, uid, title: "T", format: "16:9", style: "Documental", voice: "onyx", lang: "es", pct: 20, subtitles: true,
  scenes, spent: 0, createdAt: 1, updatedAt: 1,
});

describe("resumeState", () => {
  it("lo que estaba trabajando sin resultado vuelve a pendiente (no se cobra solo)", () => {
    const r = resumeState(prod("a", [sc({ voice: "working", image: "done", clip: "working", jobId: "j" }), sc({ image: "working", clip: "working" })]));
    expect(r.scenes[0]).toMatchObject({ voice: "pending", image: "done", clip: "working" }); // con trabajo: se sigue consultando
    expect(r.scenes[1]).toMatchObject({ image: "pending", clip: "pending" });
  });
});

describe("progressOf", () => {
  it("cuenta piezas y sabe cuándo se puede armar", () => {
    const p = progressOf({ scenes: [sc({ voice: "done", image: "done", clip: "working", jobId: "j" }), sc({ voice: "done", image: "done" })] });
    expect(p).toMatchObject({ done: 4, total: 5, clipsWorking: 1, ready: true, pending: 0 });
    expect(progressOf({ scenes: [sc({ voice: "done", image: "failed" })] }).ready).toBe(false);
    expect(progressOf({ scenes: [] }).ready).toBe(false);
  });
});

describe("guardado (sin IndexedDB: en memoria)", () => {
  it("guarda, lista por usuario, guarda medios y borra todo", async () => {
    await saveProduction(prod("p1", [sc()]));
    await saveProduction(prod("p2", [sc()], "otro"));
    expect((await getProduction("p1"))?.title).toBe("T");
    expect((await listProductions("u1")).map(p => p.id)).toEqual(["p1"]);
    await putMedia("p1", 0, "voice", new Blob(["x"]));
    expect(await getMedia("p1", 0, "voice")).not.toBeNull();
    await deleteProduction("p1");
    expect(await getProduction("p1")).toBeNull();
    expect(await getMedia("p1", 0, "voice")).toBeNull();
  });
});
