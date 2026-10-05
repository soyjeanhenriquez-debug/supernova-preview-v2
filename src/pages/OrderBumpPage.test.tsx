import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

type P = { business_type: string | null; copy_level: 1 | 2 | 3; product: string; who: string; promise: string; price: string; proof: string; store_url: string };
let profile: P;
const savePatch = vi.fn(async () => true);
const applyServerCharge = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) }, from: () => ({}) },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u" } }) }));
vi.mock("@/contexts/ProductContext", () => ({ useProducts: () => ({ activeId: "p", active: null, rename: vi.fn() }) }));
vi.mock("@/contexts/JourneyContext", () => ({ notifyJourneyChanged: vi.fn() }));
vi.mock("@/hooks/useCredits", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useCredits")>("@/hooks/useCredits");
  return { ...actual, useCredits: () => ({ applyServerCharge, canAfford: () => true, balance: 500 }) };
});
vi.mock("@/lib/businessProfile", async () => {
  const actual = await vi.importActual<typeof import("@/lib/businessProfile")>("@/lib/businessProfile");
  return { ...actual, useBusinessProfile: () => ({ profile: { ...actual.EMPTY_PROFILE, ...profile }, loaded: true, savePatch, productId: "p" }) };
});

import { OrderBumpPage } from "./OrderBumpPage";
import { generatorCost } from "@/hooks/useCredits";

const fetchMock = vi.fn();
const COST = generatorCost("order-bump").cost;

describe("OrderBumpPage", () => {
  beforeEach(() => {
    profile = { business_type: "infoproducto", copy_level: 2, product: "Curso de repostería", who: "Mamás que venden desde casa", promise: "Vender sus primeros postres", price: "27", proof: "", store_url: "" };
    fetchMock.mockReset();
    // El servidor rechaza: así se ve qué se mandó sin streams ni IA de verdad.
    fetchMock.mockResolvedValue({ ok: false, body: null, clone: () => ({ json: async () => ({ error: "sin IA en pruebas" }) }) });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("muestra el producto, las ideas gratis con precio y el costo, sin llamar a la IA", async () => {
    render(<OrderBumpPage onNavigate={vi.fn()} />);
    expect(screen.getByText("Curso de repostería")).toBeInTheDocument();
    expect(screen.getByText(/Precio: US\$27/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Usar esta idea" }).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("Plantillas listas para usar")).toBeInTheDocument();
    expect(screen.getAllByText("+US$7").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: new RegExp(`Crear mi order bump · ${COST} créditos`) })).toBeInTheDocument();
    await new Promise(r => setTimeout(r, 50));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("elegir una idea no gasta nada", async () => {
    render(<OrderBumpPage onNavigate={vi.fn()} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Usar esta idea" })[0]);
    expect(screen.getByRole("button", { name: /Elegida/ })).toBeInTheDocument();
    await new Promise(r => setTimeout(r, 30));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sin ficha pide solo qué vendes, enseña ideas y no bloquea ni gasta", async () => {
    profile = { ...profile, product: "", who: "", promise: "", price: "" };
    render(<OrderBumpPage onNavigate={vi.fn()} />);
    expect(screen.getByLabelText("¿Qué vendes o qué quieres vender?")).toBeInTheDocument();
    expect(screen.getAllByText(/de tu precio/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Crear mi order bump/ })).toBeDisabled();
    await new Promise(r => setTimeout(r, 30));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("el botón usa el mismo generador order-bump de ai-chat (cobra el servidor) con la idea elegida", async () => {
    render(<OrderBumpPage onNavigate={vi.fn()} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Usar esta idea" })[1]);
    fireEvent.click(screen.getByRole("button", { name: /Crear mi order bump/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/functions/v1/ai-chat");
    const body = JSON.parse(init.body);
    expect(body.generator_id).toBe("order-bump");
    expect(body.messages[0].content).toContain("Diseña ORDER BUMPS");
    expect(body.messages[0].content).toContain("Checklist o guía rápida");
    expect(body.messages[0].content).toContain("Producto: Curso de repostería");
    // El cliente nunca descuenta créditos por su cuenta: solo refleja lo que cobró el servidor.
    expect(applyServerCharge).not.toHaveBeenCalled();
  });
});
