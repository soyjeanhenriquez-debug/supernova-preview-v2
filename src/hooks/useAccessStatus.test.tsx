import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const rpc = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { useAccessStatus, RECHECK_MIN_MS } from "./useAccessStatus";

describe("useAccessStatus", () => {
  beforeEach(() => { rpc.mockReset(); });

  it("sin plan → vitrina; al volver a la pestaña tras pagar en Whop, se abre sin recargar", async () => {
    let paid = false;
    rpc.mockImplementation((fn: string) => Promise.resolve({ data: fn === "has_access" ? paid : null, error: null }));
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1_000_000);
    const { result } = renderHook(() => useAccessStatus());
    await waitFor(() => expect(result.current).toBe("pending"));

    paid = true; // el webhook de Whop ya dio el acceso en el servidor
    now.mockReturnValue(1_000_000 + RECHECK_MIN_MS + 1);
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await waitFor(() => expect(result.current).toBe("allowed"));
    now.mockRestore();
  });

  it("no vuelve a preguntar si vuelve enseguida", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const { result } = renderHook(() => useAccessStatus());
    await waitFor(() => expect(result.current).toBe("pending"));
    const calls = rpc.mock.calls.length;
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(rpc.mock.calls.length).toBe(calls);
  });
});
