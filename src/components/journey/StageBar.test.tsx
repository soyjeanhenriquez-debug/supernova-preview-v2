import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const journey = { loaded: true, done: [true, true, false, false, false, false], doneCount: 2, next: 3, refresh: () => {} };
vi.mock("@/contexts/JourneyContext", () => ({ useJourney: () => journey }));
vi.mock("@/contexts/ProductContext", () => ({ useProducts: () => ({ active: { name: "Recetario Air Fryer" } }) }));

import { StageBar, NextStepCard } from "./StageBar";

describe("StageBar", () => {
  beforeEach(() => { journey.done = [true, true, false, false, false, false]; journey.next = 3; journey.doneCount = 2; });

  it("en una etapa lista ofrece la siguiente y navega a su herramienta", () => {
    const nav = vi.fn();
    render(<StageBar page="Validar" onNavigate={nav} />);
    expect(screen.getAllByText("Esta etapa está lista").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByText(/3 · Precio/)[0].closest("button")!);
    expect(nav).toHaveBeenCalledWith("Precio");
  });

  it("en la etapa actual no empuja a otra", () => {
    render(<StageBar page="Precio" onNavigate={vi.fn()} />);
    expect(screen.getAllByText(/Estás en tu etapa actual/).length).toBeGreaterThan(0);
    expect(screen.getByText("Etapa 3 de 6 · Precio")).toBeTruthy();
  });

  it("si se adelantó, recuerda la que falta sin bloquear", () => {
    render(<StageBar page="Mándala" onNavigate={vi.fn()} />);
    expect(screen.getAllByText("Aún te falta").length).toBeGreaterThan(0);
    expect(screen.getByText("Aún te falta: 3 · Precio")).toBeTruthy();
    expect(screen.getByText("Etapa 5 de 6 · Vender")).toBeTruthy();
  });

  it("en el teléfono la línea abre las 6 etapas", () => {
    const nav = vi.fn();
    render(<StageBar page="Precio" onNavigate={nav} />);
    fireEvent.click(screen.getByText("Etapa 3 de 6 · Precio"));
    expect(screen.getByText("Construye tu producto")).toBeTruthy();
    fireEvent.click(screen.getByText("Construye tu producto"));
    expect(nav).toHaveBeenCalledWith("Plan");
  });

  it("NextStepCard solo aparece cuando la etapa de la pantalla está lista", () => {
    const { rerender, container } = render(<NextStepCard page="Precio" onNavigate={vi.fn()} />);
    expect(container.textContent).toBe("");
    rerender(<NextStepCard page="Validar" onNavigate={vi.fn()} />);
    expect(screen.getByText("Siguiente: ponle precio")).toBeTruthy();
    rerender(<NextStepCard page="Créditos" onNavigate={vi.fn()} />);
    expect(screen.queryByText("Siguiente: ponle precio")).toBeNull();
  });
});
