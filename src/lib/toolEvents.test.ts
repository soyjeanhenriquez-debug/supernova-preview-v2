import { describe, expect, it, vi } from "vitest";

const rpc = vi.fn(async () => ({ data: null, error: null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...(a as [])) } }));

import { _colaParaPruebas, _enviarParaPruebas, tabId, toolEvent } from "./toolEvents";

describe("eventos de tarea (Guardián del Creador)", () => {
  it("guarda herramienta, evento, hora y un id de pestaña; nada más", () => {
    toolEvent("imagen-ia", "empezar");
    const e = _colaParaPruebas().at(-1)!;
    expect(Object.keys(e).sort()).toEqual(["at", "evento", "sid", "tool"]);
    expect(e.sid).toBe(tabId());
    expect(e.sid).toMatch(/^[a-z0-9]{8,24}$/);
  });
  it("ignora ids de herramienta raros", () => {
    const n = _colaParaPruebas().length;
    toolEvent("Imagen IA <script>", "abrir");
    expect(_colaParaPruebas().length).toBe(n);
  });
  it("manda en lote al servidor y si falla no rompe nada", async () => {
    rpc.mockRejectedValueOnce(new Error("sin red"));
    toolEvent("reel-studio", "resultado");
    await expect(_enviarParaPruebas()).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("log_tool_events", expect.objectContaining({ p_events: expect.any(Array) }));
  });
});
