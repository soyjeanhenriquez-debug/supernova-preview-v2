import { describe, expect, it } from "vitest";
import { pickCheckIn, type CheckInItem } from "./checkIn";

const NOW = new Date("2026-10-20T12:00:00Z").getTime();
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const item = (o: Partial<CheckInItem>): CheckInItem => ({ id: "i1", title: "Cambia el *ángulo*", topic: null, kind: "carrusel", keyword: "ATAJO", channels: { instagram: { done: true } }, leads: 0, sales: 0, created_at: ago(5), ...o });

describe("pregunta de resultados: de vez en cuando y personalizada", () => {
  it("pregunta por resultados de lo publicado, con su palabra clave", () => {
    const q = pickCheckIn({ items: [item({})], clones: [], asked: new Set(), lastAskedAt: null, now: NOW })!;
    expect(q.type).toBe("resultado");
    expect(q.question).toBe("Tu carrusel «Cambia el ángulo» ya está publicado. ¿Cuántas personas te escribieron o comentaron ATAJO?");
  });

  it("como mucho una vez cada 7 días", () => {
    expect(pickCheckIn({ items: [item({})], clones: [], asked: new Set(), lastAskedAt: ago(3), now: NOW })).toBeNull();
    expect(pickCheckIn({ items: [item({})], clones: [], asked: new Set(), lastAskedAt: ago(8), now: NOW })).not.toBeNull();
  });

  it("nunca pregunta dos veces por lo mismo ni por lo que ya tiene datos o es muy nuevo", () => {
    expect(pickCheckIn({ items: [item({})], clones: [], asked: new Set(["i1"]), lastAskedAt: null, now: NOW })).toBeNull();
    expect(pickCheckIn({ items: [item({ leads: 4 })], clones: [], asked: new Set(), lastAskedAt: null, now: NOW })).toBeNull();
    expect(pickCheckIn({ items: [item({ created_at: ago(1) })], clones: [], asked: new Set(), lastAskedAt: null, now: NOW })).toBeNull();
  });

  it("después, por el clon; y por último, qué lo frenó", () => {
    const clon = pickCheckIn({ items: [], clones: [{ id: "c1", hook: "Cambia el ángulo de tus fotos", summary: null, created_at: ago(3) }], asked: new Set(), lastAskedAt: null, now: NOW })!;
    expect(clon).toMatchObject({ type: "clon", refId: "c1", question: "Hace 3 días modelaste «Cambia el ángulo de tus fotos». ¿Lo publicaste?" });
    const stuck = pickCheckIn({ items: [item({ channels: { instagram: { done: false } } })], clones: [], asked: new Set(), lastAskedAt: null, now: NOW })!;
    expect(stuck).toMatchObject({ type: "frenado", question: "«Cambia el ángulo» sigue sin publicar. ¿Qué te frenó?" });
  });
});
