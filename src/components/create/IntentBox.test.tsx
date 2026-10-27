import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SEED_KEY } from "@/lib/creativeSeed";
import { CLIP_PROMPT_KEY, REEL_URL_KEY, TO_CAROUSEL_KEY } from "@/lib/intentRouter";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/components/create/IdeaOfTheDay", () => ({ IdeaOfTheDay: () => <div>Idea de hoy (oferta real)</div> }));
vi.mock("@/lib/businessProfile", () => ({
  useBusinessProfile: () => ({ profile: { product: "Ebook de recetas", who: "Mamás que trabajan", promise: "Cocinar una vez por semana", price: "" } }),
}));
let admin = false;
vi.mock("@/lib/features", () => ({ useFeatureAccess: () => ({ canSee: (p: string) => admin || p !== "Estudio de avatar", isAdmin: admin, loading: false }) }));
vi.mock("@/lib/tools", async (orig) => ({ ...(await orig<typeof import("@/lib/tools")>()), useVia: () => ({ via: "creador" }) }));

import { IntentBox } from "./IntentBox";

describe("¿Qué quieres crear hoy? · 4 entradas por lo que tienes (Guardián del Creador)", () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear(); window.location.hash = ""; vi.spyOn(window, "scrollTo").mockImplementation(() => undefined); admin = false; });

  it("muestra 4 entradas", () => {
    render(<IntentBox onNavigate={vi.fn()} />);
    for (const t of ["Tengo una referencia", "Tengo mi material", "Solo tengo una idea", "No sé qué crear"]) expect(screen.getByText(t)).toBeTruthy();
  });

  it("referencia: un reel llega a Analiza un Reel con el enlace puesto", () => {
    const done = vi.fn();
    render(<IntentBox onNavigate={vi.fn()} onDone={done} />);
    fireEvent.click(screen.getByText("Tengo una referencia"));
    const btn = screen.getByRole("button", { name: /hacer mi versión/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Enlace de la referencia"), { target: { value: "https://www.instagram.com/reel/ABC123xyz/" } });
    expect(screen.getByText(/Es un reel/)).toBeTruthy();
    fireEvent.click(btn);
    expect(window.location.hash).toBe("#/con-tu-cara/reel");
    expect(sessionStorage.getItem(REEL_URL_KEY)).toBe("https://www.instagram.com/reel/ABC123xyz/");
    expect(done).toHaveBeenCalled();
  });

  it("referencia: un carrusel llega a Modelar con el enlace puesto", () => {
    render(<IntentBox onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByText("Tengo una referencia"));
    fireEvent.change(screen.getByLabelText("Enlace de la referencia"), { target: { value: "https://www.instagram.com/p/DXy12abcd/" } });
    fireEvent.click(screen.getByRole("button", { name: /Modelar este carrusel/ }));
    expect(window.location.hash).toBe("#/carrusel");
    expect(JSON.parse(localStorage.getItem(TO_CAROUSEL_KEY)!).url).toBe("https://www.instagram.com/p/DXy12abcd/");
  });

  it("material: cada opción lleva a su herramienta; lo de admin no se le muestra a un cliente", () => {
    render(<IntentBox onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByText("Tengo mi material"));
    expect(screen.queryByText("Mi foto hablando")).toBeNull();
    expect(screen.getByText("Mis fotos + una frase → reel")).toBeTruthy(); // Reel Studio abierto a clientes (26-oct)
    fireEvent.click(screen.getByText("Grabé mi video"));
    expect(window.location.hash).toBe("#/con-tu-cara/video");
  });

  it("material: el prompt llega escrito a Video con IA, sin generar", () => {
    render(<IntentBox onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByText("Tengo mi material"));
    fireEvent.click(screen.getByText("Ya sé cómo se ve mi video"));
    fireEvent.change(screen.getByLabelText("Cómo se ve tu video"), { target: { value: "Una mujer abre su laptop y sonríe" } });
    fireEvent.click(screen.getByRole("button", { name: /Llevarlo a Video con IA/ }));
    expect(window.location.hash).toBe("#/video-ia");
    expect(sessionStorage.getItem(CLIP_PROMPT_KEY)).toBe("Una mujer abre su laptop y sonríe");
  });

  it("material: un admin ve Mi foto hablando", () => {
    admin = true;
    render(<IntentBox onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByText("Tengo mi material"));
    expect(screen.getByText("Mi foto hablando")).toBeTruthy();
  });

  it("idea: entiende la pieza, muestra el costo y abre SIN generar", () => {
    render(<IntentBox onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByText("Solo tengo una idea"));
    fireEvent.change(screen.getByLabelText("Tu idea"), { target: { value: "un carrusel sobre 5 errores al congelar" } });
    expect(screen.getByText(/Quieres un carrusel/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Crear en Carrusel que vende/ }));
    expect(window.location.hash).toBe("#/carrusel");
    expect(JSON.parse(sessionStorage.getItem(SEED_KEY)!).autostart).toBeUndefined();
  });

  it("no sé qué crear: la idea de hoy y el camino a Ofertas", () => {
    const nav = vi.fn();
    render(<IntentBox onNavigate={nav} />);
    fireEvent.click(screen.getByText("No sé qué crear"));
    expect(screen.getByText("Idea de hoy (oferta real)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Ver más ofertas/ }));
    expect(nav).toHaveBeenCalledWith("Ofertas");
  });
});
