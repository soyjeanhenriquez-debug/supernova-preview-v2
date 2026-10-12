/**
 * R2-15 · "Hacer mi versión" (recibo de hoy, 12-oct-2026): los siguientes pasos llevan a pantallas que
 * existen, su costo sale de CREDIT_COSTS y se dice en créditos (nunca dólares por crédito).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NEXT_STEPS } from "./miVersion";
import { CREDIT_COSTS } from "@/hooks/useCredits";
import { PAGE_SLUG } from "@/lib/pageSlugs";

const INDEX_SRC = fs.readFileSync(path.resolve(__dirname, "../../pages/Index.tsx"), "utf8");
const CASES = new Set([...INDEX_SRC.matchAll(/case\s+"([^"]+)"\s*:/g)].map(m => m[1]));

describe("R2 · Mi versión: siguientes pasos", () => {
  it("cada paso abre una pantalla real con dirección", () => {
    expect(NEXT_STEPS.length).toBeGreaterThan(0);
    for (const s of NEXT_STEPS) {
      expect(CASES.has(s.page), `${s.id} → "${s.page}"`).toBe(true);
      expect(PAGE_SLUG[s.page], `${s.id}: sin dirección`).toBeDefined();
    }
  });

  it("el costo se dice en créditos, sin dólares", () => {
    for (const s of NEXT_STEPS) {
      expect(s.cost, s.id).toMatch(/cr[ée]ditos|gratis/i);
      expect(s.cost, s.id).not.toMatch(/US\$|\$|d[óo]lar/i);
    }
  });

  it("el video dice el precio aprobado de una toma (75)", () => {
    const video = NEXT_STEPS.find(s => s.id === "video");
    if (video) expect(video.cost).toContain(String(CREDIT_COSTS.vid_mini_5));
  });
});
