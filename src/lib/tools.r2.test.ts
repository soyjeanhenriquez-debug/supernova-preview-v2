/**
 * R2-15 · Red de seguridad de rutas (12-oct-2026).
 * Lo que se arregla hoy no debe volver a romperse:
 *  - cada herramienta (también las fusionadas dentro de otra y las de admin) abre una pantalla real
 *    de Index.tsx y tiene dirección (#/…) que vuelve a la misma pantalla;
 *  - las ocultas no se borran: su pantalla sigue en Index.tsx y su dirección vieja lleva al Inicio;
 *  - ninguna tarjeta muestra dólares (al cliente solo créditos);
 *  - lo que está en pausa para clientes (Mercado, Oráculo, Media Studio…) no sale en sus cuadrículas.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  TOOL_BY_ID, TOOLS, GRID_TOOLS, HOME_CATEGORIES, MODELS, STUDIO_TOOLS, STUDIO_MORE_TOOLS, FIND_TOOLS,
  MERGED_INTO, HIDDEN_TOOL_IDS, HIDDEN_PAGES, ADMIN_EXTRA_TOOLS,
} from "./tools";
import { PAGE_SLUG, SLUG_PAGE } from "./pageSlugs";
import { ADMIN_ONLY_PAGES } from "./features";

const INDEX_SRC = fs.readFileSync(path.resolve(__dirname, "../pages/Index.tsx"), "utf8");
/** Las pantallas que Index.tsx sabe pintar (`case "X":` del switch de renderPage). */
const INDEX_CASES = new Set([...INDEX_SRC.matchAll(/case\s+"([^"]+)"\s*:/g)].map(m => m[1]));

const ALL = Object.values(TOOL_BY_ID);
const DOLLARS = /US\$|\$|d[óo]lar|USD/i;

describe("R2 · rutas: cada herramienta abre su pantalla", () => {
  it("Index.tsx tiene un case para cada herramienta (también fusionadas, ocultas y de admin)", () => {
    expect(INDEX_CASES.size).toBeGreaterThan(20);
    for (const t of ALL) expect(INDEX_CASES.has(t.key), `${t.id} → "${t.key}" sin pantalla en Index.tsx`).toBe(true);
  });

  it("cada pantalla de herramienta tiene dirección y la dirección vuelve a una pantalla que existe", () => {
    for (const t of ALL) {
      const slug = PAGE_SLUG[t.key];
      expect(slug, `${t.id}: "${t.key}" sin dirección en PAGE_SLUG`).toBeDefined();
      const back = SLUG_PAGE[slug];
      expect(back, `${t.id}: #/${slug} no lleva a ninguna pantalla`).toBeDefined();
      expect(INDEX_CASES.has(back), `${t.id}: #/${slug} → "${back}" sin case en Index.tsx`).toBe(true);
    }
  });

  it("toda dirección conocida (#/x) abre una pantalla que Index.tsx sabe pintar", () => {
    for (const [slug, page] of Object.entries(SLUG_PAGE)) {
      expect(INDEX_CASES.has(page), `#/${slug} → "${page}"`).toBe(true);
    }
  });

  it("las fusionadas siguen abriendo su pantalla y su destino está a la vista", () => {
    for (const [id, into] of Object.entries(MERGED_INTO)) {
      const t = TOOL_BY_ID[id];
      expect(t, id).toBeDefined();
      expect(INDEX_CASES.has(t.key), `${id} → "${t.key}"`).toBe(true);
      expect(TOOLS.includes(t), `${id} debe seguir en el buscador`).toBe(true);
      expect(GRID_TOOLS.some(g => g.id === into), `${id} vive en ${into}, que debe verse`).toBe(true);
    }
  });

  it("las ocultas no se borran: su pantalla sigue en Index.tsx y su dirección lleva al Inicio", () => {
    for (const id of HIDDEN_TOOL_IDS) {
      const t = TOOL_BY_ID[id];
      expect(t, id).toBeDefined();
      expect(INDEX_CASES.has(t.key), `${id}: la pantalla "${t.key}" se borró`).toBe(true);
      expect(HIDDEN_PAGES.has(t.key), `${id}: "${t.key}" debe redirigir al Inicio (HIDDEN_PAGES)`).toBe(true);
      expect(TOOLS.includes(t)).toBe(false);
    }
    // Index.tsx redirige las ocultas tanto al navegar como al abrir por dirección.
    expect(INDEX_SRC).toMatch(/HIDDEN_PAGES\.has\(page\)\s*\?\s*"Dashboard"/);
    expect(INDEX_SRC).toMatch(/HIDDEN_PAGES\.has\(requested\)\s*\?\s*"Dashboard"/);
  });

  it("toda herramienta de un panel, un modelo o el Estudio existe (sin tarjetas vacías)", () => {
    const lists = [...HOME_CATEGORIES.map(c => c.tools), ...MODELS.map(m => m.tools), STUDIO_TOOLS, STUDIO_MORE_TOOLS, FIND_TOOLS];
    for (const l of lists) for (const t of l) expect(t, "pick() con un id que no existe").toBeDefined();
  });
});

describe("R2 · tarjetas: solo créditos, nada en pausa a la vista", () => {
  it("ninguna tarjeta muestra dólares (costo, título, nombre del menú ni descripción)", () => {
    for (const t of ALL) {
      for (const field of [t.cost ?? "", t.title, t.nav, t.desc]) expect(field, `${t.id}: "${field}"`).not.toMatch(DOLLARS);
    }
  });

  it("el costo de cada tarjeta es 'Gratis', algo gratis o N créditos", () => {
    for (const t of ALL) {
      if (!t.cost) continue;
      expect(t.cost, t.id).toMatch(/gratis|cr[ée]ditos|por escena/i);
    }
  });

  it("ninguna tarjeta dice 'clonar' (se dice 'modelar')", () => {
    for (const t of ALL) {
      for (const field of [t.title, t.nav, t.desc]) expect(field, t.id).not.toMatch(/(?<!\p{L})cl[oó]n\p{L}*/iu);
    }
  });

  it("Mercado, Oráculo y Media Studio (solo admin) no están en las listas de clientes", () => {
    for (const t of ADMIN_EXTRA_TOOLS) {
      expect(ADMIN_ONLY_PAGES.has(t.key), `${t.id} ("${t.key}") debería estar en pausa`).toBe(true);
      expect(GRID_TOOLS.includes(t), t.id).toBe(false);
      expect(TOOLS.includes(t), t.id).toBe(false);
      // Si sale en un panel del Inicio (p. ej. "video" en la pestaña Video), DashboardPage lo filtra con canSee.
    }
  });

  it("el Inicio, el menú, el buscador y el menú del teléfono filtran lo que está en pausa (canSee)", () => {
    // Otras tarjetas en pausa (p. ej. "Crear producto") sí viven en las listas: se esconden al pintar.
    for (const f of ["pages/DashboardPage.tsx", "components/Sidebar.tsx", "components/GlobalSearch.tsx", "components/MobileBottomNav.tsx"]) {
      const src = fs.readFileSync(path.resolve(__dirname, "..", f), "utf8");
      expect(src, f).toMatch(/canSee\(/);
    }
  });
});
