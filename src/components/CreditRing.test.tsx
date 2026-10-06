import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/hooks/useCredits", () => ({
  useCredits: () => ({ balance: 1500, monthly: 1500, purchased: 0, limit: 2000, renewalDate: new Date(2026, 10, 5) }),
}));
vi.mock("@/components/PublishBonus", () => ({
  useBonusStatus: () => ({ perClaim: 50, monthCap: 1000, monthTotal: 150, claimedToday: false, claimedItems: [] }),
}));

import { CreditRing } from "./CreditRing";

describe("CreditRing", () => {
  it("muestra el círculo sin números y abre el detalle al tocarlo", () => {
    render(<CreditRing isAdmin={false} />);
    const btn = screen.getByRole("button", { name: /te quedan 1\.500/i });
    expect(btn.textContent).toBe(""); // solo el círculo, sin cifras a la vista
    fireEvent.click(btn);
    expect(screen.getByText("Créditos del mes")).toBeTruthy();
    expect(screen.getByText(/1\.500 de 2\.000/)).toBeTruthy();
    expect(screen.getByText(/Usaste 25 %/)).toBeTruthy();
    expect(screen.getByText(/150 de 1\.000/)).toBeTruthy();
  });

  it("al admin le muestra créditos ilimitados", () => {
    render(<CreditRing isAdmin />);
    fireEvent.click(screen.getByRole("button", { name: /ilimitados/i }));
    expect(screen.getAllByText(/Ilimitado/).length).toBeGreaterThan(0);
  });
});
