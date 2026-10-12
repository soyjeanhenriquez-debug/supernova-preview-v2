import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const credits = { balance: 0 };
const admin = { isAdmin: false };
vi.mock("@/hooks/useCredits", () => ({
  useCredits: () => ({ balance: credits.balance, monthly: credits.balance, purchased: 0, limit: 2000, renewalDate: new Date(2026, 10, 5) }),
  CREDIT_COSTS: { gen_ad_image: 7, vid_mini_5: 75, gen_light: 15, gen_medium: 30 },
}));
vi.mock("@/components/PublishBonus", () => ({ useBonusStatus: () => null }));
vi.mock("@/hooks/useCreditsLeft", () => ({ useCreditsLeft: () => ({ isAdmin: admin.isAdmin, label: "" }) }));
const startCheckout = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/stripe", () => ({ startCheckout: (b: unknown) => startCheckout(b) }));

import { RechargePopup, RECHARGE_EVENT, RechargeNudge, shouldNudgeRecharge, __resetRechargeNudge } from "./RechargePopup";

describe("RechargePopup", () => {
  it("probador: se abre con el evento, ofrece el pack de US$20 y compra directo", async () => {
    const onRecharge = vi.fn();
    render(<RechargePopup onRecharge={onRecharge} />);
    expect(screen.queryByText(/Recarga para seguir/)).toBeNull();
    act(() => { window.dispatchEvent(new Event(RECHARGE_EVENT)); });
    expect(screen.getByText("Recarga para seguir con esta herramienta")).toBeTruthy();
    expect(screen.getByText(/285 imágenes o 8 anuncios en video o 133 textos cortos/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Recargar 2\.000 créditos por US\$20/ }));
    expect(startCheckout).toHaveBeenCalledWith({ action: "pack", pack_id: "power" });
    expect(onRecharge).not.toHaveBeenCalled();
  });

  it("cliente sin saldo: dice cuánto costaba y cuánto tiene, y 'Ver todos los paquetes' lleva a la página", () => {
    const onRecharge = vi.fn();
    render(<RechargePopup onRecharge={onRecharge} />);
    act(() => { window.dispatchEvent(new CustomEvent(RECHARGE_EVENT, { detail: { reason: "insufficient_credits", cost: 55, balance: 12 } })); });
    expect(screen.getByText("Te faltan créditos para esto")).toBeTruthy();
    expect(screen.getByText("55 créditos")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ver todos los paquetes" }));
    expect(onRecharge).toHaveBeenCalledTimes(1);
  });
});

describe("RechargeNudge (después de un resultado bueno)", () => {
  it("regla: solo con saldo < 300, nunca al admin, una vez por sesión", () => {
    expect(shouldNudgeRecharge(180, false, false)).toBe(true);
    expect(shouldNudgeRecharge(300, false, false)).toBe(false);
    expect(shouldNudgeRecharge(180, true, false)).toBe(false);
    expect(shouldNudgeRecharge(180, false, true)).toBe(false);
  });

  it("con 180 créditos dice qué rinden, ofrece 2.000 por US$20 y no vuelve a salir en la sesión", () => {
    __resetRechargeNudge();
    credits.balance = 180; admin.isAdmin = false;
    const { unmount } = render(<RechargeNudge />);
    expect(screen.getByText(/25 imágenes/)).toBeTruthy();
    expect(screen.getByText(/2\.000 créditos son US\$20 y no caducan/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Recargar 2\.000 por US\$20/ }));
    expect(startCheckout).toHaveBeenLastCalledWith({ action: "pack", pack_id: "power" });
    unmount();
    render(<RechargeNudge />);
    expect(screen.queryByText(/no caducan/)).toBeNull();
  });

  it("con saldo de sobra o siendo admin no muestra nada", () => {
    __resetRechargeNudge();
    credits.balance = 1500; admin.isAdmin = false;
    const a = render(<RechargeNudge />);
    expect(a.container.textContent).toBe("");
    a.unmount();
    __resetRechargeNudge();
    credits.balance = 50; admin.isAdmin = true;
    const b = render(<RechargeNudge />);
    expect(b.container.textContent).toBe("");
  });
});
