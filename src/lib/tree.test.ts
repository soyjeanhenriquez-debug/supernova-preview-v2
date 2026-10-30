/**
 * El árbol (21-oct-2026): 4 ramas, 14 hojas, y cada pestaña abre una pantalla que ya existe.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { TREE, treeSpot, nextAction, branchDone, leafById } from "./tree";
import { PAGE_SLUG, SLUG_PAGE } from "./pageSlugs";
import { TOOL_BY_ID, HIDDEN_TOOL_IDS, ADMIN_EXTRA_TOOLS } from "./tools";

const INDEX_SRC = fs.readFileSync(path.resolve(__dirname, "../pages/Index.tsx"), "utf8");
const INDEX_CASES = new Set([...INDEX_SRC.matchAll(/case\s+"([^"]+)"\s*:/g)].map(m => m[1]));
const GEN_SRC = fs.readFileSync(path.resolve(__dirname, "./generators.ts"), "utf8");
const tabs = TREE.flatMap(b => b.leaves.flatMap(l => l.tabs));

describe("El árbol de SUPERNOVA", () => {
  it("tiene 4 ramas numeradas y 15 hojas (29-oct: «Elige qué lanzar», Ulises)", () => {
    expect(TREE.map(b => b.n)).toEqual([1, 2, 3, 4]);
    expect(TREE.flatMap(b => b.leaves)).toHaveLength(15);
  });

  it("cada pestaña abre una pantalla de Index.tsx con dirección propia", () => {
    for (const t of tabs) {
      expect(INDEX_CASES.has(t.page), `"${t.label}" → "${t.page}" sin case en Index.tsx`).toBe(true);
      expect(PAGE_SLUG[t.page], `"${t.page}" sin dirección`).toBeDefined();
      if (t.hash) expect(SLUG_PAGE[t.hash.replace(/^#\//, "").split("/")[0]]).toBe(t.page);
      if (t.generator) expect(GEN_SRC.includes(`"${t.generator}"`), `generador ${t.generator} no existe`).toBe(true);
    }
    expect(SLUG_PAGE.paso).toBe("Paso");
    expect(INDEX_CASES.has("Paso")).toBe(true);
  });

  it("no deja fuera ninguna herramienta visible para clientes", () => {
    const pages = new Set(tabs.map(t => `${t.page}|${t.generator ?? ""}`));
    const outside = Object.values(TOOL_BY_ID)
      .filter(t => !HIDDEN_TOOL_IDS.has(t.id) && !ADMIN_EXTRA_TOOLS.includes(t))
      .filter(t => !pages.has(`${t.key}|${t.generator ?? ""}`))
      // Viven como modo dentro de otra pantalla del árbol (Creativos, Video con IA).
      .filter(t => !["fotosugc", "fotoproducto", "videoia", "series", "motion", "concara"].includes(t.id));
    expect(outside.map(t => t.id)).toEqual([]);
  });

  it("ubica cada pantalla en su hoja, también los pasos y los generadores", () => {
    expect(treeSpot("Mini Apps")?.leaf.id).toBe("ofertas");
    expect(treeSpot("Con tu cara", "#/con-tu-cara/reel/abc")?.tab.label).toBe("Analiza un Reel");
    expect(treeSpot("Con tu cara", "#/con-tu-cara/reel/abc")?.door?.id).toBe("con-cara");
    expect(treeSpot("Generadores", "", "vsl-main")?.tab.label).toBe("Guion de VSL");
    expect(treeSpot("Generadores", "", "yt-script")?.leaf.id).toBe("video");
    expect(treeSpot("Generadores")?.tab.label).toBe("Todos");
    expect(treeSpot("Créditos")).toBeNull();
    expect(leafById("video")?.branch.n).toBe(3);
  });

  it("Tu norte da una sola acción, en orden, con las reglas de las 6 etapas", () => {
    const none = [false, false, false, false, false, false];
    expect(nextAction(none)).toMatchObject({ branch: 1, page: "Ofertas" });
    expect(nextAction([true, false, false, false, false, false])).toMatchObject({ branch: 2, page: "Precio" });
    expect(nextAction([true, false, true, false, false, false])).toMatchObject({ branch: 2, page: "Plan" });
    expect(nextAction([true, false, true, true, false, false])).toMatchObject({ branch: 3, page: "Mándala" });
    expect(nextAction([true, false, true, true, true, false])).toMatchObject({ branch: 4, page: "Resultados" });
    // Validar es opcional: no frena la rama 2.
    expect(branchDone([true, false, true, true, false, false])).toEqual([true, true, false, false]);
  });
});
