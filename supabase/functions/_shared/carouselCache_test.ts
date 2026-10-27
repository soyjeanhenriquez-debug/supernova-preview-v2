// Correr: deno test -A supabase/functions/_shared/carouselCache_test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { fromRow, igExpiry, liveImages } from "./carouselCache.ts";

const AHORA = Date.UTC(2026, 9, 26, 12);
const oe = (ms: number) => Math.floor(ms / 1000).toString(16);
const img = (ms: number, i = 1) => `https://scontent.cdninstagram.com/v/t51/${i}.jpg?stp=x&oe=${oe(ms)}&_nc_sid=1`;

const fila = (analysis: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id: "c1", owner: "alguien", likes: 900, comments: 40, hook: "El gancho", summary: "Resumen del carrusel",
  why: "Funciona porque abre un bucle", analysis, ...extra,
});
const buena = {
  laminas: [{ n: 1, idea: "Portada con la promesa" }, { n: 2, idea: "Primer paso concreto" }, { n: 3, idea: "Llamado a comentar" }],
  estilo: { colores: ["#000000"] }, adn: [{ id: "a1" }], mantener: ["a1"], caption: "Comenta GUIA",
};

Deno.test("igExpiry lee el vencimiento del CDN", () => {
  assertEquals(igExpiry(img(AHORA)), Math.floor(AHORA / 1000) * 1000);
  assertEquals(igExpiry("https://scontent.cdninstagram.com/x.jpg"), null);
  assertEquals(igExpiry("no es url"), null);
});

Deno.test("liveImages: todas vivas o ninguna (la app las usa por posición)", () => {
  const dia = 86_400_000;
  assertEquals(liveImages([img(AHORA + dia, 1), img(AHORA + dia, 2)], AHORA).length, 2);
  assertEquals(liveImages([img(AHORA + dia, 1), img(AHORA - dia, 2)], AHORA), []);
  assertEquals(liveImages([img(AHORA + 3_600_000, 1), img(AHORA + dia, 2)], AHORA), []); // caduca en menos de 2 h
  assertEquals(liveImages(["https://scontent.cdninstagram.com/sin-fecha.jpg", img(AHORA + dia)], AHORA), []);
  assertEquals(liveImages(undefined, AHORA), []);
});

Deno.test("fromRow reusa una radiografía completa", () => {
  const r = fromRow(fila({ ...buena, images: [img(AHORA, 1)] }));
  assertEquals(r?.id, "c1");
  assertEquals(r?.analisis.laminas.length, 3);
  assertEquals(r?.analisis.gancho_original, "El gancho");
  assertEquals(r?.caption, "Comenta GUIA");
  assertEquals(r?.images.length, 1);
});

Deno.test("fromRow descarta lo que no sirve", () => {
  assertEquals(fromRow(fila({ ...buena, reel: true })), null); // salió de un Reel
  assertEquals(fromRow(fila({ ...buena, cache_de: "c0" })), null); // copia de otra radiografía
  assertEquals(fromRow(fila({ ...buena, laminas: [{ n: 1, idea: "Solo una" }] })), null);
  assertEquals(fromRow(fila({ ...buena, adn: [] })), null);
  assertEquals(fromRow(fila(buena, { summary: null })), null);
  assertEquals(fromRow(null), null);
});
