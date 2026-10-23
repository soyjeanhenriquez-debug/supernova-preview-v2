/**
 * R2-15 · Créditos (12-oct-2026). Precios aprobados por Jean y el desglose "del mes / comprados".
 *  - Imagen de anuncio 7 (12-oct-2026); video de 5 s 89 y de 10 s 177 (costo × 6, decisión de Jean del 22-oct-2026).
 *  - El servidor gasta primero los del mes y después los comprados: lo comprado que se ve es
 *    min(comprados, saldo) y lo del mes es el resto. Nunca negativo, nunca más que el saldo.
 * Sin red: el cliente de Supabase está simulado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const db = vi.hoisted(() => ({ row: null as Record<string, unknown> | null }));

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock("@/integrations/supabase/client", () => {
  const credits = { select: () => credits, eq: () => credits, maybeSingle: async () => ({ data: db.row, error: null }) };
  const txs = { select: () => txs, eq: () => txs, order: () => txs, limit: async () => ({ data: [], error: null }) };
  return {
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { user: { id: "u1" }, access_token: "t" } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      from: (t: string) => (t === "user_credits" ? credits : txs),
      rpc: vi.fn(async () => ({ data: { granted: false }, error: null })),
    },
  };
});

// El hook guarda una foto compartida a nivel de módulo: cada caso carga el módulo de nuevo.
async function load(row: Record<string, unknown>) {
  vi.resetModules();
  db.row = { last_grant_at: "2026-10-01T00:00:00Z", ...row };
  const mod = await import("./useCredits");
  const { result } = renderHook(() => mod.useCredits());
  await waitFor(() => expect(result.current.balance).toBe(row.balance));
  return result;
}

describe("R2 · precios aprobados (CREDIT_COSTS)", () => {
  it("imagen 7, video de 5 s 89, video de 10 s 177", async () => {
    const { CREDIT_COSTS } = await import("./useCredits");
    expect(CREDIT_COSTS.gen_ad_image).toBe(7);
    expect(CREDIT_COSTS.vid_mini_5).toBe(89);
    expect(CREDIT_COSTS.vid_mini_10).toBe(177);
  });

  it("10 s cuesta lo de 10 s (costo × 6, redondeado) y ningún precio de IA es 0 salvo gen_media (precio del catálogo)", async () => {
    const { CREDIT_COSTS } = await import("./useCredits");
    expect(CREDIT_COSTS.vid_mini_10 * 0.008).toBeGreaterThanOrEqual(0.236 * 6 - 1e-9);
    for (const [k, v] of Object.entries(CREDIT_COSTS)) {
      if (k === "gen_media") continue;
      expect(v, k).toBeGreaterThan(0);
      expect(Number.isInteger(v), k).toBe(true);
    }
  });

  it("los generadores cuestan lo mismo que su acción (texto corto, medio, largo)", async () => {
    const { CREDIT_COSTS, generatorCost } = await import("./useCredits");
    for (const id of ["hooks-meta", "carrusel-copy", "landing-copy", "vsl-main", "un-generador-nuevo"]) {
      const g = generatorCost(id);
      expect(g.cost, id).toBe(CREDIT_COSTS[g.action]);
    }
  });

  it("cada acción tiene nombre para el historial (sin dólares)", async () => {
    const { CREDIT_COSTS, ACTION_LABEL } = await import("./useCredits");
    for (const k of Object.keys(CREDIT_COSTS) as (keyof typeof CREDIT_COSTS)[]) {
      expect(ACTION_LABEL[k], k).toBeTruthy();
      expect(ACTION_LABEL[k], k).not.toMatch(/US\$|\$|d[óo]lar/i);
    }
  });
});

describe("R2 · desglose del saldo: comprados = min(comprados, saldo)", () => {
  beforeEach(() => { localStorage.clear(); });

  it("si ya gastó parte de lo comprado, lo comprado no pasa del saldo y lo del mes queda en 0", async () => {
    const r = await load({ balance: 300, purchased: 1000 });
    expect(r.current.purchased).toBe(300);
    expect(r.current.monthly).toBe(0);
  });

  it("con saldo del mes y comprados, se ven los dos y suman el saldo", async () => {
    const r = await load({ balance: 1500, purchased: 200 });
    expect(r.current.purchased).toBe(200);
    expect(r.current.monthly).toBe(1300);
    expect(r.current.monthly + r.current.purchased).toBe(r.current.balance);
  });

  it("saldo 0: nada del mes ni comprado (nunca negativo)", async () => {
    const r = await load({ balance: 0, purchased: 500 });
    expect(r.current.purchased).toBe(0);
    expect(r.current.monthly).toBe(0);
  });

  it("sin columna purchased (base vieja): lo que pasa de 2.000 cuenta como comprado", async () => {
    const r = await load({ balance: 2500 });
    expect(r.current.purchased).toBe(500);
    expect(r.current.monthly).toBe(2000);
  });
});
