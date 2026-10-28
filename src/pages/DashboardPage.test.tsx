import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

// Inicio de una sola puerta (12-oct-2026): la frase, "Hoy" con 3 ofertas de más de 90 días y un
// solo botón, "Siguiente paso", "Tus creaciones" y todo lo demás plegado.

const offer = (id: string, language: string, days: number, name: string) => ({
  id, page_id: `p-${id}`, market: language === "es" ? "MX" : "US", page_name: `Página ${name}`, ads_count: 5, active_ads: 3,
  days_active: days, duplicate_count: 0, winner_score: 80, tier: null, sample_ad_id: null, sample_title: null, sample_body: "x",
  sample_ad_url: null, first_seen: null, last_seen: null, product_name: name, niche: null, offer_type: "infoproducto",
  business_model: null, language, price_hint: "US$17", mechanism: null, why_wins: null, target_audience: null,
  copy_score: 4, enriched_at: "2026-10-01", winner_index: 90, is_winner: true,
});
const OFFERS = [
  offer("e1", "en", 400, "Keto Challenge"),
  offer("s1", "es", 1060, "Reto Abdomen 28 días"),
  offer("e2", "en", 300, "AI Agents"),
  offer("s2", "es", 120, "Ebook de Recetas"),
  offer("e3", "en", 95, "Calistenia"),
];
const calls: { table: string; ops: [string, unknown[]][] }[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const rec = { table, ops: [] as [string, unknown[]][] };
    calls.push(rec);
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "gte", "neq", "order", "limit", "in", "or"]) {
      q[m] = (...args: unknown[]) => { rec.ops.push([m, args]); return q; };
    }
    q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve({ data: table === "offers" ? OFFERS : [], error: null }).then(res, rej);
    return q;
  };
  return {
    supabase: {
      from: (t: string) => chain(t),
      storage: { from: () => ({ list: async () => ({ data: [] }) }) },
      rpc: async (fn: string) => ({ data: fn === "landing_teasers" ? state.teasers : [] }),
    },
  };
});

const state: { locked: boolean; teasers: unknown } = { locked: false, teasers: null };
const openPlans = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1", email: "hany@example.com", user_metadata: { display_name: "Hany" } } }) }));
vi.mock("@/contexts/ProductContext", () => ({ useProducts: () => ({ activeId: "p1", active: { name: "Mi reto" } }) }));
vi.mock("@/lib/features", () => ({ useFeatureAccess: () => ({ canSee: () => true, isAdmin: false }) }));
vi.mock("@/contexts/VitrinaContext", () => ({ useVitrina: () => ({ locked: state.locked, openPlans }) }));
vi.mock("@/components/LockedToolPage", () => ({
  useVitrinaSample: (on: boolean) => (on ? [{ id: "x" }] : null),
  SampleOffers: () => <div>Muestra con candado</div>,
}));
vi.mock("@/hooks/useCredits", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useCredits")>("@/hooks/useCredits");
  return { ...actual, useCredits: () => ({ balance: 2000, limit: 2000 }) };
});
vi.mock("@/components/HelpAssistant", () => ({ ASK_ASSISTANT_EVENT: "ask" }));
vi.mock("@/components/OnboardingTour", () => ({ OPEN_TOUR_EVENT: "tour" }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn(), trackMiVersionClick: vi.fn() }));
vi.mock("@/components/AdMediaPreview", () => ({ AdMediaPreview: ({ title }: { title?: string }) => <div data-testid="creativo">{title}</div> }));
vi.mock("@/components/MiniAppModal", () => ({ MiniAppModal: ({ ad }: { ad: { title?: string } }) => <div role="dialog">Modelando {ad.title}</div> }));
vi.mock("@/components/dashboard/ResultsCheckIn", () => ({ ResultsCheckIn: () => null }));
vi.mock("@/components/dashboard/RoiHunterWidget", () => ({ RoiHunterWidget: () => <div>Ofertas que sigues</div> }));
vi.mock("@/components/journey/BusinessJourney", () => ({ BusinessJourney: () => <div>Etapas del negocio</div> }));
vi.mock("@/components/dashboard/ToolThumb", () => ({ ToolThumb: () => <span /> }));

import { DashboardPage } from "./DashboardPage";

