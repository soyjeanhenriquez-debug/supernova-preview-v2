import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const UID = "11111111-2222-3333-4444-555555555555";
const PID = "aaaaaaaa-2222-3333-4444-555555555555";
const invoke = vi.fn();
const upload = vi.fn(async () => ({ error: null }));
const savePatch = vi.fn(async () => true);
let journey: Record<string, unknown> = {};
let ugc = true;

vi.mock("@/integrations/supabase/client", () => {
  const storage = {
    from: () => ({
      upload: (...a: unknown[]) => upload(...(a as [])),
      remove: async () => ({ error: null }),
      createSignedUrl: async () => ({ data: { signedUrl: "https://x.test/foto.webp" } }),
    }),
  };
  const query: Record<string, unknown> = {};
  for (const k of ["select", "eq", "gte", "order", "in"]) query[k] = () => query;
  query.limit = async () => ({ data: [], error: null });
  return { supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) }, storage, from: () => query } };
});
const USER = vi.hoisted(() => ({ id: "11111111-2222-3333-4444-555555555555", email: "a@b.c" }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: USER }) }));
vi.mock("@/hooks/useIsAdmin", () => ({ useIsAdmin: () => ({ isAdmin: false }) }));
vi.mock("@/lib/media", () => ({ loadMediaModels: async () => [], hasComunidad: async () => false, accessOf: () => "ok" }));
vi.mock("@/hooks/useCredits", () => ({
  CREDIT_COSTS: { gen_ad_image: 6 },
  useCredits: () => ({ applyServerCharge: vi.fn(), canAfford: () => true, balance: 500 }),
  generatorCost: () => ({ action: "gen_light", cost: 15 }),
}));
vi.mock("@/lib/businessProfile", () => ({
  useBusinessProfile: () => ({
    profile: { product: "Ebook de recetas", who: "Mamás que trabajan", promise: "Cocinar rápido", price: "", journey },
    loaded: true, savePatch: (...a: unknown[]) => savePatch(...(a as [])), productId: PID,
  }),
  profileReady: () => true,
}));
vi.mock("@/components/video/videoApi", async (orig) => ({
  ...(await orig<typeof import("@/components/video/videoApi")>()),
  loadVideoConfig: async () => ({ ready: true, ugc }),
  waitForVideo: async (id: string) => ({ id, status: "done", result_url: "https://x.test/v.mp4", prompt: "", seconds: 10 }),
}));

import { PersonajePage } from "./PersonajePage";

const VALE = {
  nombre: "Valentina", rol: "La amiga", historia: "h", aspecto: "Mujer afrolatina", voz: "v", gancho: "g",
  bio: "b · Personaje creado con IA", genero: "mujer", vozId: "alegre", stock: "valentina",
};

describe("PersonajePage (Influencer IA)", () => {
  beforeEach(() => {
    invoke.mockReset(); upload.mockClear(); savePatch.mockClear(); journey = {}; ugc = true;
    globalThis.fetch = vi.fn(async () => new Response(new Blob(["x"], { type: "image/webp" }))) as typeof fetch;
  });

  it("muestra los 4 avatares de SUPERNOVA y el país con su nombre completo", () => {
    render(<PersonajePage onNavigate={vi.fn()} />);
    for (const n of ["Valentina", "Doña Carmen", "Andrés", "Don Julio"]) expect(screen.getByRole("button", { name: `Elegir a ${n}` })).toBeInTheDocument();
    expect(screen.getByLabelText(/¿Dónde vive tu cliente\?/)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "República Dominicana" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "RD" })).toBeNull();
  });

  it("elegir un avatar es gratis: copia su foto a la carpeta del usuario y no llama a la IA", async () => {
    render(<PersonajePage onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Elegir a Valentina" }));
    await waitFor(() => expect(savePatch).toHaveBeenCalled());
    expect((upload.mock.calls[0] as unknown[])[0]).toMatch(new RegExp(`^${UID}/${PID}/supernova-valentina-`));
    const pj = (savePatch.mock.calls[0] as unknown as [{ journey: { personaje: { elegido: typeof VALE } } }])[0].journey.personaje.elegido;
    expect(pj).toMatchObject({ nombre: "Valentina", genero: "mujer", stock: "valentina" });
    expect(invoke.mock.calls.filter(c => c[0] !== "video-studio")).toHaveLength(0);
  });

  it("el video que habla lleva lo que dice, la voz elegida y la foto del influencer", async () => {
    journey = { personaje: { elegido: VALE, foto: `${UID}/${PID}/supernova-valentina-1.webp` } };
    invoke.mockImplementation(async (fn: string, { body }: { body: Record<string, unknown> }) =>
      body.action === "status" ? { data: { job: { id: "j1", status: "done" } } }
        : { data: { job: { id: "j1", status: "running", result_url: null, prompt: "", seconds: 10 }, billing: { charged: 110, balance: 390 } }, error: null });
    render(<PersonajePage onNavigate={vi.fn()} initialStep={3} />);
    await screen.findByText("2 · Su voz");
    fireEvent.click(screen.getByRole("radio", { name: /Serena y segura/ }));
    fireEvent.change(screen.getByPlaceholderText(/Ej\.:/), { target: { value: "¿Te cuesta cocinar entre semana? Mira esto." } });
    fireEvent.click(screen.getByRole("button", { name: /Crear video que habla · 110/ }));
    await waitFor(() => expect(invoke.mock.calls.some(c => c[1].body.kind === "ugc")).toBe(true));
    const body = invoke.mock.calls.find(c => c[1].body.kind === "ugc")![1].body;
    expect(body).toMatchObject({ seconds: 10, audio: true, image_bucket: "personajes", image_path: `${UID}/${PID}/supernova-valentina-1.webp` });
    expect(body.prompt).toContain("¿Te cuesta cocinar entre semana? Mira esto.");
    expect(body.prompt).toMatch(/Voz: voz femenina/);
    expect(body.prompt.indexOf("Voz:")).toBeLessThan(1500); // el servidor recorta a 1.500
  });

  it("un testimonio no se envía", async () => {
    journey = { personaje: { elegido: VALE, foto: `${UID}/${PID}/f.webp` } };
    render(<PersonajePage onNavigate={vi.fn()} initialStep={3} />);
    await screen.findByText("2 · Su voz");
    fireEvent.change(screen.getByPlaceholderText(/Ej\.:/), { target: { value: "Lo compré y me funcionó en una semana" } });
    fireEvent.click(screen.getByRole("button", { name: /Crear video que habla/ }));
    await new Promise(r => setTimeout(r, 30));
    expect(invoke.mock.calls.some(c => c[1]?.body?.kind === "ugc")).toBe(false);
  });

  it("si el servidor no lo tiene abierto, avisa que viene pronto (sin video mudo)", async () => {
    ugc = false;
    journey = { personaje: { elegido: VALE, foto: `${UID}/${PID}/f.webp` } };
    render(<PersonajePage onNavigate={vi.fn()} initialStep={3} />);
    expect(await screen.findByText("PRONTO")).toBeInTheDocument();
    expect(screen.queryByText(/Generar video/)).toBeNull();
  });
});
