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
/** Pasa del paso actual al 4 tocando "Siguiente". */
async function toStep4(from = 1) {
  const labels = [/Siguiente: imágenes/, /Siguiente: los clips/, /Siguiente: video final/];
  for (const l of labels.slice(from - 1)) fireEvent.click(await screen.findByRole("button", { name: l }));
}
const bodies = (action: string) => invoke.mock.calls.map(c => (c[1] as { body: Record<string, unknown> }).body).filter(b => b.action === action);

describe("Video UGC paso a paso", () => {
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

  it("empieza en el paso 1 (UGC sin producto) y llega al video: 3 clips que hablan, desde el avatar, recibo legible", async () => {
    setup();
    expect(screen.getByText("Paso 1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Subir foto del producto/ })).toBeNull();
    await toStep4();
    fireEvent.click(await screen.findByRole("button", { name: /Crear video · 267 créditos/ }));
    await waitFor(() => expect(bodies("video")).toHaveLength(3));
    expect(bodies("image")).toHaveLength(0);
    const v = bodies("video");
    expect(v.map(b => b.image)).toEqual([{ stock: "valentina" }, { stock: "valentina" }, { stock: "valentina" }]);
    expect(v.map(b => [b.model, b.seconds, b.aspect])).toEqual([["seedance-mini", 5, "9:16"], ["seedance-mini", 5, "9:16"], ["seedance-mini", 5, "9:16"]]);
    expect(v.map(b => b.label)).toEqual(["Escena 1 de 3 · Gancho", "Escena 2 de 3 · Demostración", "Escena 3 de 3 · Llamada a la acción"]);
    expect(v.every(b => (b.parts as { format: string }).format === "camara")).toBe(true);
  });

  it("con producto: UNA foto base con el producto en la mano y todos los clips parten de ella", async () => {
    const { container } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Sí, lo muestra/ }));
    const input = container.querySelectorAll('input[type="file"]')[0] as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "p.png", { type: "image/png" })] } });
    await screen.findByAltText("Tu producto");
    await toStep4();
    // 267 de los clips + 9 de la foto base
    fireEvent.click(await screen.findByRole("button", { name: /Crear video · 276 créditos/ }));
    await waitFor(() => expect(bodies("video")).toHaveLength(3));
    const img = bodies("image");
    expect(img).toHaveLength(1);
    expect(img[0]).toMatchObject({ template: "sosteniendo", model: "gpt", refs: { persona: { stock: "valentina" }, producto: { bucket: "personajes", path: "u1/anuncio/estudio-producto-1.webp" } } });
    expect(bodies("video").every(b => JSON.stringify(b.image) === JSON.stringify({ bucket: "estudio-avatar", path: "u1/foto-inicio.png" }))).toBe(true);
    expect(bodies("video").map(b => (b.parts as { format: string }).format)).toEqual(["camara", "sostiene", "senala"]);
  });

  it("texto largo en 5 s: avisa, no deja seguir y ofrece pasar a 10 s; «cómo se ve» va al servidor", async () => {
    const { container } = setup();
    await toStep4(1); // intenta llegar al 4
    fireEvent.click(screen.getByRole("button", { name: /Atrás/ })); // vuelve al 3
    const boxes = Array.from(container.querySelectorAll("textarea")); // [0] lo que dice · [1] cómo se ve (clip 1)
    fireEvent.change(boxes[0], { target: { value: "Si trabajas todo el día, lo último que necesitas al llegar a casa es tener que empezar otra jornada cocinando" } });
    expect(await screen.findByText(/En 5 s caben unas 12 palabras y tienes 20/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Siguiente: video final/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Usar 10 s/ }));
    fireEvent.change(boxes[1], { target: { value: "cocina luminosa de día, cámara en mano" } });
    fireEvent.click(screen.getByRole("button", { name: /Siguiente: video final/ }));
    // 177 (10 s) + 89 + 89
    fireEvent.click(await screen.findByRole("button", { name: /Crear video · 355 créditos/ }));
    await waitFor(() => expect(bodies("video")).toHaveLength(3));
    expect(bodies("video")[0]).toMatchObject({ seconds: 10, parts: { look: "cocina luminosa de día, cámara en mano" } });
  });

  it("los ajustes de cada clip están cerrados; dentro, el prompt por partes", async () => {
    setup();
    await toStep4(1);
    fireEvent.click(screen.getByRole("button", { name: /Atrás/ }));
    expect(screen.queryByRole("button", { name: "Ver prompt" })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /Ajustes/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Ver prompt" }));
    expect(await screen.findByText("Cámara")).toBeInTheDocument();
    expect(screen.getByText("Guion y micro-acción")).toBeInTheDocument();
    expect(screen.getByText("Acento")).toBeInTheDocument();
  });

  it("Crear avatar (paso 1): el prompt 6C crea la foto (sin referencia) y pasa a ser quien habla", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /Crear avatar/ }));
    fireEvent.change(screen.getByPlaceholderText(/A candid iPhone photo of/), { target: { value: "A candid iPhone photo of a relatable female creator in her mid 20s talking to the camera. No text, no watermark, no distortion." } });
    fireEvent.click(screen.getByRole("button", { name: /Crear mi avatar · 9 créditos/ }));
    await waitFor(() => expect(bodies("image")).toHaveLength(1));
    expect(bodies("image")[0]).toMatchObject({ template: "avatar-base", model: "gpt" });
    expect(bodies("image")[0].refs).toBeUndefined();
    await toStep4();
    fireEvent.click(await screen.findByRole("button", { name: /Crear video · 267 créditos/ }));
    await waitFor(() => expect(bodies("video")).toHaveLength(3));
    expect(bodies("video")[0].image).toEqual({ bucket: "estudio-avatar", path: "u1/foto-inicio.png" });
  });

  it("paso 2: otra foto del mismo avatar y un clip que empieza con ella", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /Siguiente: imágenes/ }));
    fireEvent.change(screen.getByPlaceholderText(/en el baño/), { target: { value: "en su cocina con sudadera gris" } });
    fireEvent.click(screen.getByRole("button", { name: /Crear foto · 9 cr/ }));
    await waitFor(() => expect(bodies("image")).toHaveLength(1));
    expect(bodies("image")[0]).toMatchObject({ template: "misma-persona", refs: { persona: { stock: "valentina" } } });
    fireEvent.click(await screen.findByRole("button", { name: /Siguiente: los clips/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "Empezar con esta foto" })[1]); // clip 2
    fireEvent.click(screen.getByRole("button", { name: /Siguiente: video final/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Crear video · 267 créditos/ }));
    await waitFor(() => expect(bodies("video")).toHaveLength(3));
    expect(bodies("video").map(b => b.image)).toEqual([{ stock: "valentina" }, { bucket: "estudio-avatar", path: "u1/foto-inicio.png" }, { stock: "valentina" }]);
  });
});
