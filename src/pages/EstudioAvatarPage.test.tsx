import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const invoke = vi.fn();
const charge = vi.fn();
let journey: Record<string, unknown> = {};

vi.mock("@/integrations/supabase/client", () => {
  const storage = {
    from: () => ({
      upload: async () => ({ error: null }),
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
vi.mock("@/hooks/useCredits", () => ({ useCredits: () => ({ applyServerCharge: charge, balance: 5000 }) }));
vi.mock("@/lib/businessProfile", () => ({
  useBusinessProfile: () => ({ profile: { product: "Ebook", journey }, productId: "aaaaaaaa-2222-3333-4444-555555555555" }),
}));

import { EstudioAvatarPage } from "./EstudioAvatarPage";

const ok = (data: unknown) => Promise.resolve({ data, error: null });

describe("EstudioAvatarPage", () => {
  beforeEach(() => {
    invoke.mockReset(); charge.mockReset(); journey = { personaje: { foto: `${USER.id}/p/foto.webp` } };
    invoke.mockImplementation((_fn: string, { body }: { body: Record<string, unknown> }) => {
      if (body.action === "config") return ok({ open: true, apimart: true, higgsfield: true });
      if (body.action === "gallery") return ok({ items: [] });
      if (body.action === "image") return ok({ path: `${USER.id}/1-hoja.png`, url: "https://x.test/hoja.png", billing: { charged: 22, balance: 4978 } });
      return ok({});
    });
  });

  it("parte del influencer elegido y crea la hoja 3×3 cobrando en el servidor", async () => {
    render(<EstudioAvatarPage />);
    expect(screen.getByText("Fotos y videos de tu avatar")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByAltText("Foto base")).toHaveAttribute("src", "https://x.test/foto.webp"));
    const btn = screen.getByRole("button", { name: /Crear imagen · 22 créditos/ });
    fireEvent.click(btn);
    await waitFor(() => expect(charge).toHaveBeenCalledWith("gen_media", { charged: 22, balance: 4978 }, "Estudio · Hoja de personaje 3×3"));
    const call = invoke.mock.calls.find(c => c[1].body.action === "image")!;
    expect(call[1].body).toMatchObject({ template: "hoja-personaje", refs: { persona: { bucket: "personajes", path: `${USER.id}/p/foto.webp` } } });
    expect(call[1].body).not.toHaveProperty("prompt"); // el prompt lo arma el servidor
  });

  it("en imagen se puede elegir otro modelo y se ven sus créditos", async () => {
    render(<EstudioAvatarPage />);
    await waitFor(() => expect(screen.getByAltText("Foto base")).toHaveAttribute("src", "https://x.test/foto.webp"));
    // Hoja 3×3: por defecto Nano Banana Pro (recomendado); las otras opciones muestran su precio.
    expect(screen.getByRole("radio", { name: /Nano Banana Pro.*Recomendado.*22 créditos/ })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: /GPT Image 2.*9 créditos/ }));
    fireEvent.click(screen.getByRole("button", { name: /Crear imagen · 9 créditos/ }));
    await waitFor(() => expect(invoke.mock.calls.some(c => c[1].body.action === "image")).toBe(true));
    expect(invoke.mock.calls.find(c => c[1].body.action === "image")![1].body).toMatchObject({ template: "hoja-personaje", model: "gpt" });
    // Al cambiar de plantilla vuelve el predeterminado: las fotos realistas van con GPT Image 2.
    fireEvent.click(screen.getByRole("button", { name: "Ropa y fondo" }));
    expect(screen.getByRole("radio", { name: /GPT Image 2.*Recomendado/ })).toHaveAttribute("aria-checked", "true");
  });

  it("en video solo ofrece modelos que hablan para el formato a cámara y avisa el límite de palabras", async () => {
    render(<EstudioAvatarPage />);
    fireEvent.click(screen.getByRole("tab", { name: /Video/ }));
    await waitFor(() => expect(screen.getByRole("radio", { name: /Seedance 2.0 Mini/ })).toBeInTheDocument());
    expect(screen.queryByRole("radio", { name: /Kling 2.5/ })).toBeNull();
    expect(screen.queryByRole("radio", { name: /Grok/ })).toBeNull();
    expect(screen.getByText(/0\/24 palabras/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sin hablar (para tu voz en off)" }));
    expect(screen.getByRole("radio", { name: /Kling 2.5/ })).toBeInTheDocument();
  });

  it("recomienda Omni para hablar y Grok sin hablar, con créditos a la vista y sin nombrar proveedores", async () => {
    render(<EstudioAvatarPage />);
    fireEvent.click(screen.getByRole("tab", { name: /Video/ }));
    await waitFor(() => expect(screen.getByRole("radio", { name: /Omni.*Recomendado.*300 créditos/ })).toHaveAttribute("aria-checked", "true"));
    expect(screen.getByText("Buena elección para este video.")).toBeInTheDocument();
    // Omni no hace 5 s: la opción corta dice 6 s y su precio.
    fireEvent.click(screen.getByRole("button", { name: "6 s" }));
    expect(screen.getByRole("radio", { name: /Omni.*225 créditos/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Crear video · 225 créditos/ })).toBeInTheDocument();
    // Elige otro modelo con sus créditos; el consejo ofrece volver a Omni.
    fireEvent.click(screen.getByRole("radio", { name: /Seedance 2.0 Mini/ }));
    expect(screen.getByText(/Para esto te conviene Omni/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Crear video · 89 créditos/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Usar Omni" }));
    expect(screen.getByRole("radio", { name: /Omni/ })).toHaveAttribute("aria-checked", "true");
    // Sin hablar: pasa solo a Grok.
    fireEvent.click(screen.getByRole("button", { name: "Sin hablar (para tu voz en off)" }));
    expect(screen.getByRole("radio", { name: /Grok.*Recomendado.*87 créditos/ })).toHaveAttribute("aria-checked", "true");
    expect(document.body.textContent).not.toMatch(/apimart|higgsfield|fal\.ai|gemini|google|xai/i);
  });

  it("si el estudio está cerrado lo dice y no deja crear", async () => {
    invoke.mockImplementation((_fn: string, { body }: { body: Record<string, unknown> }) =>
      body.action === "config" ? ok({ open: false, apimart: true, higgsfield: false }) : ok({ items: [] }));
    render(<EstudioAvatarPage />);
    await waitFor(() => expect(screen.getByText(/se está abriendo poco a poco/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Crear imagen/ })).toBeDisabled();
  });
});
