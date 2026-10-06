import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { feedbackSummary, type Feedback } from "./creationFeedback";
import { parseClone } from "./carousel";

const f = (tool: string, helpful: boolean): Feedback => ({ id: Math.random().toString(), user_id: "u", tool, ref_id: null, helpful, note: null, context: {}, created_at: "" });

describe("aprendizaje: ¿les sirvió?", () => {
  it("cuenta sí y no por herramienta, con los muros (más 'no') primero", () => {
    const s = feedbackSummary([f("carrusel", true), f("carrusel-clon", false), f("carrusel-clon", false), f("carrusel-clon", true), f("carrusel", true)]);
    expect(s[0]).toEqual({ tool: "carrusel-clon", yes: 1, no: 2 });
    expect(s[1]).toEqual({ tool: "carrusel", yes: 2, no: 0 });
  });

  it("el clon guarda su id solo si es un uuid válido", () => {
    const base = { analisis: {}, adn: [], carrusel: { portadas: [{ titulo: "Hola *mundo*" }], laminas: [{ tipo: "galeria", items: [{ titulo: "/a", texto: "x" }] }, { tipo: "solucion", titulo: "y" }, { tipo: "llamada", titulo: "z", palabra: "YA" }] } };
    expect(parseClone({ ...base, clone_id: "6f1c2a7e-1b2c-4d5e-8f90-123456789abc" })!.info.id).toBe("6f1c2a7e-1b2c-4d5e-8f90-123456789abc");
    expect(parseClone({ ...base, clone_id: "<script>" })!.info.id).toBeUndefined();
  });
});

import { feedbackLine } from "./creationFeedback";
describe("aprendizaje: respuestas legibles", () => {
  it("traduce la respuesta de la pregunta semanal", () => {
    expect(feedbackLine({ ...f("resultados", true), context: { pieza: "Cambia el ángulo", respuesta: "anotado", leads: 12, ventas: 1 } })).toBe("«Cambia el ángulo»: 12 personas le escribieron, 1 ventas");
    expect(feedbackLine({ ...f("resultados", false), note: "las fotos no salían igual", context: { pieza: "X", respuesta: "no-sirvio" } })).toBe('«X»: No le sirvió — "las fotos no salían igual"');
  });
});
