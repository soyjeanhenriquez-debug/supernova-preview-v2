import { describe, expect, it } from "vitest";
import { bandera, contarNichos, ENLACE_GRUPO, lineaOferta, masDe, resumenGrupo } from "@/lib/resumenGrupo";

describe("resumen para el grupo de WhatsApp", () => {
  it("masDe nunca infla la cifra", () => {
    expect(masDe(8316)).toBe("más de 8.300");
    expect(masDe(950)).toBe("950");
  });

  it("bandera del país y mundo si no hay país", () => {
    expect(bandera("AR")).toBe("🇦🇷");
    expect(bandera(null)).toBe("🌎");
  });

  it("cada oferta dice días pagando, cómo vende y si la haces tú solo; nunca el nombre", () => {
    const l = lineaOferta({ niche: "espiritualidad", market: "AR", days_active: 286, active_ads: 9, canal: "pagina", copy_score: 4 }, 0);
    expect(l).toBe("1. 🔮 Espiritualidad · 🇦🇷 · *286 días pagando* · 9 anuncios activos · 🔗 página de ventas · ✅ lo haces tú solo");
    expect(lineaOferta({ niche: null, market: null, days_active: 1, active_ads: 1, canal: "whatsapp", copy_score: 2 }, 1))
      .toBe("2. ✨ Otro · 🌎 · *1 día pagando* · 1 anuncio activo · 💬 vende por WhatsApp");
  });

  it("arma el mensaje completo y omite lo que no tiene datos", () => {
    const t = resumenGrupo({
      hoy: 23, semana: 65, total: 8316, whatsapp: 100, whatsappGanadoras: 12,
      top: [{ niche: "salud_fitness", market: "ES", days_active: 22, active_ads: 15, canal: "pagina", copy_score: 4 }],
      nichos: contarNichos(["salud_fitness", "salud_fitness", "otro", "belleza_moda", null]),
    }, new Date(2026, 9, 29));
    expect(t).toMatch(/\*23 negocios nuevos\* hoy · 65 esta semana/);
    expect(t).toMatch(/de más de 8\.300 que revisamos/);
    expect(t).toMatch(/Salud y Fitness/);
    expect(t).toMatch(/100 negocios \(12 entre las 300 ganadoras\)/);
    expect(t).toMatch(/Nichos de la semana: Salud y Fitness \(2\) · Belleza y Moda \(1\)$/m);
    expect(t.endsWith(ENLACE_GRUPO)).toBe(true);
    const vacio = resumenGrupo({ hoy: 0, semana: 0, total: 100, top: [], whatsapp: 0, whatsappGanadoras: 0, nichos: [] });
    expect(vacio).not.toMatch(/WhatsApp:|Nichos|pagando anuncios/);
  });
});
