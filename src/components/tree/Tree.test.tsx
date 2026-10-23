import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

// El árbol (21-oct-2026, solo admin): Inicio con Tu norte, pantalla de rama, puertas de Video y la
// barra de migas y pestañas encima de cada pantalla.

const journey = { loaded: true, done: [true, false, false, false, false, false], doneCount: 1, next: 2, refresh: () => {} };
vi.mock("@/contexts/JourneyContext", () => ({ useJourney: () => journey }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1", email: "jean@example.com", user_metadata: { display_name: "Jean" } } }) }));
vi.mock("@/contexts/ProductContext", () => ({ useProducts: () => ({ activeId: "p1", active: { name: "Mi reto" } }) }));
vi.mock("@/lib/features", () => ({ useFeatureAccess: () => ({ canSee: () => true, isAdmin: true }) }));
vi.mock("@/hooks/useCredits", () => ({ useCredits: () => ({ balance: 2000, limit: 2000 }) }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

import { TreeHome } from "./TreeHome";
import { TreePage } from "./TreePage";
import { TreeTabsBar } from "./TreeTabsBar";

beforeEach(() => { window.location.hash = ""; localStorage.clear(); sessionStorage.clear(); });

describe("Inicio en árbol", () => {
  it("muestra las 4 ramas con su estado y Tu norte con UNA acción", () => {
    const nav = vi.fn();
    render(<TreeHome onNavigate={nav} />);
    for (const name of ["Encuentra qué vender", "Arma tu negocio", "Crea tu contenido", "Consigue clientes"]) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
    expect(screen.getByText("Hecho")).toBeTruthy(); // rama 1 lista (ficha llena)
    expect(screen.getByText("Vas aquí")).toBeTruthy();
    // Tu norte (escritorio y teléfono): la etapa que falta es el precio.
    expect(screen.getAllByText("Ponle precio a tu oferta").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByText("Hacer mis números")[0]);
    expect(nav).toHaveBeenCalledWith("Precio");
  });

  it("una hoja de una sola pantalla la abre directo; Video abre sus puertas", () => {
    const nav = vi.fn();
    render(<TreeHome onNavigate={nav} />);
    fireEvent.click(screen.getByText("Ofertas que venden"));
    expect(nav).toHaveBeenCalledWith("Ofertas");
    fireEvent.click(screen.getByText("Video"));
    expect(window.location.hash).toBe("#/paso/crear/video");
  });
});

describe("Pantalla de rama y de puertas", () => {
  it("la rama lista sus hojas con lo que tiene adentro", () => {
    window.location.hash = "#/paso/armar";
    render(<TreePage onNavigate={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Arma tu negocio" })).toBeTruthy();
    expect(screen.getByText(/Adentro: Mis versiones · Mi ficha · Tu ADN/)).toBeTruthy();
    expect(screen.getByText(/Siguiente: Paso 3/)).toBeTruthy();
  });

  it("Video: 3 puertas y recuerda la última", () => {
    window.location.hash = "#/paso/crear/video";
    const { unmount } = render(<TreePage onNavigate={vi.fn()} />);
    expect(screen.getAllByRole("tab").map(t => t.textContent)).toEqual(["Sin tu cara", "Con tu cara", "YouTube"]);
    fireEvent.click(screen.getByRole("tab", { name: "Con tu cara" }));
    expect(screen.getByText("Analiza un Reel")).toBeTruthy();
    unmount();
    render(<TreePage onNavigate={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "Con tu cara" }).getAttribute("aria-selected")).toBe("true");
  });
});

describe("Migas y pestañas encima de cada pantalla", () => {
  it("en Mini Apps: Hoy › Paso 1 › Ofertas que venden, con la pestaña marcada", () => {
    const nav = vi.fn();
    render(<TreeTabsBar page="Mini Apps" onNavigate={nav} />);
    expect(screen.getByText("Paso 1 · Encuentra qué vender")).toBeTruthy();
    const tabs = within(screen.getByRole("tablist"));
    expect(tabs.getByRole("tab", { name: "Mini Apps" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(tabs.getByRole("tab", { name: "Ofertas" }));
    expect(nav).toHaveBeenCalledWith("Ofertas");
  });

  it("un generador de Textos deja dicho cuál abrir", () => {
    const nav = vi.fn();
    render(<TreeTabsBar page="Generadores" onNavigate={nav} />);
    fireEvent.click(screen.getByRole("tab", { name: "Correos" }));
    expect(JSON.parse(localStorage.getItem("supernova_generator_prefill")!)).toEqual({ generator: "email-sequence" });
    expect(nav).toHaveBeenCalledWith("Generadores");
  });

  it("pantallas fuera del árbol (Créditos) no muestran barra", () => {
    const { container } = render(<TreeTabsBar page="Créditos" onNavigate={vi.fn()} />);
    expect(container.textContent).toBe("");
  });
});