describe("DashboardPage · Inicio «Hoy»", () => {
  beforeEach(() => { state.locked = false; state.teasers = null; calls.length = 0; localStorage.clear(); });

  it("arriba la frase de Jean y en Hoy 3 ofertas con creativo, días y un solo botón", async () => {
    render(<DashboardPage onNavigate={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent)
      .toBe("Elige un negocio digital que lleva más de 90 días pagando anuncios y haz tu versión en español.");
    const cards = await screen.findAllByTestId("today-offer");
    expect(cards).toHaveLength(3);
    // Las que están en español van primero.
    expect(within(cards[0]).getByRole("heading").textContent).toMatch(/Reto Abdomen|Ebook de Recetas/);
    expect(within(cards[1]).getByRole("heading").textContent).toMatch(/Reto Abdomen|Ebook de Recetas/);
    for (const c of cards) {
      expect(within(c).getByTestId("creativo")).toBeInTheDocument();
      expect(within(c).getByText(/días pagando anuncios/)).toBeInTheDocument();
      expect(within(c).getAllByRole("button", { name: /Hacer mi versión/ })).toHaveLength(1);
    }
    expect(screen.getAllByText(/1\.060 días pagando anuncios/).length).toBe(1);
    // Pide solo ganadoras de 90 días o más, sin contar filas, y nunca toca winning_ads.
    const q = calls.find(c => c.table === "offers")!;
    expect(q.ops).toContainEqual(["gte", ["days_active", 90]]);
    expect(q.ops).toContainEqual(["eq", ["is_winner", true]]);
    expect(calls.some(c => c.table === "winning_ads")).toBe(false);
  });

  it("la primera es «Tu oferta ganadora de hoy»: la misma del correo diario", async () => {
    state.teasers = { deck: [{ name: "Keto Challenge", advertiser: "Página Keto Challenge" }] };
    render(<DashboardPage onNavigate={vi.fn()} />);
    const cards = await screen.findAllByTestId("today-offer");
    expect(cards).toHaveLength(3);
    expect(within(cards[0]).getByText("Tu oferta ganadora de hoy")).toBeInTheDocument();
    expect(within(cards[0]).getByRole("heading").textContent).toBe("Keto Challenge");
    expect(screen.getAllByText("Tu oferta ganadora de hoy")).toHaveLength(1);
    expect(screen.getByText(/la misma que te llegó por correo/)).toBeInTheDocument();
    // La busca por nombre y anunciante en offers (nunca en winning_ads).
    const q = calls.find(c => c.table === "offers" && c.ops.some(([m, a]) => m === "eq" && a[0] === "product_name"))!;
    expect(q.ops).toContainEqual(["eq", ["page_name", "Página Keto Challenge"]]);
  });

  it("si no hay oferta del correo, siguen las 3 de siempre sin la etiqueta", async () => {
    render(<DashboardPage onNavigate={vi.fn()} />);
    expect(await screen.findAllByTestId("today-offer")).toHaveLength(3);
    expect(screen.queryByText("Tu oferta ganadora de hoy")).toBeNull();
  });

  it("«Hacer mi versión» abre el flujo que ya existe", async () => {
    render(<DashboardPage onNavigate={vi.fn()} />);
    const cards = await screen.findAllByTestId("today-offer");
    fireEvent.click(within(cards[0]).getByRole("button", { name: /Hacer mi versión/ }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Modelando");
  });

  it("Siguiente paso: Creativos, Carrusel, Video y Textos que venden", async () => {
    const nav = vi.fn();
    render(<DashboardPage onNavigate={nav} />);
    const section = screen.getByRole("heading", { name: "Siguiente paso" }).closest("section")!;
    const titles = within(section).getAllByRole("button").map(b => b.textContent ?? "");
    expect(titles.map(t => ["Creativos y fotos", "Carrusel que vende", "Video con IA", "Textos que venden"].find(n => t.includes(n))))
      .toEqual(["Creativos y fotos", "Carrusel que vende", "Video con IA", "Textos que venden"]);
    fireEvent.click(within(section).getByText("Textos que venden"));
    expect(nav).toHaveBeenCalledWith("Generadores");
    await screen.findAllByTestId("today-offer");
  });

  it("lo demás está plegado y no se perdió", { timeout: 20_000 }, async () => {
    render(<DashboardPage onNavigate={vi.fn()} />);
    await screen.findAllByTestId("today-offer");
    expect(screen.getByRole("heading", { name: "Tus creaciones" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByText("Ofertas que sigues")).toBeNull();
    const more = screen.getByText("Más herramientas y tu camino").closest("button")!;
    expect(more).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(more);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getByText("Ofertas que sigues")).toBeInTheDocument();
    // El camino de 6 etapas sigue plegado dentro (opcional).
    expect(screen.queryByText("Etapas del negocio")).toBeNull();
    fireEvent.click(screen.getByText("(opcional)").closest("button")!);
    expect(screen.getByText("Etapas del negocio")).toBeInTheDocument();
    // El buscador de dentro entiende frases de principiante.
    fireEvent.change(screen.getByLabelText("Buscar herramienta"), { target: { value: "quiero vender un curso" } });
    expect(screen.getByText(/herramientas para "quiero vender un curso"/)).toBeInTheDocument();
  });

  it("sin plan: muestra la muestra con candado y no pide ofertas", () => {
    state.locked = true;
    render(<DashboardPage onNavigate={vi.fn()} />);
    expect(screen.getByText("Muestra con candado")).toBeInTheDocument();
    expect(screen.queryAllByTestId("today-offer")).toHaveLength(0);
    expect(calls.some(c => c.table === "offers")).toBe(false);
  });
});
