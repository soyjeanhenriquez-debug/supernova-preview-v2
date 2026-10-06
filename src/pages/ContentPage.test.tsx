import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const UID = "11111111-2222-3333-4444-555555555555";
const PID = "aaaaaaaa-2222-3333-4444-555555555555";
const updates: Record<string, unknown>[] = [];
const row = { id: "i1", topic: "Cómo vender sin aparecer", title: "Cómo vender sin aparecer", stage: "atraer", platform: "reels", status: "grabado", due: new Date().toISOString().slice(0, 10), source: "carrusel", created_at: "2026-10-06", kind: "corto", channels: { reels: { done: true }, tiktok: { done: true }, shorts: { done: false } }, keyword: "SISTEMA", leads: 2, sales: 0 };

vi.mock("@/integrations/supabase/client", () => {
  const q: Record<string, unknown> = {};
  Object.assign(q, {
    select: () => q, eq: () => q, order: () => q,
    limit: async () => ({ data: [row], error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
    update: (patch: Record<string, unknown>) => { updates.push(patch); return { eq: async () => ({ error: null }) }; },
    upsert: async () => ({ error: null }),
  });
  return { supabase: { from: () => q, functions: { invoke: vi.fn() } } };
});
const USER = { id: UID };
const PROFILE = { profile: { product: "Mi marca", who: "Dueños" }, loaded: true };
const PRODUCTS = { activeId: PID };
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: USER }) }));
vi.mock("@/contexts/ProductContext", () => ({ useProducts: () => PRODUCTS, useOptionalProducts: () => PRODUCTS }));
vi.mock("@/lib/businessProfile", () => ({ useBusinessProfile: () => PROFILE }));

import { ContentPage } from "./ContentPage";

describe("ContentPage · tracker de publicaciones", () => {
  beforeEach(() => { updates.length = 0; });
  it("muestra las redes de la pieza y al marcar la última queda publicada", async () => {
    render(<ContentPage />);
    await waitFor(() => expect(screen.getAllByText("2 de 3 redes publicadas").length).toBeGreaterThan(0));
    expect(screen.getByText("Tu semana")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /Shorts/ })[0]);
    await waitFor(() => expect(updates.length).toBe(1));
    expect(updates[0]).toMatchObject({ status: "publicado" });
    expect((updates[0].channels as Record<string, { done: boolean }>).shorts.done).toBe(true);
  });
  it("suma un lead sin pasar de cero hacia abajo", async () => {
    render(<ContentPage />);
    await waitFor(() => expect(screen.getAllByText("te escribieron").length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole("button", { name: "Sumar lead" })[0]);
    await waitFor(() => expect(updates.at(-1)).toMatchObject({ leads: 3 }));
  });
});
