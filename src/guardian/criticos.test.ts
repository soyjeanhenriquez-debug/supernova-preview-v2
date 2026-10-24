// Guardián del Creador · pruebas OBLIGATORIAS antes de publicar (corren en `prebuild`: si una falla, no hay deploy).
// Solo entra aquí lo CRÍTICO del manual: cobros, datos de producción, secretos y promesas. Lo demás no bloquea.
import { describe, expect, it } from "vitest";
import { REGLAS, revisar } from "./codeRules";
import { archivosApp } from "./archivos";

const archivos = archivosApp();

describe("Guardián del Creador · controles críticos antes de publicar", () => {
  it("revisa el código real de la app (no una lista vacía)", () => {
    expect(archivos.length).toBeGreaterThan(200);
  });
  for (const r of REGLAS.filter(x => x.severidad === "critico")) {
    it(`${r.id}: ${r.problema}`, () => {
      const malos = revisar(archivos, [r]).map(h => `${h.ruta}:${h.linea} → ${h.texto}`);
      expect(malos, `Bloqueado por el Guardián: ${r.problema}`).toEqual([]);
    });
  }
});

describe("Guardián del Creador · las reglas detectan lo que deben", () => {
  const caso = (ruta: string, texto: string) => revisar([{ ruta, texto }]).map(h => h.regla);
  it("cobro desde el navegador", () => {
    expect(caso("src/lib/x.ts", `await supabase.rpc("debit_credits", { p: 1 })`)).toContain("cobro-desde-navegador");
    expect(caso("src/lib/x.ts", `await supabase.rpc("my_trial_state")`)).toEqual([]);
  });
  it("count exact sobre winning_ads, pero no sobre otras tablas", () => {
    expect(caso("src/lib/x.ts", `supabase.from("winning_ads").select("id", { count: "exact", head: true })`)).toContain("conteo-exacto-winning-ads");
    expect(caso("src/lib/x.ts", `supabase.from("offers").select("id", { count: "exact", head: true })`)).toEqual([]);
  });
  it("dólares por crédito y promesas de ingresos en pantallas de cliente", () => {
    expect(caso("src/pages/X.tsx", `<p>US$0,01 por crédito</p>`)).toContain("dolares-por-credito");
    expect(caso("src/pages/X.tsx", `<p>Gana $500 en 7 días</p>`)).toContain("promesa-de-ingresos");
    expect(caso("src/pages/admin/X.tsx", `<p>US$0,01 por crédito</p>`)).toEqual([]);
  });
  it("los comentarios no cuentan", () => {
    expect(caso("src/lib/x.ts", `// supabase.rpc("debit_credits")`)).toEqual([]);
  });
});
