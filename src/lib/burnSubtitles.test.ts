import { describe, expect, it } from "vitest";
import { subtitleAt, toSrt, type Subtitle } from "@/lib/burnSubtitles";

const subs: Subtitle[] = [
  { desde: 0, hasta: 1.4, texto: "Hola, esto es" },
  { desde: 1.4, hasta: 3.25, texto: "lo que nadie te dice", clave: "nadie" },
  { desde: 61.5, hasta: 62.9, texto: "Comenta GUÍA" },
];

describe("subtítulos de Sube tu video", () => {
  it("arma el .srt con tiempos hh:mm:ss,mmm", () => {
    const srt = toSrt(subs);
    expect(srt).toContain("1\n00:00:00,000 --> 00:00:01,400\nHola, esto es\n");
    expect(srt).toContain("2\n00:00:01,400 --> 00:00:03,250\nlo que nadie te dice\n");
    expect(srt).toContain("3\n00:01:01,500 --> 00:01:02,900\nComenta GUÍA\n");
  });
  it("sabe qué subtítulo toca en cada segundo", () => {
    expect(subtitleAt(subs, 0.5)?.texto).toBe("Hola, esto es");
    expect(subtitleAt(subs, 1.4)?.texto).toBe("lo que nadie te dice");
    expect(subtitleAt(subs, 10)).toBeNull();
  });
});
