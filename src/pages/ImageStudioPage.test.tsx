import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const UID = "11111111-2222-3333-4444-555555555555";
const PID = "aaaaaaaa-2222-3333-4444-555555555555";
const invoke = vi.fn();
let profile = { product: "", who: "", promise: "", price: "" };

vi.mock("@/integrations/supabase/client", () => {
  const storage = {
    from: () => ({
      list: async () => ({ data: [] }),
      createSignedUrls: async () => ({ data: [] }),
      upload: async () => ({ error: null }),
    }),
  };
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: null, error: null }), upsert: async () => ({ error: null }) };
  return { supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) }, storage, from: () => query } };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: UID } }) }));
vi.mock("@/hooks/useCredits", () => ({
  CREDIT_COSTS: { gen_ad_image: 6 },
  useCredits: () => ({ applyServerCharge: vi.fn(), balance: 500 }),
  generatorCost: () => ({ action: "gen_light", cost: 15 }),
}));
vi.mock("@/lib/businessProfile", () => ({
  useBusinessProfile: () => ({ profile, loaded: true, savePatch: vi.fn(), productId: PID }),
  profileReady: (p: { product: string; who: string; promise: string }) => p.product.length >= 3 && p.who.length >= 3 && p.promise.length >= 3,
}));

import { ImageStudioPage } from "./ImageStudioPage";
import { setSeed } from "@/lib/creativeSeed";

describe("ImageStudioPage", () => {
  beforeEach(() => { sessionStorage.clear(); invoke.mockReset(); invoke.mockResolvedValue({ data: { error: "x" }, error: null }); profile = { product: "", who: "", promise: "", price: "" }; });

  it("sin semilla y sin ficha muestra una sola pregunta", () => {
    render(<ImageStudioPage initialMode="creativo" />);
    expect(screen.getByLabelText("¿Qué vendes o qué quieres vender?")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("con ficha muestra el costo y no gasta nada solo", async () => {
    profile = { product: "Ebook de recetas", who: "Mamás que trabajan", promise: "Cocinar rápido", price: "" };
    render(<ImageStudioPage initialMode="foto_ugc" />);
    expect(screen.getByText(/Crear 3 fotos · 18 créditos/)).toBeInTheDocument();
    expect(screen.getByText(/Formato:/)).toBeInTheDocument();
    await new Promise(r => setTimeout(r, 50));
    expect(invoke).not.toHaveBeenCalled();
  });

  it("creativos: elegir un estilo cambia lo que se crea y el testimonio exige el dato real", async () => {
    profile = { product: "Ebook de recetas", who: "Mamás que trabajan", promise: "Cocinar rápido", price: "" };
    invoke.mockResolvedValue({ data: { error: "x" }, error: null });
    render(<ImageStudioPage initialMode="creativo" />);
    fireEvent.click(screen.getByRole("button", { name: /elegir estilo/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Para quien está por comprar" }));
    fireEvent.click(screen.getByRole("button", { name: /^Testimonio/ }));
    fireEvent.click(screen.getByText(/Crear 3 imágenes/));
    await new Promise(r => setTimeout(r, 30));
    expect(invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Testimonio/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Para quien no te conoce" }));
    fireEvent.click(screen.getByRole("button", { name: /^Iceberg/ }));
    fireEvent.click(screen.getByText(/Crear 3 imágenes/));
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect((invoke.mock.calls[0][1].body as { prompt: string }).prompt).toContain("Concepto: Iceberg");
  });

  it("semilla con autostart genera sin toques extra y no copia el gancho literal", async () => {
    setSeed({ source: "radar", target: "carrusel", title: "Curso de uñas", product: "Curso de uñas acrílicas", who: "Mujeres que quieren emprender", promise: "Hacer uñas desde casa", hook: "Deja de pagar por tus uñas", evidence: "214 días pagando anuncios", autostart: true });
    render(<ImageStudioPage initialMode="creativo" />);
    expect(screen.getByText("Curso de uñas")).toBeInTheDocument();
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(5), { timeout: 3000 });
    const body = invoke.mock.calls[0][1].body as { prompt: string; aspectRatio: string };
    expect(body.aspectRatio).toBe("4:5");
    expect(body.prompt).toContain("Curso de uñas acrílicas");
  });

  it("semilla sin autostart no genera", async () => {
    setSeed({ source: "oferta", target: "creativos", title: "Planner digital", product: "Planner digital", who: "Estudiantes", promise: "Organizarse" });
    render(<ImageStudioPage initialMode="creativo" />);
    expect(screen.getByText("Planner digital")).toBeInTheDocument();
    await new Promise(r => setTimeout(r, 50));
    expect(invoke).not.toHaveBeenCalled();
  });
});
