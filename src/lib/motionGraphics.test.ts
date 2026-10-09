import { describe, expect, it } from "vitest";

const bytesOf = (b: Blob) => new Promise<Uint8Array>((res) => { const r = new FileReader(); r.onload = () => res(new Uint8Array(r.result as ArrayBuffer)); r.readAsArrayBuffer(b); });
import {
  MOTION_PRESETS, buildTimeline, makeZip, promptsText, sanitizeStyle, styleForServer, timelineTotal, toSrt, voiceChunks, voiceTrackWav,
  type Beat,
} from "./motionGraphics";

const beat = (text: string, narration: string, seconds = 3): Beat => ({ layout: "statement", text, emphasis: [], items: [], narration, seconds });

describe("voiceChunks", () => {
  it("agrupa narraciones seguidas sin pasar de 600 caracteres", () => {
    const beats = [beat("a", "x".repeat(300)), beat("b", "y".repeat(290)), beat("c", "z".repeat(100))];
    const c = voiceChunks(beats);
    expect(c.map(x => x.beats)).toEqual([[0, 1], [2]]);
    expect(c.every(x => x.text.length <= 600)).toBe(true);
  });
  it("usa el texto en pantalla si no hay narración y salta las vacías", () => {
    const c = voiceChunks([beat("Hola", ""), beat("", "")]);
    expect(c).toEqual([{ beats: [0], text: "Hola" }]);
  });
});

describe("buildTimeline", () => {
  it("sin voz usa los segundos del plan (mínimo 1,4) y agrega el respiro final", () => {
    const tl = buildTimeline([beat("a", "", 2), beat("b", "", 1)], undefined, undefined, 0.5);
    expect(tl).toEqual([{ start: 0, dur: 2 }, { start: 2, dur: 1.9 }]);
  });
  it("con voz reparte lo que dura cada tramo según lo largo de cada narración", () => {
    const beats = [beat("a", "x".repeat(30)), beat("b", "y".repeat(10))];
    const chunks = voiceChunks(beats);
    const tl = buildTimeline(beats, chunks, [8], 0);
    expect(tl[0].dur).toBeCloseTo(6);
    expect(tl[1].dur).toBeCloseTo(2);
    expect(timelineTotal(tl)).toBeCloseTo(8);
  });
});

describe("sanitizeStyle", () => {
  it("descarta colores, fuentes y animaciones que no están en la lista", () => {
    const s = sanitizeStyle({ name: "X", palette: { bg: "red", fg: "#ffffff" }, font: "Comic Sans", text_anim: "spin", energy: 9 });
    expect(s.palette.bg).toBe(MOTION_PRESETS[0].palette.bg);
    expect(s.palette.fg).toBe("#ffffff");
    expect(s.font).toBe(MOTION_PRESETS[0].font);
    expect(s.text_anim).toBe(MOTION_PRESETS[0].text_anim);
    expect(s.energy).toBe(MOTION_PRESETS[0].energy);
  });
  it("conserva el prompt maestro, pero no se manda al servidor", () => {
    const s = sanitizeStyle({ name: "Ref", master_prompt: "Bold kinetic typography…", breakdown: ["0-2 s: titular"], motif: "círculo" });
    expect(s.master_prompt).toContain("kinetic");
    const sent = styleForServer(s) as Record<string, unknown>;
    expect(sent.master_prompt).toBeUndefined();
    expect(sent.breakdown).toBeUndefined();
    expect(sent.motif).toBe("círculo");
  });
});

describe("partes para editar", () => {
  it("subtítulos .srt con los tiempos de cada escena", () => {
    const srt = toSrt([beat("A", "Hola"), beat("B", "")], [{ start: 0, dur: 1.5 }, { start: 1.5, dur: 62 }]);
    expect(srt).toBe("1\n00:00:00,000 --> 00:00:01,500\nHola\n\n2\n00:00:01,500 --> 00:01:03,500\nB\n");
  });
  it("la voz va en una sola pista WAV del largo del video", () => {
    const buf = { sampleRate: 1000, getChannelData: () => new Float32Array(500).fill(0.5) } as unknown as AudioBuffer;
    const wav = voiceTrackWav([{ buffer: buf, at: 1 }], 3);
    expect(wav.type).toBe("audio/wav");
    expect(wav.size).toBe(44 + 3000 * 2);
  });
  it("prompts.txt incluye el prompt del estilo y cada clip", () => {
    const st = sanitizeStyle({ name: "Ref", master_prompt: "STYLE PROMPT" });
    const txt = promptsText(st, { title: "T", beats: [beat("a", "")], clips: [{ beats: [0], headline: "Espera", subline: "", prompt: "CLIP PROMPT" }], caption: "Hola #tag" });
    expect(txt).toContain("STYLE PROMPT");
    expect(txt).toContain('CLIP 1 de 1 · "Espera"');
    expect(txt).toContain("CLIP PROMPT");
  });
  it("arma un .zip válido (firmas y directorio central)", async () => {
    const zip = await makeZip([{ name: "a.txt", data: "hola" }, { name: "b.bin", data: new Blob([new Uint8Array([1, 2, 3])]) }]);
    const b = await bytesOf(zip);
    const dv = new DataView(b.buffer);
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    const end = b.length - 22;
    expect(dv.getUint32(end, true)).toBe(0x06054b50);
    expect(dv.getUint16(end + 10, true)).toBe(2);
    expect(dv.getUint32(14, true)).toBe(0x6fa0f988); // CRC-32 estándar de "hola" (zlib)
  });
});
