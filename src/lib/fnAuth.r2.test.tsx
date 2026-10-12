/**
 * R2-15 · Sin saldo → ventana de recarga (misión 03, 11-oct-2026).
 * El servidor responde 402 con code "insufficient_credits" (cliente sin saldo) o "recharge_required"
 * (probador sin recarga). En los dos casos se abre la ventana de recarga en el momento de más
 * intención. Cualquier otro error NO la abre. Se prueba de punta a punta: fnErrorMessage dispara el
 * evento y la RechargePopup montada lo recibe (si alguien cambia el nombre del evento en un lado, falla).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } },
}));
vi.mock("@/hooks/useCredits", () => ({
  useCredits: () => ({ balance: 10, monthly: 10, purchased: 0, limit: 2000, renewalDate: new Date(2026, 10, 5) }),
  CREDIT_COSTS: { gen_ad_image: 7, vid_mini_5: 75, gen_light: 15, gen_medium: 30 },
}));
vi.mock("@/hooks/useIsAdmin", () => ({ useIsAdmin: () => ({ isAdmin: false, loading: false }) }));
vi.mock("@/components/PublishBonus", () => ({ useBonusStatus: () => null }));
vi.mock("@/lib/stripe", () => ({ startCheckout: vi.fn().mockResolvedValue(true) }));

import { fnErrorMessage, invokeErrorMessage, offerRecharge } from "./fnAuth";
import { RechargePopup, RECHARGE_EVENT } from "@/components/RechargePopup";

const resp = (body: unknown, status = 402) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("R2 · fnErrorMessage abre la recarga", () => {
  let events: CustomEvent[] = [];
  const listen = (e: Event) => events.push(e as CustomEvent);
  beforeEach(() => {
    events = [];
    window.removeEventListener(RECHARGE_EVENT, listen);
    window.addEventListener(RECHARGE_EVENT, listen);
  });

  it("insufficient_credits: abre la ventana con costo y saldo, y devuelve el mensaje del servidor", async () => {
    const msg = await fnErrorMessage(resp({ code: "insufficient_credits", cost: 75, balance: 10, error: "No tienes créditos suficientes." }), "x");
    expect(msg).toBe("No tienes créditos suficientes.");
    expect(events).toHaveLength(1);
    expect(events[0].detail).toEqual({ reason: "insufficient_credits", cost: 75, balance: 10 });
  });

  it("recharge_required: abre la ventana (probador)", async () => {
    await fnErrorMessage(resp({ code: "recharge_required", error: "Recarga para seguir." }), "x");
    expect(events).toHaveLength(1);
    expect(events[0].detail.reason).toBe("recharge_required");
  });

  it("otros errores no abren la ventana y usan el texto de respaldo si no hay mensaje", async () => {
    expect(await fnErrorMessage(resp({ code: "rate_limited" }, 429), "Espera un minuto.")).toBe("Espera un minuto.");
    expect(await fnErrorMessage(new Response("<html>502</html>", { status: 502 }), "Falló.")).toBe("Falló.");
    expect(events).toHaveLength(0);
  });

  it("cost o balance que no son números no se mandan (no se inventan cifras)", async () => {
    await fnErrorMessage(resp({ code: "insufficient_credits", cost: "75", balance: null }), "x");
    expect(events[0].detail).toEqual({ reason: "insufficient_credits", cost: undefined, balance: undefined });
  });

  it("supabase.functions.invoke (error.context) también abre la ventana", async () => {
    const msg = await invokeErrorMessage({ message: "Edge Function returned a non-2xx status code", context: resp({ code: "insufficient_credits", error: "Sin saldo." }) }, "x");
    expect(msg).toBe("Sin saldo.");
    expect(events).toHaveLength(1);
  });

  it("de punta a punta: la RechargePopup montada se abre con lo que manda fnErrorMessage", async () => {
    render(<RechargePopup onRecharge={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => { await fnErrorMessage(resp({ code: "insufficient_credits", cost: 75, balance: 10 }), "x"); });
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/75/);
    // Al cliente solo créditos: la ventana no dice cuánto vale UN crédito en dólares.
    expect(dialog.textContent).not.toMatch(/(por|cada|1)\s+cr[ée]dito[^.]{0,20}(US\$|\$)|(US\$|\$)\s*[\d.,]+\s*(por|el|cada|\/)\s*cr[ée]dito/i);
  });

  it("offerRecharge sin ventana montada no rompe nada", () => {
    expect(() => offerRecharge()).not.toThrow();
  });
});
