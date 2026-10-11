import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RecompensasPage } from "./RecompensasPage";
import { REWARDS, REWARD_HOOKS } from "@/lib/rewards";

describe("RecompensasPage", () => {
  it("muestra los pagos de la campaña en formato español y el cálculo real", () => {
    render(<RecompensasPage onNavigate={vi.fn()} />);
    expect(screen.getAllByText("US$0,20").length).toBe(REWARDS.platforms.length * 2);
    expect(screen.getAllByText("US$20,00").length).toBe(REWARDS.platforms.length);
    expect(screen.getByText(/20\.000 vistas suma US\$4,00; desde 100\.000 vistas se queda en US\$20,00/)).toBeTruthy();
    expect(screen.getByText(/no hay un pago asegurado/)).toBeTruthy();
  });

  it("sin enlace de Whop dice que abre pronto, y el bono lleva a Contenido", () => {
    const onNavigate = vi.fn();
    render(<RecompensasPage onNavigate={onNavigate} />);
    expect(screen.getAllByText("La campaña abre pronto").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("Ir a Contenido →"));
    expect(onNavigate).toHaveBeenCalledWith("Contenido");
  });

  it("ningún gancho promete ingresos", () => {
    for (const h of REWARD_HOOKS) expect(h).not.toMatch(/gana|ganar|\$|dólares|factura|ingreso/i);
  });
});
