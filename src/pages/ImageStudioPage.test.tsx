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
const runGenerator = vi.fn();
vi.mock("@/lib/generatorStream", () => ({ runGenerator: (...a: unknown[]) => runGenerator(...a) }));
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
    fireEvent.click(screen.getByRole("tab", { name: /Conoce tu producto/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Ejemplo de Testimonio/ }));
    fireEvent.click(screen.getByText(/Crear 3 imágenes/));
    await new Promise(r => setTimeout(r, 30));
    expect(invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Ejemplo de Testimonio/ }));
    fireEvent.click(screen.getByRole("tab", { name: /No sabe que tiene el problema/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Ejemplo de Iceberg/ }));
    fireEvent.click(screen.getByText(/Crear 3 imágenes/));
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect((invoke.mock.calls[0][1].body as { prompt: string }).prompt).toContain("Concepto: Iceberg");
  }, 15_000); // renderiza 32 tarjetas con imagen: con toda la batería en paralelo pasa de 5 s

  it("carrusel: la semilla con autostart escribe el texto una sola vez y no crea imágenes", async () => {
    runGenerator.mockReset();
    runGenerator.mockResolvedValue("no es json");
    setSeed({ source: "radar", target: "carrusel", title: "Curso de uñas", product: "Curso de uñas acrílicas", who: "Mujeres que quieren emprender", promise: "Hacer uñas desde casa", hook: "Deja de pagar por tus uñas", evidence: "214 días pagando anuncios", autostart: true });
    render(<ImageStudioPage initialMode="creativo" />);
    expect(screen.getByText("Curso de uñas")).toBeInTheDocument();
    await waitFor(() => expect(runGenerator).toHaveBeenCalledTimes(1), { timeout: 3000 });
    const req = runGenerator.mock.calls[0][0] as { id: string; prompt: string };
    expect(req.id).toBe("carrusel-copy");
    expect(req.prompt).toContain("Curso de uñas acrílicas");
    expect(req.prompt).toMatch(/NO copies sus palabras/);
    await new Promise(r => setTimeout(r, 50));
    expect(runGenerator).toHaveBeenCalledTimes(1);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("carrusel sin semilla muestra el costo del texto y no gasta nada solo", async () => {
    runGenerator.mockReset();
    profile = { product: "Ebook de recetas", who: "Mamás que trabajan", promise: "Cocinar rápido", price: "" };
    render(<ImageStudioPage initialMode="carrusel" />);
    expect(screen.getByText(/Escribir mi carrusel · 15 créditos/)).toBeInTheDocument();
    expect(screen.getByText("Así se verá tu carrusel")).toBeInTheDocument();
    await new Promise(r => setTimeout(r, 50));
    expect(runGenerator).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("semilla sin autostart no genera", async () => {
    setSeed({ source: "oferta", target: "creativos", title: "Planner digital", product: "Planner digital", who: "Estudiantes", promise: "Organizarse" });
    render(<ImageStudioPage initialMode="creativo" />);
    expect(screen.getByText("Planner digital")).toBeInTheDocument();
    await new Promise(r => setTimeout(r, 50));
    expect(invoke).not.toHaveBeenCalled();
  });
});
