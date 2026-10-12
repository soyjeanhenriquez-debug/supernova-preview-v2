import { describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {} } }));
import { sameUser } from "./AuthContext";

const base = { id: "u1", email: "a@b.co", updated_at: "2026-10-12T00:00:00Z", user_metadata: { name: "Ana" } } as unknown as User;

describe("sameUser (no recargar la app al volver a la pestaña)", () => {
  it("un objeto nuevo con los mismos datos cuenta como el mismo usuario", () => {
    expect(sameUser(base, JSON.parse(JSON.stringify(base)))).toBe(true);
  });
  it("otro usuario, o datos cambiados (updateUser), sí cuenta como cambio", () => {
    expect(sameUser(base, { ...base, id: "u2" } as User)).toBe(false);
    expect(sameUser(base, { ...base, user_metadata: { name: "Ana María" } } as User)).toBe(false);
  });
  it("entrar y salir cuentan como cambio", () => {
    expect(sameUser(null, base)).toBe(false);
    expect(sameUser(base, null)).toBe(false);
    expect(sameUser(null, null)).toBe(true);
  });
});
