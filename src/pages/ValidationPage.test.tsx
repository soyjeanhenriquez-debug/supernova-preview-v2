import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const savePatch = vi.fn(() => Promise.resolve(true));
let profile: Record<string, unknown>;
vi.mock("@/lib/businessProfile", () => ({
  useBusinessProfile: () => ({ profile, loaded: true, savePatch }),
  profileReady: () => true,
}));

import { ValidationPage } from "./ValidationPage";

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  rpc.mockReset();
  savePatch.mockClear();
  profile = { product: "Recetario para freidora de aire", who: "mamás ocupadas", promise: "", price: "US$9", proof: "", business_type: "infoproducto", validation: null };
});

describe("ValidationPage", () => {
  it("ofrece Sí, No y No sé, y explica cómo saberlo", () => {
    render(<ValidationPage onNavigate={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: /No sé/ }).length).toBe(14);
    expect(screen.getAllByText(/Cómo saberlo:/).length).toBe(14);
    expect(screen.getByText(/Tu frase: «Recetario para freidora de aire para mamás ocupadas»/)).toBeTruthy();
  });

  it("lee respuestas viejas true/false sin romper", () => {
    profile.validation = { answers: { p_problema: true, m_dinero: false }, completed_at: null, score: 50 };
    render(<ValidationPage onNavigate={vi.fn()} />);
    expect(screen.getByText("2 de 14 respondidas")).toBeTruthy();
  });

  it("«Compruébalo por mí» consulta radar_search con 30 días y marca Sí", async () => {
    rpc.mockResolvedValue({ data: { total: 12, capped: false, rows: [{ page_name: "Cocina Fácil", days_active: 120 }] }, error: null });
    render(<ValidationPage onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Compruébalo por mí/ }));
    await waitFor(() => expect(screen.getByText(/Encontramos 12 anuncios con más de 30 días/)).toBeTruthy());
    expect(rpc).toHaveBeenCalledWith("radar_search", expect.objectContaining({ p_keyword: "recetario freidora", p_min_days: 30, p_limit: 10 }));
    expect(screen.getByText(/Cocina Fácil · 120 días/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText("1 de 14 respondidas")).toBeTruthy());
  });

  it("si no encuentra nada, no marca y sugiere otras palabras", async () => {
    rpc.mockResolvedValue({ data: { total: 0, capped: false, rows: [] }, error: null });
    render(<ValidationPage onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Compruébalo por mí/ }));
    await waitFor(() => expect(screen.getByText(/No encontramos anuncios con más de 30 días/)).toBeTruthy());
    expect(screen.getByText("Prueba con:")).toBeTruthy();
    expect(screen.getByText("0 de 14 respondidas")).toBeTruthy();
  });

  it("al terminar con No sé muestra la lista Por comprobar y el siguiente paso", async () => {
    render(<ValidationPage onNavigate={vi.fn()} />);
    const groups = screen.getAllByRole("group").filter(g => g.hasAttribute("aria-labelledby"));
    expect(groups).toHaveLength(14);
    groups.forEach((g, i) => {
      const label = i === 3 ? /No sé/ : /^Sí$/;
      const btn = Array.from(g.querySelectorAll("button")).find(b => label.test(b.textContent?.trim() ?? ""))!;
      fireEvent.click(btn);
    });
    await waitFor(() => expect(screen.getByRole("heading", { name: /Por comprobar/ })).toBeTruthy());
    expect(screen.getByText("Primero comprueba esto")).toBeTruthy();
    expect(screen.getByText(/no una garantía de ventas/)).toBeTruthy();
  });
});
