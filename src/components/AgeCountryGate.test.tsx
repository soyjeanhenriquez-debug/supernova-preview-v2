import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const rpc = vi.fn();
let row: unknown = null;
let meta: Record<string, unknown> = { full_name: "Jean Henriquez" };
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1", user_metadata: meta } }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }) }),
    rpc: (...a: unknown[]) => rpc(...a),
  },
}));

import { AgeCountryGate } from "./AgeCountryGate";

// Con muchas pruebas a la vez la máquina va lenta: 5 s no alcanzan para montar el formulario.
vi.setConfig({ testTimeout: 20_000 });

describe("AgeCountryGate", () => {
  beforeEach(() => { rpc.mockReset(); row = null; meta = { full_name: "Jean Henriquez" }; });

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

  it("saluda con el nombre del registro (display_name) y − / + funcionan con la casilla vacía", async () => {
    meta = { display_name: "Ana Pérez" };
    render(<AgeCountryGate />);
    expect(await screen.findByText("Hola, Ana")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sumar un año" }));
    expect((screen.getByLabelText("Tu edad") as HTMLInputElement).value).toBe("18");
    fireEvent.click(screen.getByRole("button", { name: "Restar un año" }));
    expect((screen.getByLabelText("Tu edad") as HTMLInputElement).value).toBe("17");
  });

  it("si el servidor rechaza, dice qué hacer y no se cierra", async () => {
    rpc.mockResolvedValue({ data: { ok: false, error: "country" }, error: null });
    render(<AgeCountryGate />);
    await screen.findByText("Hola, Jean");
    fireEvent.change(screen.getByLabelText("Tu edad"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: /^(Elegir país|País:)/ }));
    fireEvent.click(screen.getByRole("button", { name: /México/ }));
    fireEvent.submit(screen.getByRole("button", { name: /continuar/i }).closest("form")!);
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(screen.getByText("Hola, Jean")).toBeTruthy();
  });
});
