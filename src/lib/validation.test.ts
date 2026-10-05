import { describe, it, expect } from "vitest";
import {
  QUESTIONS, TOTAL, normalizeAnswers, overallScore, blockScore, verdict, nextStep, suggestions,
  regulatedTopic, seasonalWord, defaultKeyword, keywordWords, summarizeRadar, fmt, type Answers,
} from "./validation";

const all = (a: "si" | "no" | "nose"): Answers => Object.fromEntries(QUESTIONS.map(q => [q.id, a]));

describe("validation · preguntas", () => {
  it("se mantienen entre 12 y 14, con producto y mercado, y cada una dice cómo saberlo", () => {
    expect(TOTAL).toBeGreaterThanOrEqual(12);
    expect(TOTAL).toBeLessThanOrEqual(14);
    expect(QUESTIONS.some(q => q.block === "producto")).toBe(true);
    expect(QUESTIONS.some(q => q.block === "mercado")).toBe(true);
    for (const q of QUESTIONS) expect(q.how.length).toBeGreaterThan(20);
    expect(new Set(QUESTIONS.map(q => q.id)).size).toBe(TOTAL);
  });
});

describe("validation · respuestas guardadas", () => {
  it("lee true/false viejos como sí/no y descarta ids y valores raros", () => {
    expect(normalizeAnswers({ p_problema: true, m_dinero: false, p_frase: "nose", viejo: true, p_giro: "quizas" }))
      .toEqual({ p_problema: "si", m_dinero: "no", p_frase: "nose" });
    expect(normalizeAnswers(null)).toEqual({});
  });

  it("una matriz vieja completa sigue completa con los mismos ids", () => {
    const old = Object.fromEntries(QUESTIONS.map(q => [q.id, true]));
    expect(Object.keys(normalizeAnswers(old))).toHaveLength(TOTAL);
  });
});

describe("validation · nota", () => {
  it("Sí = 100, No = 0 y No sé = 50", () => {
    expect(overallScore(all("si"))).toBe(100);
    expect(overallScore(all("no"))).toBe(0);
    expect(overallScore(all("nose"))).toBe(50);
    expect(overallScore({})).toBeNull();
  });

  it("respeta el peso: un No importante pesa el doble", () => {
    const a = { ...all("si"), p_problema: "no" as const };
    const b = { ...all("si"), p_frase: "no" as const };
    expect(blockScore("producto", a)!).toBeLessThan(blockScore("producto", b)!);
  });

  it("con muchos No sé el veredicto no finge certeza", () => {
    const a: Answers = { ...all("si"), p_problema: "nose", p_frase: "nose", p_giro: "nose", m_alcance: "nose" };
    expect(verdict(overallScore(a)!, a).tone).toBe("unsure");
    expect(verdict(100, all("si")).tone).toBe("good");
    expect(verdict(30, all("no")).tone).toBe("bad");
  });
});

describe("validation · siguiente paso", () => {
  it("prioriza arreglar un No importante, luego comprobar, luego precio", () => {
    expect(nextStep({ ...all("si"), m_permitido: "no", p_giro: "nose" })).toMatchObject({ kind: "fix", question: { id: "m_permitido" } });
    expect(nextStep({ ...all("si"), p_giro: "nose", p_prueba_venta: "nose" })).toMatchObject({ kind: "check", question: { id: "p_prueba_venta" } });
    expect(nextStep(all("si"))).toEqual({ kind: "price" });
    const lowNoKey: Answers = Object.fromEntries(QUESTIONS.map(q => [q.id, q.weight === 2 ? "si" : "no"]));
    expect(nextStep(lowNoKey).kind).toBe(overallScore(lowNoKey)! >= 50 ? "price" : "change");
  });
});

describe("validation · sugerencias de la ficha", () => {
  it("detecta temas regulados y de temporada", () => {
    expect(regulatedTopic("Plan para bajar de peso en 30 días")).toBe("salud o el cuerpo");
    expect(regulatedTopic("Curso de trading para principiantes")).toBe("dinero fácil o inversiones");
    expect(regulatedTopic("Pronósticos de apuestas deportivas")).toBe("apuestas");
    expect(regulatedTopic("Recetario para freidora de aire")).toBeNull();
    expect(regulatedTopic("Cómo procurar tu bienestar")).toBeNull();
    expect(seasonalWord("Adornos de Navidad hechos a mano")).toBe("navidad");
    expect(seasonalWord("Plantillas de Canva")).toBeNull();
  });

  it("sugiere, nunca obliga: devuelve respuesta y motivo", () => {
    const s = suggestions({ product: "Guía detox para bajar de peso", who: "mamás", proof: "12 alumnas lo probaron", business_type: "infoproducto" });
    expect(s.m_permitido.answer).toBe("no");
    expect(s.p_testimonios.answer).toBe("si");
    expect(s.p_entrega.answer).toBe("si");
    expect(suggestions({ product: "Plantillas de Canva", who: "emprendedoras" }).m_permitido.answer).toBe("si");
  });
});

describe("validation · Radar", () => {
  it("saca palabras clave sin relleno", () => {
    expect(keywordWords("Curso de inglés para niños")).toEqual(["ingles", "ninos"]);
    expect(defaultKeyword("Recetario para freidora de aire")).toBe("recetario freidora");
  });

  it("resume la respuesta de radar_search con ejemplos y anunciantes distintos", () => {
    const r = summarizeRadar({ total: 37, capped: false, rows: [
      { page_name: "Cocina Fácil", days_active: 210.4 },
      { page_name: "cocina fácil", days_active: 150 },
      { advertiser: "Recetas Ya", days_active: 90 },
      { page_name: "Air Chef", days_active: 45 },
    ] });
    expect(r.total).toBe(37);
    expect(r.advertisers).toBe(3);
    expect(r.examples[0]).toEqual({ name: "Cocina Fácil", days: 210 });
    expect(summarizeRadar(null)).toMatchObject({ total: 0, advertisers: 0, examples: [] });
  });

  it("formatea números en español", () => {
    expect(fmt(2000)).toBe("2.000");
    expect(fmt(37)).toBe("37");
  });
});
