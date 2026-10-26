import { describe, expect, it } from "vitest";
import {
  CASILLAS, PLANES, ajustesDe, avance, casillasDelDia, conExtra, diaRD, etiquetaCasilla, instante, marcar, redesDe, semana, siguienteLibre,
} from "./publicar";

describe("Para publicar · casillas en hora de RD", () => {
  it("plan base de 3: reel 12:30, carrusel 18:30, reel 21:00", () => {
    expect(CASILLAS.map(c => `${c.hora} ${c.tipo}`)).toEqual(["12:30 reel", "18:30 carrusel", "21:00 reel"]);
  });
  it("los planes de 5 y 10 tienen esa cantidad de casillas, en orden y sin horas repetidas", () => {
    for (const n of [3, 5, 10] as const) {
      const horas = PLANES[n].map(c => c.hora);
      expect(horas).toHaveLength(n);
      expect([...horas].sort()).toEqual(horas);
      expect(new Set(horas).size).toBe(n);
    }
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
  it("con el plan de 5, la siguiente libre usa sus horas (15:30 antes que 21:00)", () => {
    const ahora = new Date("2026-10-26T16:10:00Z");
    expect(siguienteLibre("reel", [], ahora, d => casillasDelDia({ plan: 5, extras: {} }, d))).toBe(instante("2026-10-26", "15:30"));
  });
  it("una semana son 7 días seguidos", () => {
    expect(semana("2026-10-26")).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
  });
});

describe("Para publicar · casillas extra", () => {
  it("una casilla extra se suma solo a su día, en orden, y no pisa una hora del plan", () => {
    const extras = conExtra({}, "2026-10-27", { hora: "09:15", tipo: "reel" });
    expect(casillasDelDia({ plan: 3, extras }, "2026-10-27").map(c => c.hora)).toEqual(["09:15", "12:30", "18:30", "21:00"]);
    expect(casillasDelDia({ plan: 3, extras }, "2026-10-28")).toHaveLength(3);
    const choca = conExtra({}, "2026-10-27", { hora: "12:30", tipo: "carrusel" });
    expect(casillasDelDia({ plan: 3, extras: choca }, "2026-10-27").find(c => c.hora === "12:30")?.tipo).toBe("reel");
  });
  it("quitar la última extra de un día deja el día limpio", () => {
    const extras = conExtra({}, "2026-10-27", { hora: "09:15", tipo: "reel" });
    expect(conExtra(extras, "2026-10-27", { hora: "09:15", tipo: "reel" }, true)).toEqual({});
  });
  it("ajustes raros vuelven al plan base", () => {
    expect(ajustesDe({ plan: 7, vista: "x", redes: ["myspace"] })).toEqual({ plan: 3, extras: {}, vista: "hoy", redes: ["instagram", "tiktok", "youtube", "facebook"] });
    expect(ajustesDe(null).plan).toBe(3);
    expect(ajustesDe({ plan: 10, vista: "semana", redes: ["tiktok"] })).toMatchObject({ plan: 10, vista: "semana", redes: ["tiktok"] });
  });
});

describe("Para publicar · un toque por red", () => {
  const base = { media_tipo: "reel" as const, pub_redes: ["instagram", "tiktok"], pub_hechas: {}, pub_estado: "programado" as const, pub_job: "j1" };
  const ahora = new Date("2026-10-26T16:41:00Z");
  it("marca la red con hora y quién; con todas sus redes queda publicado", () => {
    const a = marcar(base, "instagram", "yorbana", ahora);
    expect(a.pub_hechas.instagram).toEqual({ at: ahora.toISOString(), por: "yorbana" });
    expect(a.pub_estado).toBe("programado");
    const b = marcar({ ...base, ...a }, "tiktok", "yorbana", ahora);
    expect(b.pub_estado).toBe("publicado");
  });
  it("tocar de nuevo desmarca y la pieza vuelve a programado", () => {
    const listo = marcar(marcar(base, "instagram", null, ahora) as never, "tiktok", null, ahora);
    const des = marcar({ ...base, ...listo }, "tiktok", null, ahora);
    expect(des.pub_hechas.tiktok).toBeUndefined();
    expect(des.pub_estado).toBe("programado");
  });
  it("marcar una red que no estaba elegida la suma a sus redes (se publicó a mano)", () => {
    const a = marcar(base, "facebook", null, ahora);
    expect(a.pub_redes).toEqual(["instagram", "tiktok", "facebook"]);
  });
  it("un carrusel solo cuenta las redes que aceptan carruseles", () => {
    expect(redesDe({ media_tipo: "carrusel", pub_redes: ["instagram", "tiktok", "facebook"] })).toEqual(["instagram", "facebook"]);
  });
  it("el avance cuenta pieza × red, en total y por red", () => {
    const a = avance([
      { media_tipo: "reel", pub_redes: ["instagram", "tiktok"], pub_hechas: { instagram: { at: "x", por: null } } },
      { media_tipo: "carrusel", pub_redes: ["instagram"], pub_hechas: {} },
    ]);
    expect(a.hechas).toBe(1);
    expect(a.total).toBe(3);
    expect(a.porRed.instagram).toEqual({ hechas: 1, total: 2 });
    expect(a.porRed.tiktok).toEqual({ hechas: 0, total: 1 });
  });
});
