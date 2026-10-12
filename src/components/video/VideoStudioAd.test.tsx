import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Misión R2-05 (12-oct-2026): el anuncio crea la toma 1 primero y las tomas 2 y 3 siguen de su último
// cuadro. Si la toma 1 falla, las otras NO se crean (no se cobran) y lo dicen.
const createVideo = vi.fn();
const waitForVideo = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const query: Record<string, unknown> = {};
  for (const k of ["select", "eq", "gte", "order", "in"]) query[k] = () => query;
  query.limit = async () => ({ data: [], error: null });
  return { supabase: { from: () => query, storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) } } };
});
vi.mock("@/hooks/useCreditsLeft", () => ({ useCreditsLeft: () => ({ label: "Te quedan 1.000 créditos", isAdmin: false }) }));
// Objetos estables: un usuario nuevo en cada render recrea loadRecent y la pantalla entra en bucle.
const AUTH = vi.hoisted(() => ({ user: { id: "11111111-2222-3333-4444-555555555555" } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => AUTH }));
vi.mock("@/hooks/useCredits", () => ({
  useCredits: () => CREDITS,
  generatorCost: () => ({ action: "gen_light", cost: 15 }),
}));
const BP = vi.hoisted(() => ({
  profile: { product: "Guía de recetas rápidas", who: "Mamás que trabajan", promise: "Organizar la comida de la semana" },
  loaded: true, savePatch: () => Promise.resolve(true), productId: null,
}));
const CREDITS = vi.hoisted(() => ({ applyServerCharge: () => {}, balance: 1000 }));
vi.mock("@/lib/businessProfile", () => ({ useBusinessProfile: () => BP, profileReady: () => true }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/creativeSeed", () => ({ takeSeed: () => null }));
vi.mock("@/lib/genjutsuOwner", () => ({ isGenjutsuOwner: () => false }));
vi.mock("@/components/video/AdFinalVideo", () => ({ AdFinalVideo: () => null }));
vi.mock("@/components/video/ReadyToPublish", () => ({ ReadyToPublish: () => null }));
vi.mock("@/components/video/MotionStudio", () => ({ MotionStudio: () => null }));
vi.mock("@/components/video/videoApi", async (orig) => ({
  ...(await orig<typeof import("@/components/video/videoApi")>()),
  createVideo: (...a: unknown[]) => createVideo(...a),
  waitForVideo: (...a: unknown[]) => waitForVideo(...a),
  invokeVideo: vi.fn(async () => ({})),
  loadVideoConfig: async () => ({ ready: true, ugc: false }),
  takePresenter: () => null,
}));

import { VideoStudioPage } from "@/pages/VideoStudioPage";

const running = (id: string) => ({ job: { id, status: "running", result_url: null, prompt: "", seconds: 5 }, billing: { charged: 75, balance: 900 } });

describe("Anuncio en video · continuidad de las 3 tomas", () => {
  beforeEach(() => { createVideo.mockReset(); waitForVideo.mockReset(); try { sessionStorage.clear(); } catch { /* nada */ } });

  it("toma 1 primero; la 2 y la 3 parten de su último cuadro, con recibo legible", async () => {
    let n = 0;
    createVideo.mockImplementation(async () => running(`job-${++n}`));
    waitForVideo.mockImplementation(async (id: string) => ({ id, status: "done", result_url: `https://x.test/${id}.mp4`, last_frame_url: `https://x.test/${id}.png`, prompt: "", seconds: 5 }));
    render(<VideoStudioPage initialMode="anuncio" />);
    fireEvent.click(await screen.findByRole("button", { name: /Crear anuncio · 225 créditos/ }));
    await waitFor(() => expect(createVideo).toHaveBeenCalledTimes(3));
    const bodies = createVideo.mock.calls.map(c => c[0] as Record<string, unknown>);
    expect(bodies[0].from_job_id).toBeUndefined();
    expect(bodies[1].from_job_id).toBe("job-1");
    expect(bodies[2].from_job_id).toBe("job-1");
    expect(bodies.map(b => b.label)).toEqual(["Toma 1 de 3 · Gancho", "Toma 2 de 3 · Demostración", "Toma 3 de 3 · Llamada a la acción"]);
    expect(String(bodies[1].prompt)).toMatch(/misma cara, ropa y lugar/);
  });

  it("si falla la toma 1, no se crean (ni cobran) la 2 y la 3, y lo dice", async () => {
    createVideo.mockImplementation(async () => running("job-1"));
    waitForVideo.mockImplementation(async (id: string) => ({ id, status: "failed", result_url: null, prompt: "", seconds: 5 }));
    render(<VideoStudioPage initialMode="anuncio" />);
    fireEvent.click(await screen.findByRole("button", { name: /Crear anuncio · 225 créditos/ }));
    expect(await screen.findAllByText(/falló la toma 1, que fija a la persona y el lugar\. No se te cobró/)).toHaveLength(2);
    expect(createVideo).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Intentar de nuevo · 225 créditos/ })).toBeInTheDocument();
  });
});
