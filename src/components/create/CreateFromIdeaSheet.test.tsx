import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const state = { balance: 2000, locked: false };
const openPlans = vi.fn();
vi.mock("@/hooks/useCredits", async (orig) => {
  const real = await orig<typeof import("@/hooks/useCredits")>();
  return { ...real, useCredits: () => ({ balance: state.balance }) };
});
vi.mock("@/contexts/VitrinaContext", () => ({ useVitrina: () => ({ locked: state.locked, openPlans }) }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { CreateFromIdeaSheet } from "@/components/create/CreateFromIdeaSheet";
import { SEED_KEY } from "@/lib/creativeSeed";

const idea = { source: "radar" as const, title: "Curso de uñas", product: "Curso de uñas", who: "Mamás", promise: "Hacer uñas", hook: "Aprende desde casa.", evidence: "120 días pagando anuncios" };

beforeEach(() => { sessionStorage.clear(); window.location.hash = ""; state.balance = 2000; state.locked = false; openPlans.mockClear(); });

describe("CreateFromIdeaSheet", () => {
  it("muestra la recomendación con su costo y la evidencia real", () => {
    render(<CreateFromIdeaSheet idea={idea} input={{ source: "radar", media: "video" }} onClose={() => {}} />);
    expect(screen.getByText("La IA eligió por ti")).toBeInTheDocument();
    expect(screen.getByText("120 días pagando anuncios")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Crear · 165 créditos/ })).toBeInTheDocument();
    expect(screen.getByText(/Nunca copia este texto/)).toBeInTheDocument();
    expect(screen.getByText("Te quedan 2.000 créditos")).toBeInTheDocument();
  });

  it("al tocar Crear deja la semilla con autostart y va al estudio", () => {
    const onClose = vi.fn();
    render(<CreateFromIdeaSheet idea={idea} input={{ source: "radar", media: "image" }} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /Crear · 18 créditos/ }));
    const seed = JSON.parse(sessionStorage.getItem(SEED_KEY)!);
    expect(seed).toMatchObject({ target: "creativos", aspect: "4:5", autostart: true, source: "radar", evidence: "120 días pagando anuncios" });
    expect(window.location.hash).toBe("#/creativos");
    expect(onClose).toHaveBeenCalled();
  });

  it("'Solo abrir, sin crear' no pone autostart", () => {
    render(<CreateFromIdeaSheet idea={idea} input={{ source: "oferta" }} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Solo abrir, sin crear/ }));
    expect(JSON.parse(sessionStorage.getItem(SEED_KEY)!).autostart).toBeUndefined();
  });

  it("sin créditos suficientes no pone semilla", () => {
    state.balance = 50;
    render(<CreateFromIdeaSheet idea={idea} input={{ source: "radar", media: "video" }} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Crear · 165 créditos/ }));
    expect(sessionStorage.getItem(SEED_KEY)).toBeNull();
  });

  it("en vitrina abre los planes en vez de crear", () => {
    state.locked = true;
    render(<CreateFromIdeaSheet idea={idea} input={{ source: "oferta" }} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Activa tu plan para crear/ }));
    expect(openPlans).toHaveBeenCalled();
    expect(sessionStorage.getItem(SEED_KEY)).toBeNull();
  });
});
