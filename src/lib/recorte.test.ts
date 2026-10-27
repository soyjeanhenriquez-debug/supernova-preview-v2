import { describe, expect, it } from "vitest";
import { aRecortado, duracion, MARGEN, palabrasRecortadas, repetidas, tramos } from "./recorte";
import { formatoGrabacion, palabraDelCierre } from "./grabacion";

const sub = (desde: number, hasta: number, texto: string) => ({ desde, hasta, texto });

describe("Quitar silencios y frases repetidas (27-oct-2026)", () => {
  it("detecta cuando repites una frase: se queda la última", () => {
    const subs = [
      sub(0, 2, "Jesús dijo esto en Lucas"),
      sub(3, 6, "Jesús dijo esto en Lucas catorce veintiocho"),
      sub(6.2, 9, "calcular antes de construir"),
    ];
    expect(repetidas(subs)).toEqual([0]);
  });
  it("un arranque corto que la siguiente completa también se quita", () => {
    expect(repetidas([sub(0, 1, "Y la mayoría"), sub(2, 5, "Y la mayoría de nosotros llega a fin de mes")])).toEqual([0]);
  });
  it("frases distintas no se tocan", () => {
    expect(repetidas([sub(0, 2, "Calcular antes de construir"), sub(2, 4, "No es falta de fe")])).toEqual([]);
  });
  it("quita la pausa larga del inicio y entre frases; deja las respiraciones cortas", () => {
    const ts = tramos([sub(2, 4, "uno"), sub(4.3, 6, "dos"), sub(9, 11, "tres")], 14);
    expect(ts).toHaveLength(2);
    expect(ts[0].a).toBeCloseTo(2 - MARGEN);
    expect(ts[0].b).toBeCloseTo(6 + MARGEN);
    expect(ts[1].a).toBeCloseTo(9 - MARGEN);
    expect(duracion(ts)).toBeCloseTo((6 - 2 + 2 * MARGEN) + (11 - 9 + 2 * MARGEN));
  });
  it("lo que se quitó no aparece y los subtítulos siguen la voz en el video recortado", () => {
    const subs = [sub(0, 2, "uno dos"), sub(5, 7, "tres cuatro")];
    const ts = tramos(subs, 10, new Set([0]));
    expect(ts).toEqual([{ a: 5 - MARGEN, b: 7 + MARGEN }]);
    expect(aRecortado(1, ts)).toBeNull();
    expect(aRecortado(5, ts)).toBeCloseTo(MARGEN);
    const w = palabrasRecortadas([{ t0: 0.5, t1: 1, w: "uno" }, { t0: 5, t1: 6, w: "tres" }], ts);
    expect(w.map(x => x.w)).toEqual(["tres"]);
  });
});

describe("Grabar con tu guion", () => {
  it("prefiere MP4 y si no, WebM", () => {
    expect(formatoGrabacion(t => t.startsWith("video/mp4"))?.ext).toBe("mp4");
    expect(formatoGrabacion(t => t === "video/webm")?.ext).toBe("webm");
    expect(formatoGrabacion(() => false)).toBeNull();
  });
  it("saca la palabra del cierre del guion", () => {
    expect(palabraDelCierre("… Comenta PRESUPUESTO y te mando el mensaje")).toBe("PRESUPUESTO");
    expect(palabraDelCierre("Comenta la palabra «números» y te lo paso")).toBe("NÚMEROS");
    expect(palabraDelCierre("Gracias por ver")).toBe("");
  });
});
