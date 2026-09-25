import { describe, it, expect } from "vitest";
import { describeEvent, parseWatch, daysAgo } from "./offerWatch";

describe("offerWatch", () => {
  it("describe cada tipo de alerta sin inventar datos", () => {
    expect(describeEvent({ kind: "escala", on: "2026-09-25", detail: { antes: 4, ahora: 12 } })).toEqual({ tone: "good", text: "Escala: pasó de 4 a 12 anuncios activos" });
    expect(describeEvent({ kind: "se_apaga", on: "2026-09-25", detail: { antes: 7 } }).tone).toBe("bad");
    expect(describeEvent({ kind: "precio", on: "2026-09-25", detail: { antes: 9, ahora: 12.9, moneda_antes: "USD", moneda: "USD" } }).text)
      .toBe("Cambió el precio: 9 USD → 12,9 USD");
    expect(describeEvent({ kind: "upsell", on: "2026-09-25", detail: { ahora: true } }).text).toMatch(/^Agregó un upsell/);
    expect(describeEvent({ kind: "upsell", on: "2026-09-25", detail: { ahora: false } }).text).toMatch(/^Quitó el upsell/);
    // Datos faltantes: se muestra "?" en vez de un número inventado.
    expect(describeEvent({ kind: "baja", on: "2026-09-25", detail: {} }).text).toBe("Baja: pasó de ? a ? anuncios activos");
  });

  it("parseWatch tolera filas incompletas y descarta puntos sin número", () => {
    const m = parseWatch([
      { offer_id: "a", checked_on: "2026-09-25", live_active_ads: 5, live_capped: false,
        history: [{ d: "2026-09-24", n: 3 }, { d: "2026-09-25", n: null }, { d: "2026-09-25", n: 5 }], events: [{ kind: "escala", on: "2026-09-25", detail: {} }] },
      { offer_id: "b", checked_on: null, live_active_ads: null, history: null, events: null },
      { nada: 1 },
    ]);
    expect(m.size).toBe(2);
    expect(m.get("a")!.history).toEqual([{ d: "2026-09-24", n: 3 }, { d: "2026-09-25", n: 5 }]);
    expect(m.get("b")).toMatchObject({ checked_on: null, live_active_ads: null, history: [], events: [] });
    expect(parseWatch(null).size).toBe(0);
  });

  it("daysAgo cuenta en días UTC", () => {
    const now = new Date("2026-09-25T15:00:00Z");
    expect(daysAgo("2026-09-25", now)).toBe("hoy");
    expect(daysAgo("2026-09-24", now)).toBe("ayer");
    expect(daysAgo("2026-09-20", now)).toBe("hace 5 días");
    expect(daysAgo("basura", now)).toBe("");
  });
});
