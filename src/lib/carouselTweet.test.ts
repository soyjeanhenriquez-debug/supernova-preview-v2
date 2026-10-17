import { describe, expect, it } from "vitest";
import { sanitizeDesign, tweetText, type Slide } from "./carousel";

const base = { tone: "oscuro" as const, kicker: "", body: "", items: [] };

describe("estilo Tuit", () => {
  it("la portada es solo su titular, sin asteriscos", () => {
    expect(tweetText({ ...base, kind: "portada", title: "5 razones por las que tu *oferta* no vende:" }, 0))
      .toEqual({ head: "5 razones por las que tu oferta no vende:", rest: [] });
  });

  it("las láminas de la lista llevan su número y lo que explican", () => {
    const s: Slide = { ...base, kind: "pasos", title: "No muestras pruebas", items: [{ title: "Capturas", text: "de mensajes reales" }], verdict: "Sin prueba, todo suena a promesa." };
    expect(tweetText(s, 2)).toEqual({ head: "2) No muestras pruebas", rest: ["• Capturas: de mensajes reales", "Sin prueba, todo suena a promesa."] });
  });

  it("el remate pide comentar la palabra y no lleva número", () => {
    const s: Slide = { ...base, kind: "llamada", title: "Arregla la oferta", cta: "OFERTA", body: "Te mando la plantilla" };
    expect(tweetText(s, 5)).toEqual({ head: "Arregla la oferta", rest: ['Comenta "OFERTA" y te mando la plantilla'] });
  });

  it("el diseño guardado acepta el estilo Tuit", () => {
    expect(sanitizeDesign({ style: "tuit" }).style).toBe("tuit");
  });
});
