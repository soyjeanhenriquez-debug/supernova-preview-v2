import { beforeEach, describe, expect, it } from "vitest";
import { LAUNCH_STEPS, endChain, goToStep, readChain, startChain } from "./launchChain";
import { SLUG_PAGE } from "./pageSlugs";

describe("Modelar esta oferta completa (lanzamiento guiado)", () => {
  beforeEach(() => { localStorage.clear(); });

  it("cada paso abre una pantalla real", () => {
    const pages = new Set([...Object.values(SLUG_PAGE), "Generadores"]);
    for (const s of LAUNCH_STEPS) expect(pages.has(s.page), s.page).toBe(true);
  });

  it("empieza en el precio, avanza y deja listo el generador de la página", () => {
    startChain("Guía de repostería", 214);
    expect(readChain()).toMatchObject({ offer: "Guía de repostería", days: 214, step: 0 });
    expect(goToStep(1)).toBe("Generadores");
    expect(JSON.parse(localStorage.getItem("supernova_generator_prefill") || "{}")).toEqual({ generator: "landing-copy" });
    expect(readChain()!.step).toBe(1);
    expect(goToStep(99)).toBeNull();
    endChain();
    expect(readChain()).toBeNull();
  });

  it("sin lanzamiento abierto no hace nada", () => {
    expect(goToStep(1)).toBeNull();
    expect(readChain()).toBeNull();
  });
});
