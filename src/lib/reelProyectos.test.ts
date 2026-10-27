import { describe, expect, it } from "vitest";
import { guardarEnLista, keyActual, keyLista, leerLista, MAX_PROYECTOS, quitarDeLista, unirListas } from "./reelProyectos";

const store = (data: Record<string, string>) => ({ getItem: (k: string) => data[k] ?? null });
type P = { id: string; origen: string | null; actualizado?: number; idea?: string };

describe("Reel Studio guarda varios reels (27-oct-2026)", () => {
  it("el reel suelto de antes pasa a la lista sin perderse", () => {
    const viejo: P = { id: "a", origen: "referencia", idea: "Diego" };
    const l = leerLista<P>(store({ [keyActual("u")]: JSON.stringify(viejo) }), "u");
    expect(l.map(p => p.id)).toEqual(["a"]);
  });
  it("no duplica el reel suelto si ya está en la lista y ordena por lo más reciente", () => {
    const l = leerLista<P>(store({
      [keyActual("u")]: JSON.stringify({ id: "a", origen: "guion", actualizado: 1 }),
      [keyLista("u")]: JSON.stringify([{ id: "a", origen: "guion", actualizado: 1 }, { id: "b", origen: "idea", actualizado: 5 }]),
    }), "u");
    expect(l.map(p => p.id)).toEqual(["b", "a"]);
  });
  it("si el abierto es más nuevo que su copia en la lista, manda el abierto", () => {
    const l = leerLista<P>(store({
      [keyActual("u")]: JSON.stringify({ id: "a", origen: "guion", idea: "nuevo", actualizado: 9 }),
      [keyLista("u")]: JSON.stringify([{ id: "a", origen: "guion", idea: "viejo", actualizado: 1 }]),
    }), "u");
    expect(l).toHaveLength(1);
    expect(l[0].idea).toBe("nuevo");
  });
  it("un reel sin empezar (sin origen) no entra a la lista", () => {
    expect(leerLista<P>(store({ [keyActual("u")]: JSON.stringify({ id: "x", origen: null }) }), "u")).toEqual([]);
  });
  it("empezar otro no borra el anterior: los dos quedan, el último arriba", () => {
    let l: P[] = [];
    l = guardarEnLista(l, { id: "a", origen: "referencia" }, 1).list;
    l = guardarEnLista(l, { id: "b", origen: "guion" }, 2).list;
    expect(l.map(p => p.id)).toEqual(["b", "a"]);
    l = guardarEnLista(l, { id: "a", origen: "referencia" }, 3).list;
    expect(l.map(p => p.id)).toEqual(["a", "b"]);
  });
  it(`guarda hasta ${MAX_PROYECTOS}; al pasar, avisa cuál salió (el más viejo)`, () => {
    let l: P[] = [];
    for (let i = 0; i < MAX_PROYECTOS; i++) l = guardarEnLista(l, { id: `p${i}`, origen: "idea" }, i).list;
    const r = guardarEnLista(l, { id: "nuevo", origen: "idea" }, 999);
    expect(r.list).toHaveLength(MAX_PROYECTOS);
    expect(r.fuera?.id).toBe("p0");
    expect(quitarDeLista(r.list, "nuevo").some(p => p.id === "nuevo")).toBe(false);
  });
  it("una lista dañada no rompe la pantalla", () => {
    expect(leerLista<P>(store({ [keyLista("u")]: "{no es json" }), "u")).toEqual([]);
  });
  it("dos pestañas abiertas: al unir, no se pierde ningún reel y queda la versión más nueva", () => {
    const estaPestana: P[] = [{ id: "diego", origen: "referencia", idea: "vieja", actualizado: 1 }];
    const otraPestana: P[] = [{ id: "g3", origen: "guion", actualizado: 5 }, { id: "diego", origen: "referencia", idea: "nueva", actualizado: 4 }];
    const l = unirListas(estaPestana, otraPestana);
    expect(l.map(p => p.id)).toEqual(["g3", "diego"]);
    expect(l.find(p => p.id === "diego")?.idea).toBe("nueva");
  });
});
