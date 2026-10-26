import { describe, expect, it } from "vitest";
import { cleanAnalisis, espejoReel, parseEspejo, pedidoEspejo } from "@/lib/reelDinamico";

// Ficha real (primeros 8 planos y 6 frases) de la plantilla de Diego Vetencourt, 26-oct-2026.
const a = cleanAnalisis({
  idioma: "es", duracion: 16.2, resumen: "5 proyectos de Claude",
  gancho: { texto: "Es estúpida la cantidad de personas que tienen Claude" },
  planos: [
    { t0: 0, t1: 1, forma: "tu", camara: "picado gran angular", descripcion: "Presentador de pie mirando hacia arriba con gafas oscuras, fondo blanco.", protagonista: true, texto_pantalla: "Es estúpida" },
    { t0: 1, t1: 2, forma: "broll", camara: "plano medio lateral", descripcion: "Mujer en escritorio con iMac junto a una ventana.", protagonista: false, texto_pantalla: "de personas" },
    { t0: 2, t1: 3, forma: "broll", camara: "plano detalle con destellos", descripcion: "Fondo decorativo con filtraciones de luz.", protagonista: false, texto_pantalla: "Claude" },
    { t0: 3, t1: 5.67, forma: "dividida", camara: "pantalla dividida", descripcion: "Arriba GitHub de Claude; abajo el presentador con fondo azul.", protagonista: true, texto_pantalla: "5 proyectos / usar / semanas" },
    { t0: 5.67, t1: 7, forma: "tu", camara: "plano entero contrapicado", descripcion: "Presentador apoyando un pie sobre un televisor de tubo.", protagonista: true, texto_pantalla: "ingresos" },
    { t0: 7, t1: 9.5, forma: "tu", camara: "plano medio frontal", descripcion: "Presentador sentado en sillón azul, fondo blanco.", protagonista: true, texto_pantalla: "es el más / personas" },
    { t0: 9.5, t1: 11.67, forma: "dividida", camara: "pantalla dividida", descripcion: "Arriba GitHub de AgentKit; abajo presentador sentado en el suelo con laptop.", protagonista: true, texto_pantalla: "agentKit" },
    { t0: 11.67, t1: 16.2, forma: "app", camara: "captura de pantalla móvil", descripcion: "Chat de WhatsApp automatizado.", protagonista: false, texto_pantalla: "de WhatsApp" },
  ],
  transcripcion: [
    { t0: 0, t1: 2.2, texto: "Es estúpida la cantidad de personas que tienen Claude" },
    { t0: 2.2, t1: 5.8, texto: "y no conocen estos 5 proyectos que puedes usar en las próximas semanas para generar ingresos." },
    { t0: 5.8, t1: 8.5, texto: "El quinto es el más brutal, pero menos personas lo conocen." },
    { t0: 8.5, t1: 11.2, texto: "El primero es el proyecto WhatsApp AgentKit," },
    { t0: 11.2, t1: 14.5, texto: "un agente de WhatsApp que atiende a los clientes de cualquier negocio solo," },
    { t0: 14.5, t1: 16.2, texto: "Comenta CLAUDE y te lo mando." },
  ],
}, 16.2)!;

const ia = JSON.stringify({
  titulo: "5 PROYECTOS DE CLAUDE",
  frases: ["Es una locura cuánta gente", "y no conoce estos 5 proyectos que puedes usar en las próximas semanas para generar ingresos.",
    "El quinto es el más potente, y casi nadie lo conoce.", "El primero es el proyecto WhatsApp AgentKit,",
    "un agente de WhatsApp que atiende solo a los clientes de cualquier negocio,", "Comenta CLAUDE y te lo mando."],
  planos: [{ persona: "standing, looking up at a high wide-angle camera, white background", visual: "" }, { persona: "", visual: "woman at a desk with an iMac by a window" }],
});

describe("ESPEJO armado plano por plano", () => {
  it("el pedido lleva cada frase y cada plano numerados, y la palabra de la persona", () => {
    const q = pedidoEspejo(a, { palabra: "NEGOCIO", cambiarGancho: false, ropa: "" });
    expect(q).toMatch(/0\. \[0\.0–2\.2 s\] Es estúpida la cantidad/);
    expect(q).toMatch(/7\. app · captura de pantalla móvil/);
    expect(q).toMatch(/«NEGOCIO»/);
    expect(q).toMatch(/la primera frase se queda igual/);
  });
  it("mismo número de planos, mismo orden y misma forma; gancho igual; tu palabra al final", () => {
    const r = espejoReel(a, parseEspejo(ia, a), { palabra: "NEGOCIO", cambiarGancho: false })!;
    expect(r.planos).toHaveLength(8);
    expect(r.planos.map(p => p.ref)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(r.planos.map(p => p.forma)).toEqual(["tu", "broll", "broll", "dividida", "tu", "tu", "dividida", "tu"]);
    expect(r.guion.startsWith("Es estúpida la cantidad de personas que tienen Claude")).toBe(true);
    expect(r.guion).toMatch(/Comenta NEGOCIO y te lo mando\.$/);
    expect(r.planos.every(p => p.texto.trim().length > 0)).toBe(true);
    expect(r.planos.map(p => p.texto).join(" ")).toBe(r.guion);
    expect(r.planos[1].visual).toBe("woman at a desk with an iMac by a window");
    expect(r.looks.length).toBeGreaterThan(1);
  });
  it("si la IA no responde bien, se usa el original (no se inventa nada)", () => {
    const r = espejoReel(a, parseEspejo("nada", a), { palabra: "NEGOCIO", cambiarGancho: false })!;
    expect(r.planos).toHaveLength(8);
    expect(r.guion).toMatch(/^Es estúpida/);
  });
});
