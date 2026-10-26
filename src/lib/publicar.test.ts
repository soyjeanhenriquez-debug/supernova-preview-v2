import { describe, expect, it } from "vitest";
import { CASILLAS, diaRD, etiquetaCasilla, instante, semana, siguienteLibre } from "./publicar";

describe("Para publicar · casillas en hora de RD", () => {
  it("3 casillas: reel 12:30, carrusel 18:30, reel 21:00", () => {
    expect(CASILLAS.map(c => `${c.hora} ${c.tipo}`)).toEqual(["12:30 reel", "18:30 carrusel", "21:00 reel"]);
  });
  it("las 21:00 de RD son la 01:00 UTC del día siguiente", () => {
    expect(instante("2026-10-26", "21:00")).toBe("2026-10-27T01:00:00.000Z");
    expect(etiquetaCasilla("2026-10-27T01:00:00.000Z")).toBe("lun 26 oct · 21:00");
  });
  it("el día en RD cambia a la medianoche de RD, no de UTC", () => {
    expect(diaRD(new Date("2026-10-27T02:00:00Z"))).toBe("2026-10-26");
  });
  it("la siguiente casilla libre salta las ocupadas y las que ya pasaron (con 30 min de margen)", () => {
    const ahora = new Date("2026-10-26T16:10:00Z"); // 12:10 en RD: la de 12:30 está a 20 min → no sirve
    expect(siguienteLibre("reel", [], ahora)).toBe(instante("2026-10-26", "21:00"));
    expect(siguienteLibre("reel", [instante("2026-10-26", "21:00")], ahora)).toBe(instante("2026-10-27", "12:30"));
    expect(siguienteLibre("carrusel", [], ahora)).toBe(instante("2026-10-26", "18:30"));
  });
  it("una semana son 7 días seguidos", () => {
    expect(semana("2026-10-26")).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
  });
});
