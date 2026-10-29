import { describe, expect, it } from "vitest";
import { AGENTES, EQUIPO, separarAvance, siguientePaso } from "@/lib/agentes";
import { AVANCE_DE, conMision, conMisionDe, formatoDe } from "../../supabase/functions/_shared/misionAgente";

describe("equipo de agentes", () => {
  it("13 agentes con nombres conocidos y libres, ninguno de marcas con dueño", () => {
    expect(EQUIPO).toHaveLength(13);
    for (const id of EQUIPO) expect(AGENTES[id].nombre).not.toMatch(/iron man|thor|hulk|capit[aá]n am[eé]rica|viuda negra|hawkeye|wanda|spider|marvel|vengador|heisenberg|walter white|stark|lannister|targaryen|jon snow/i);
  });
  it("cada agente cierra con una pregunta de avance y su siguiente existe en el equipo", () => {
    for (const id of EQUIPO) {
      const a = AGENTES[id];
      expect(a.avance.trim().endsWith("?")).toBe(true);
      if (a.siguiente) expect(EQUIPO).toContain(a.siguiente);
    }
  });
  it("siguientePaso solo lleva a herramientas que ya existen", () => {
    expect(siguientePaso("producto")).toBeNull(); // La Fortaleza (página) todavía no existe
    expect(siguientePaso("ventas")?.nombre).toBe("Robin Hood");
    expect(siguientePaso("reels")?.ruta).toBe("carrusel");
  });
});

describe("misión aplicada a las herramientas (29-oct-2026)", () => {
  it("la pregunta de avance del servidor es la misma del registro", () => {
    expect(Object.keys(AVANCE_DE).sort()).toEqual([...EQUIPO].sort());
    for (const id of EQUIPO) expect(AVANCE_DE[id]).toBe(AGENTES[id].avance);
  });
  it("cada agente tiene etiqueta para su encabezado", () => {
    for (const id of EQUIPO) expect(AGENTES[id].etiqueta).toMatch(/^tu /);
  });
  it("separarAvance saca la pregunta del texto para publicar", () => {
    const r = separarAvance("# Anuncio\nTexto del anuncio.\n\n---\nSiguiente paso: ¿Hacemos los anuncios que traen gente a tu WhatsApp?");
    expect(r.cuerpo).toBe("# Anuncio\nTexto del anuncio.");
    expect(r.pregunta).toBe("¿Hacemos los anuncios que traen gente a tu WhatsApp?");
    expect(separarAvance("Texto.\n**Siguiente paso:** ¿Lo publicas hoy?")).toEqual({ cuerpo: "Texto.", pregunta: "¿Lo publicas hoy?" });
    const t = "Correo 1\n---\nCorreo 2";
    expect(separarAvance(t)).toEqual({ cuerpo: t, pregunta: null });
  });
  it("en JSON el formato manda; en texto la pregunta apunta al siguiente paso", () => {
    const j = conMisionDe("reels", "Responde SOLO con JSON válido.", formatoDe("Responde SOLO con JSON válido."));
    expect(j).toContain("nada antes ni después del JSON");
    expect(j).not.toContain("Tu pregunta de avance lleva a este paso");
    const t = conMisionDe("ventas", "Escribe el anuncio.", "texto");
    expect(t).toContain("Siguiente paso:");
    expect(t).toContain(AGENTES.ventas.avance);
    expect(conMision("x")).toContain("MISIÓN DEL EQUIPO SUPERNOVA");
  });
});
