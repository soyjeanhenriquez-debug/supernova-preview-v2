import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/hooks/useCredits", () => ({
  useCredits: () => ({ balance: 1500, monthly: 1500, purchased: 0, limit: 2000, renewalDate: new Date(2026, 10, 5) }),
  CREDIT_COSTS: { gen_ad_image: 7, vid_mini_5: 75, gen_light: 15, gen_medium: 30 }, // precios del 12-oct-2026
}));
vi.mock("@/components/PublishBonus", () => ({
  useBonusStatus: () => ({ perClaim: 50, monthCap: 1000, monthTotal: 150, claimedToday: false, claimedItems: [] }),
}));

import { CreditRing, creditEquivalents, creditEquivalentsLine } from "./CreditRing";

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
    // Qué rinde el saldo con los precios nuevos: imagen 7, anuncio en video 3 × 75 = 225.
    expect(screen.getByText(/214 imágenes · 6 anuncios en video · 100 textos cortos/)).toBeTruthy();
  });

  it("creditEquivalents usa los precios nuevos (2.000 créditos = 285 imágenes u 8 anuncios en video)", () => {
    expect(creditEquivalents(2000)).toEqual({ images: 285, videoAds: 8, shortTexts: 133, mediumTexts: 66 });
    expect(creditEquivalentsLine(0)).toBe("");
  });

  it("al admin le muestra créditos ilimitados", () => {
    render(<CreditRing isAdmin />);
    fireEvent.click(screen.getByRole("button", { name: /ilimitados/i }));
    expect(screen.getAllByText(/Ilimitado/).length).toBeGreaterThan(0);
  });
});
