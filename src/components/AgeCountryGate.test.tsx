import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const rpc = vi.fn();
let row: unknown = null;
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1", user_metadata: { full_name: "Jean Henriquez" } } }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }) }),
    rpc: (...a: unknown[]) => rpc(...a),
  },
}));

import { AgeCountryGate } from "./AgeCountryGate";

describe("AgeCountryGate", () => {
  beforeEach(() => { rpc.mockReset(); row = null; });

  it("pregunta edad y país, no deja seguir sin los dos y guarda en el servidor", async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    render(<AgeCountryGate />);
    expect(await screen.findByText("Hola, Jean")).toBeTruthy();
    const go = screen.getByRole("button", { name: /continuar/i }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Tu edad"), { target: { value: "28" } });
    fireEvent.click(screen.getByRole("button", { name: /^(Elegir país|País:)/ }));
    fireEvent.click(screen.getByRole("button", { name: /República Dominicana/ }));
    expect(go.disabled).toBe(false);
    fireEvent.click(go);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("set_age_country", { p_age: 28, p_country: "DO" }));
    await waitFor(() => expect(screen.queryByText("Hola, Jean")).toBeNull());
  });

  it("no aparece si ya contestó", async () => {
    row = { user_id: "u1" };
    render(<AgeCountryGate />);
    await new Promise(r => setTimeout(r, 20));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
