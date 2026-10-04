import { describe, expect, it } from "vitest";
import { PAGE_SLUG, SLUG_PAGE } from "./pageSlugs";
import { SEED_TARGETS, TARGET_PAGE, TARGET_SLUG } from "./creativeSeed";

describe("direcciones de pantalla", () => {
  it("cada destino de la semilla abre su pantalla real (TARGET_SLUG ↔ SLUG_PAGE)", () => {
    for (const t of SEED_TARGETS) {
      expect(SLUG_PAGE[TARGET_SLUG[t]]).toBe(TARGET_PAGE[t]);
      expect(PAGE_SLUG[TARGET_PAGE[t]]).toBe(TARGET_SLUG[t]);
    }
  });
  it("ida y vuelta: cada slug vuelve a la misma pantalla", () => {
    for (const page of Object.values(SLUG_PAGE)) expect(SLUG_PAGE[PAGE_SLUG[page]]).toBe(page);
  });
  it("las pantallas nuevas del plan ATLAS tienen dirección", () => {
    expect(SLUG_PAGE.ideas).toBe("Ideas");
    expect(SLUG_PAGE["fotos-ugc"]).toBe("Fotos UGC");
    expect(SLUG_PAGE["foto-producto"]).toBe("Foto de producto");
    expect(SLUG_PAGE["video-anuncio"]).toBe("Video anuncio");
    expect(SLUG_PAGE.ugc).toBe("UGC con IA");
  });
});
