import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Anuncio por escenas (22-oct-2026): producto, presentador, motor, segundos y "cómo se ve" en cada escena.
const invoke = vi.fn();
const waitForVideo = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const query: Record<string, unknown> = {};
  for (const k of ["select", "eq", "gte", "order", "in"]) query[k] = () => query;
  query.limit = async () => ({ data: [], error: null });
  return { supabase: { from: () => query, functions: { invoke: (...a: unknown[]) => invoke(...a) } } };
});
vi.mock("@/hooks/useCreditsLeft", () => ({ useCreditsLeft: () => ({ label: "Te quedan 2.000 créditos", isAdmin: false }) }));
const CREDITS = vi.hoisted(() => ({ applyServerCharge: vi.fn(), balance: 2000 }));
vi.mock("@/hooks/useCredits", () => ({ useCredits: () => CREDITS, generatorCost: () => ({ action: "gen_light", cost: 15 }) }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/components/video/AdFinalVideo", () => ({ AdFinalVideo: () => null }));
vi.mock("@/components/video/ReadyToPublish", () => ({ ReadyToPublish: () => null }));
vi.mock("@/lib/studioUpload", async (orig) => ({
  ...(await orig<typeof import("@/lib/studioUpload")>()),
  uploadStudioImage: async () => ({ bucket: "personajes", path: "u1/anuncio/estudio-producto-1.webp", url: "https://x.test/producto.webp" }),
}));
vi.mock("@/components/video/videoApi", async (orig) => ({
  ...(await orig<typeof import("@/components/video/videoApi")>()),
  waitForVideo: (...a: unknown[]) => waitForVideo(...a),
}));

import { AdStudio } from "@/components/video/AdStudio";
import { buildShots } from "@/lib/videoTemplates";

const brief = { product: "Recetas para congelar", who: "Quienes cocinan cada día", promise: "organizar las comidas de la semana" };
const shots = buildShots("anuncio", "problema_solucion", brief);
const cfg = { open: true, apimart: true, higgsfield: false };
const setup = () => render(
  <AdStudio uid="u1" productId={null} brief={brief} shots={shots} onLine={() => {}} cfg={cfg} size="9:16" onSize={() => {}}
    toolbar={null} busy={false} setBusy={() => {}} />,
);
const bodies = (action: string) => invoke.mock.calls.map(c => (c[1] as { body: Record<string, unknown> }).body).filter(b => b.action === action);

describe("Anuncio en video · por escenas", () => {
  beforeEach(() => {
    invoke.mockReset(); waitForVideo.mockReset(); CREDITS.applyServerCharge.mockReset();
    let n = 0;
    invoke.mockImplementation(async (_fn: string, { body }: { body: Record<string, unknown> }) => {
      if (body.action === "gallery") return { data: { items: [] }, error: null };
      if (body.action === "image") return { data: { path: "u1/foto-inicio.png", url: "https://x.test/inicio.png", billing: { charged: 9, balance: 1991 } }, error: null };
      if (body.action === "video") return { data: { job: { id: `job-${++n}`, status: "running", result_url: null, prompt: "", seconds: 5 }, billing: { charged: 89, balance: 1900 } }, error: null };
      return { data: {}, error: null };
    });
    waitForVideo.mockImplementation(async (id: string) => ({ id, status: "done", result_url: `https://x.test/${id}.mp4`, prompt: "", seconds: 5 }));
  });

  it("sin producto: 3 escenas que hablan, desde el avatar, con Seedance Mini 5 s y recibo legible", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /Crear anuncio · 267 créditos/ }));
    await waitFor(() => expect(bodies("video")).toHaveLength(3));
    expect(bodies("image")).toHaveLength(0);
    const v = bodies("video");
    expect(v.map(b => b.image)).toEqual([{ stock: "valentina" }, { stock: "valentina" }, { stock: "valentina" }]);
    expect(v.map(b => [b.model, b.seconds, b.aspect])).toEqual([["seedance-mini", 5, "9:16"], ["seedance-mini", 5, "9:16"], ["seedance-mini", 5, "9:16"]]);
    expect(v.map(b => b.label)).toEqual(["Escena 1 de 3 · Gancho", "Escena 2 de 3 · Demostración", "Escena 3 de 3 · Llamada a la acción"]);
    expect(v.every(b => (b.parts as { format: string }).format === "camara")).toBe(true);
  });

  it("con producto: UNA foto de inicio con el producto en la mano y todas las escenas parten de ella", async () => {
    const { container } = setup();
    const input = container.querySelectorAll('input[type="file"]')[0] as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "p.png", { type: "image/png" })] } });
    // 267 de las escenas + 9 de la foto de inicio
    fireEvent.click(await screen.findByRole("button", { name: /Crear anuncio · 276 créditos/ }));
    await waitFor(() => expect(bodies("video")).toHaveLength(3));
    const img = bodies("image");
    expect(img).toHaveLength(1);
    expect(img[0]).toMatchObject({ template: "sosteniendo", model: "gpt", refs: { persona: { stock: "valentina" }, producto: { bucket: "personajes", path: "u1/anuncio/estudio-producto-1.webp" } } });
    expect(bodies("video").every(b => JSON.stringify(b.image) === JSON.stringify({ bucket: "estudio-avatar", path: "u1/foto-inicio.png" }))).toBe(true);
    expect(bodies("video").map(b => (b.parts as { format: string }).format)).toEqual(["camara", "sostiene", "senala"]);
  });

  it("texto largo en 5 s: avisa, no deja crear y ofrece pasar a 10 s; «cómo se ve» va al servidor", async () => {
    const { container } = setup();
    await screen.findByRole("button", { name: /Crear anuncio/ });
    const boxes = Array.from(container.querySelectorAll("textarea")); // [0] lo que dice · [1] cómo se ve (escena 1)
    fireEvent.change(boxes[0], { target: { value: "Si trabajas todo el día, lo último que necesitas al llegar a casa es tener que empezar otra jornada cocinando" } });
    expect(await screen.findByText(/En 5 s caben unas 12 palabras y tienes 20/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Usar 10 s/ }));
    fireEvent.change(boxes[1], { target: { value: "cocina luminosa de día, cámara en mano" } });
    // 177 (10 s) + 89 + 89
    fireEvent.click(await screen.findByRole("button", { name: /Crear anuncio · 355 créditos/ }));
    await waitFor(() => expect(bodies("video")).toHaveLength(3));
    expect(bodies("video")[0]).toMatchObject({ seconds: 10, parts: { look: "cocina luminosa de día, cámara en mano" } });
  });

  it("UGC sin producto: sin bloque de producto y con el prompt del clip por partes", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /UGC sin producto/ }));
    expect(screen.queryByRole("button", { name: /Subir foto del producto/ })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Ver prompt" })[0]);
    expect(await screen.findByText("Cámara")).toBeInTheDocument();
    expect(screen.getByText("Guion y micro-acción")).toBeInTheDocument();
    expect(screen.getByText("Acento")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Crear anuncio · 267 créditos/ }));
    await waitFor(() => expect(bodies("video")).toHaveLength(3));
    expect(bodies("video").every(b => (b.parts as { format: string }).format === "camara")).toBe(true);
  });

  it("Crear avatar: el prompt 6C crea la foto (sin referencia) y pasa a ser quien presenta", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /Crear avatar/ }));
    fireEvent.change(screen.getByPlaceholderText(/A candid iPhone photo of/), { target: { value: "A candid iPhone photo of a relatable female creator in her mid 20s talking to the camera. No text, no watermark, no distortion." } });
    fireEvent.click(screen.getByRole("button", { name: /Crear mi avatar · 9 créditos/ }));
    await waitFor(() => expect(bodies("image")).toHaveLength(1));
    expect(bodies("image")[0]).toMatchObject({ template: "avatar-base", model: "gpt" });
    expect(bodies("image")[0].refs).toBeUndefined();
    fireEvent.click(await screen.findByRole("button", { name: /Crear anuncio · 267 créditos/ }));
    await waitFor(() => expect(bodies("video")).toHaveLength(3));
    expect(bodies("video")[0].image).toEqual({ bucket: "estudio-avatar", path: "u1/foto-inicio.png" });
  });
});
