import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const access = { isAdmin: true };
vi.mock("@/lib/features", () => ({ useFeatureAccess: () => access }));
vi.mock("@/hooks/useCredits", () => ({ useCredits: () => ({ applyServerCharge: vi.fn() }), CREDIT_COSTS: { gen_light: 15, gen_medium: 30 } }));
vi.mock("@/lib/businessProfile", () => ({
  useBusinessProfile: () => ({ profile: { product: "Guía de lettering", who: "mamás", promise: "letras bonitas" }, loaded: true }),
  profileReady: () => true, profileText: () => "Producto: Guía de lettering",
}));
vi.mock("@/lib/fnAuth", () => ({ fnHeaders: async () => ({}), fnErrorMessage: async () => "error", readBilling: () => ({ charged: 0, balance: null, receipt: null }) }));

import { StrategistAssistant } from "./StrategistAssistant";

describe("StrategistAssistant", () => {
  beforeEach(() => { localStorage.clear(); access.isAdmin = true; });

  it("no aparece para quien no es admin (en prueba)", () => {
    access.isAdmin = false;
    const { container } = render(<StrategistAssistant />);
    expect(container.innerHTML).toBe("");
  });

  it("abre con el producto activo y el botón de estrategia con su precio", () => {
    render(<StrategistAssistant />);
    fireEvent.click(screen.getByLabelText("Abrir el Estratega de anuncios"));
    expect(screen.getByText("Producto: Guía de lettering")).toBeTruthy();
    expect(screen.getByText(/Armar estrategia · 15 créditos/)).toBeTruthy();
    expect(screen.getByText(/Escribir guiones · 30 créditos/)).toBeTruthy();
    expect(screen.queryByText(/Guion de producción ·/)).toBeNull(); // sale después de los guiones
  });
});
