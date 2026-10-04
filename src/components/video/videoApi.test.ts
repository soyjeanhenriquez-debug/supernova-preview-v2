import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() } } }));

import { STATUS_MAX_ERRORS, waitForVideo, type VideoJob } from "./videoApi";

const job = (status: VideoJob["status"]): { job: VideoJob } => ({
  job: { id: "j", status, result_url: status === "done" ? "https://x.apimart.ai/v.mp4" : null, prompt: "p", seconds: 5 },
});

describe("waitForVideo", () => {
  it("un error suelto al consultar no corta la espera", async () => {
    const answers: Array<() => unknown> = [
      () => { throw new Error("red"); },
      () => job("running"),
      () => { throw new Error("503"); },
      () => job("done"),
    ];
    let n = 0;
    const check = vi.fn(async () => answers[n++]()) as never;
    const r = await waitForVideo("j", undefined, { intervalMs: 0, check });
    expect(r.status).toBe("done");
    expect(n).toBe(4);
  });

  it("se rinde tras varios errores seguidos y dice que el video sigue en camino", async () => {
    const check = vi.fn(async () => { throw new Error("sin red"); }) as never;
    await expect(waitForVideo("j", undefined, { intervalMs: 0, check })).rejects.toThrow(/Tus videos de hoy/);
    expect((check as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(STATUS_MAX_ERRORS);
  });

  it("al agotar el tiempo no promete algo que no pasa", async () => {
    const check = vi.fn(async () => job("running")) as never;
    await expect(waitForVideo("j", undefined, { intervalMs: 0, tries: 3, check })).rejects.toThrow(/devolvemos los créditos/);
  });
});
