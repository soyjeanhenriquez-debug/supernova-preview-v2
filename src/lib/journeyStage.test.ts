import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { STAGES, PAGE_STAGE, stageHint } from "./journey";
import { TOOLS, ADMIN_EXTRA_TOOLS } from "./tools";

const D = (...ok: number[]) => [1, 2, 3, 4, 5, 6].map(n => ok.includes(n));

describe("barra de etapa", () => {
  it("la herramienta principal de cada etapa pertenece a esa etapa", () => {
    for (const s of STAGES) expect(PAGE_STAGE[s.page]).toBe(s.n);
  });

  it("toda herramienta del Inicio, el menú y el buscador abre una pantalla real", () => {
    // Navegación por intención (03-oct-2026): src/lib/tools.ts manda en el menú. Si una clave no
    // tiene su case en Index.tsx, la tarjeta llevaría al Inicio sin avisar.
    const src = readFileSync("src/pages/Index.tsx", "utf8");
    for (const t of [...TOOLS, ...ADMIN_EXTRA_TOOLS]) expect(src.includes(`case "${t.key}":`), t.key).toBe(true);
  });

  it("en su etapa actual", () => {
    expect(stageHint("Validar", D(1), 2)).toEqual({ kind: "current", stage: 2, next: 2 });
  });

  it("etapa lista: ofrece la siguiente", () => {
    expect(stageHint("Precio", D(1, 2, 3), 4)).toEqual({ kind: "done", stage: 3, next: 4 });
    // Volver a una etapa vieja ya hecha también la da por lista.
    expect(stageHint("Ofertas", D(1, 2, 3), 4).kind).toBe("done");
  });

  it("se adelantó: no bloquea, recuerda la que falta", () => {
    expect(stageHint("Mándala", D(1), 2)).toEqual({ kind: "ahead", stage: 5, next: 2 });
  });

  it("pantallas sin etapa y todo completo", () => {
    expect(stageHint("Créditos", D(), 1)).toEqual({ kind: "none", stage: null, next: 1 });
    expect(stageHint("Dashboard", D(1, 2), 3).kind).toBe("none");
    expect(stageHint("Resultados", D(1, 2, 3, 4, 5, 6), null).kind).toBe("all_done");
  });

  it("etapa marcada a mano sin las anteriores (p. ej. 4 hecha con 'Ya lo hice')", () => {
    expect(stageHint("Plan", D(1, 4), 2)).toEqual({ kind: "done", stage: 4, next: 2 });
  });
});
