import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const UID = "11111111-2222-3333-4444-555555555555";
const PID = "aaaaaaaa-2222-3333-4444-555555555555";
const updates: Record<string, unknown>[] = [];
const invokes: { name: string; body: Record<string, unknown> }[] = [];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const row = { id: "i1", topic: "Cómo vender sin aparecer", title: "Cómo vender sin aparecer", stage: "atraer", platform: "reels", status: "grabado", due: inDays(0), source: "carrusel", created_at: "2026-10-06", kind: "corto", channels: { reels: { done: true }, tiktok: { done: true }, shorts: { done: false } }, keyword: "SISTEMA", leads: 2, sales: 0 };
const later = { ...row, id: "i2", title: "Rutina de 10 minutos sin equipo", topic: "rutina sin equipo", status: "idea", due: inDays(7), source: "mes", channels: { reels: { done: false } }, keyword: null, leads: 0 };
let rows: Record<string, unknown>[] = [row];

vi.mock("@/integrations/supabase/client", () => {
  const q: Record<string, unknown> = {};
  Object.assign(q, {
    select: () => q, eq: () => q, order: () => q,
    limit: async () => ({ data: rows, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
    update: (patch: Record<string, unknown>) => { updates.push(patch); return { eq: async () => ({ error: null }) }; },
    upsert: async () => ({ error: null }),
  });
  return { supabase: { from: () => q, functions: { invoke: async (name: string, o: { body: Record<string, unknown> }) => { invokes.push({ name, body: o.body }); return { data: { ideas: [], searches: [] }, error: null }; } } } };
});
const USER = { id: UID };
const PROFILE = { profile: { product: "Mi marca", who: "Dueños" }, loaded: true };
const PRODUCTS = { activeId: PID };
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: USER }) }));
vi.mock("@/contexts/ProductContext", () => ({ useProducts: () => PRODUCTS, useOptionalProducts: () => PRODUCTS }));
vi.mock("@/lib/businessProfile", () => ({ useBusinessProfile: () => PROFILE }));
// La pantalla ya muestra el costo del "mes de contenido": los créditos se simulan (no hay sesión real).
vi.mock("@/hooks/useCredits", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useCredits")>("@/hooks/useCredits");
  return { ...actual, useCredits: () => ({ applyServerCharge: vi.fn(), canAfford: () => true, balance: 2000 }) };
});

import { ContentPage } from "./ContentPage";

describe("ContentPage · tracker de publicaciones", () => {
  beforeEach(() => { updates.length = 0; invokes.length = 0; rows = [row]; PROFILE.profile.product = "Mi marca"; });
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
  it("arriba dice qué publicar hoy y 'Ya lo publiqué' marca todas sus redes", async () => {
    render(<ContentPage />);
    await waitFor(() => expect(screen.getByText("Hoy publica esto")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: /Ya lo publiqué/ })[0]);
    await waitFor(() => expect(updates.length).toBe(1));
    expect(updates[0]).toMatchObject({ status: "publicado" });
    const ch = updates[0].channels as Record<string, { done: boolean }>;
    expect(Object.values(ch).every(c => c.done)).toBe(true);
  });
  it("se navega a la próxima semana y se ve lo agendado ahí", async () => {
    rows = [row, later];
    render(<ContentPage />);
    await waitFor(() => expect(screen.getByRole("tab", { name: /La próxima · 1/ })).toBeInTheDocument());
    expect(screen.queryByDisplayValue("Rutina de 10 minutos sin equipo")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /La próxima/ }));
    await waitFor(() => expect(screen.getByDisplayValue("Rutina de 10 minutos sin equipo")).toBeInTheDocument());
  });
  it("busca ideas con el tema real del producto activo", async () => {
    PROFILE.profile.product = "Programa digital de ejercicio en casa de 28 días, sin equipo";
    render(<ContentPage />);
    await waitFor(() => expect(screen.getByDisplayValue("ejercicio en casa")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^Buscar ideas$/ }));
    await waitFor(() => expect(invokes.length).toBe(1));
    expect(invokes[0]).toMatchObject({ name: "content-ideas", body: { seed: "ejercicio en casa", product_id: PID } });
  });
});
