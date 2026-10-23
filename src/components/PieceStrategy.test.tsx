import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PieceStrategy } from "./PieceStrategy";

describe("PieceStrategy (nivel + ángulo)", () => {
  it("abre la escalera, muestra los 5 peldaños y elige un nivel", () => {
    const onLevel = vi.fn();
    render(<PieceStrategy level="auto" onLevel={onLevel} angle="auto" onAngle={() => {}} />);
    expect(screen.getByText(/La IA decide/)).toBeTruthy();
    fireEvent.click(screen.getByText(/A quién le hablas/));
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    fireEvent.click(screen.getByRole("radio", { name: /Consciente de la solución/ }));
    expect(screen.getByText("Explica tu mecanismo")).toBeTruthy();
    fireEvent.click(screen.getByText("Hablarle al nivel 3"));
    expect(onLevel).toHaveBeenCalledWith("solucion");
  });

  it("con un nivel elegido, el selector de ángulos marca los que funcionan en él", () => {
    render(<PieceStrategy level="solucion" onLevel={() => {}} angle="auto" onAngle={() => {}} />);
    fireEvent.click(screen.getByText(/Ángulo de venta/));
    expect(screen.getAllByText("nivel 3").length).toBeGreaterThanOrEqual(4);
  });
});
