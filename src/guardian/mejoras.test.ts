// Guardián del Creador · jerga técnica en lo que ve la persona (MEJORA: no bloquea el deploy).
// Funciona como trinquete: la línea base es lo que había el 24-oct-2026 tras la primera auditoría. Si alguien agrega
// jerga nueva, `npm test` falla y dice dónde. Si la quitas, baja el número aquí.
import { describe, expect, it } from "vitest";
import { revisar } from "./codeRules";
import { archivosApp } from "./archivos";

/** Lo único que queda: «Ver payload completo» en Anuncios ganadores, dentro del panel de depuración que solo ve el admin. */
const LINEA_BASE = 1;

describe("Guardián del Creador · jerga técnica visible", () => {
  it(`no pasa de ${LINEA_BASE} líneas (si baja, actualiza LINEA_BASE)`, () => {
    const h = revisar(archivosApp()).filter(x => x.regla === "jerga-tecnica");
    expect(h.length, h.map(x => `${x.ruta}:${x.linea} ${x.texto}`).join("\n")).toBeLessThanOrEqual(LINEA_BASE);
  });
});
