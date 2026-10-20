import { describe, expect, it } from "vitest";
import { bloquesDeVoz, costo, historiaRequest, MAX_ANIMADAS, palabrasVozIA, parseHistoria, PAUSA, tiemposTuVoz, tiemposVozIA, type Escena } from "./historia";

const IA = "```json\n" + JSON.stringify({
  titulo: "De perdido a enfocado",
  capitulos: [
    { rotulo: "18 años: perdido", escenas: [
      { tipo: "imagen", narracion: "A los 18 no sabía qué hacer con mi vida", visual: "el protagonista de 18 años en su cuarto", animar: false },
      { tipo: "imagen", narracion: "Mis papás me dieron un año", visual: "su papá serio en la sala", animar: true },
      { tipo: "imagen", narracion: "sin visual se descarta", visual: "" },
    ] },
    { rotulo: "", escenas: [] },
    { rotulo: "El cambio", escenas: [
      { tipo: "negro", narracion: "Hasta que un día", visual: "esto no va" },
      { tipo: "imagen", narracion: "Empecé a entrenar cada mañana", visual: "el protagonista en un gimnasio", animar: true },
    ] },
  ],
}) + "\n```";

describe("Mi historia animada", () => {
  it("el pedido trae la historia como datos y las reglas sin cifras de dinero", () => {
    const r = historiaRequest("Me fui de mi casa a los 18");
    expect(r).toContain("Me fui de mi casa a los 18");
    expect(r).toMatch(/Nada de cifras de ingresos/);
    expect(r).toMatch(/Responde SOLO con JSON/);
  });

  it("lee la respuesta, descarta escenas sin visual y capítulos vacíos", () => {
    const h = parseHistoria(IA)!;
    expect(h.titulo).toBe("De perdido a enfocado");
    expect(h.capitulos).toEqual(["18 años: perdido", "El cambio"]);
    expect(h.escenas.map(e => e.tipo)).toEqual(["imagen", "imagen", "negro", "imagen"]);
    expect(h.escenas[2]).toMatchObject({ capitulo: 1, visual: "", animar: false });
    expect(parseHistoria("no es json")).toBeNull();
  });

  it("no deja animar más de lo permitido", () => {
    const escenas = Array.from({ length: 10 }, () => ({ tipo: "imagen", narracion: "algo pasa", visual: "una escena", animar: true }));
    const h = parseHistoria(JSON.stringify({ capitulos: [{ rotulo: "x", escenas }] }))!;
    expect(h.escenas.filter(e => e.animar)).toHaveLength(MAX_ANIMADAS);
  });

  it("agrupa la voz por capítulo y corta en 600 caracteres", () => {
    const larga = (c: number): Escena => ({ capitulo: c, narracion: "x".repeat(250), visual: "v", tipo: "imagen", animar: false });
    expect(bloquesDeVoz([larga(0), larga(0), larga(0), larga(1)])).toEqual([[0, 1], [2], [3]]);
  });

  it("reparte el audio de cada bloque entre sus escenas según las palabras", () => {
    const h = parseHistoria(IA)!;
    const bloques = bloquesDeVoz(h.escenas);
    expect(bloques).toEqual([[0, 1], [2, 3]]);
    const { escenas, audios } = tiemposVozIA(h.escenas, bloques, [6, 4]);
    expect(audios).toEqual([0, 6 + PAUSA]);
    expect(escenas[0].t0).toBe(0);
    expect(escenas[1].t1).toBeCloseTo(6, 5);
    expect(escenas[0].t1 - escenas[0].t0).toBeGreaterThan(escenas[1].t1 - escenas[1].t0); // más palabras, más tiempo
    expect(escenas[3].t1).toBeCloseTo(6 + PAUSA + 4, 5);
    // Las escenas en negro no llevan subtítulo: su frase ya está en pantalla.
    expect(palabrasVozIA(h.escenas, escenas).map(w => w.w)).not.toContain("Hasta");
  });

  it("con tu voz, cada escena empieza donde va su primera palabra", () => {
    const h = parseHistoria(IA)!;
    const palabras = Array.from({ length: 30 }, (_, i) => ({ t0: i * 0.5, t1: i * 0.5 + 0.4, w: "p" }));
    const t = tiemposTuVoz(h.escenas, palabras, 15);
    expect(t[0].t0).toBe(0);
    expect(t[3].t1).toBe(15);
    for (let i = 1; i < t.length; i++) expect(t[i].t0).toBeCloseTo(t[i - 1].t1, 5);
    expect(t[1].t0).toBeGreaterThan(t[0].t0);
  });

  it("calcula el costo antes de gastar", () => {
    const h = parseHistoria(IA)!;
    // 3 imágenes × 6 + 2 animadas × 75 + 2 voces × 5 + personaje 6
    expect(costo(h, { vozIA: true, conPersonaje: false })).toBe(18 + 150 + 10 + 6);
    expect(costo(h, { vozIA: false, conPersonaje: true })).toBe(18 + 150 + 20);
  });
});
