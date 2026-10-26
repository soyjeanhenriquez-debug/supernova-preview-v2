import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { diaRD, instante } from "@/lib/publicar";

const manana = diaRD(new Date(Date.now() + 86_400_000)); // casillas en el futuro
const pieza = { id: "11111111-1111-1111-1111-111111111111", title: "Lo que venden las empresas líderes", topic: "x", caption: "Comenta «LIDER» y te lo mando.",
  slot_at: instante(manana, "12:30"), media_tipo: "reel", media_paths: ["u/a/reel.mp4"], pub_estado: "listo", pub_redes: ["instagram", "tiktok"],
  pub_error: null, pub_job: null, pub_hechas: {} };
const updates: Record<string, unknown>[] = [];
const upserts: Record<string, unknown>[] = [];

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u" } }) }));
vi.mock("@/lib/fnAuth", () => ({ fnHeaders: async () => ({}), fnErrorMessage: async () => "error" }));
vi.mock("@/integrations/supabase/client", () => {
  const q = (tabla: string) => {
    const o: Record<string, unknown> = {};
    for (const k of ["select", "eq", "gte", "lte", "order", "insert"]) o[k] = () => o;
    o.update = (v: Record<string, unknown>) => { updates.push(v); return o; };
    o.upsert = (v: Record<string, unknown>) => { upserts.push(v); return o; };
    o.maybeSingle = () => o;
    o.then = (res: (v: unknown) => void) => res(tabla === "publicar_ajustes" ? { data: null, error: null } : { data: [pieza], error: null });
    return o;
  };
  return { supabase: { from: (t: string) => q(t), storage: { from: () => ({ createSignedUrls: async () => ({ data: [{ path: "u/a/reel.mp4", signedUrl: "blob:x" }] }) }) } } };
});

import { ParaPublicar } from "./ParaPublicar";

const irAManana = async () => {
  render(<ParaPublicar />);
  fireEvent.click(await screen.findByRole("button", { name: "Día siguiente" }));
  return screen.findByText("Lo que venden las empresas líderes");
};

describe("Para publicar", () => {
  it("vista Hoy: cada casilla en su fila, la pieza con un botón por red y las libres listas para subir", async () => {
    await irAManana();
    expect(screen.getByText("Listo para programar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "IG" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "TikTok" })).toBeInTheDocument();
    expect(screen.getByText(/Subir las láminas/)).toBeInTheDocument();
    expect(screen.getByText(/Subir el reel/)).toBeInTheDocument();
  });
  it("un toque en IG la marca publicada con la hora (sin abrir nada)", async () => {
    await irAManana();
    updates.length = 0;
    fireEvent.click(screen.getByRole("button", { name: "IG" }));
    await waitFor(() => expect(updates.some(u => (u.pub_hechas as Record<string, unknown> | undefined)?.instagram)).toBe(true));
    expect(screen.getByRole("button", { name: /IG/ })).toHaveAttribute("aria-pressed", "true");
  });
  it("«Programar» llama al servidor con la pieza (no programa desde el navegador)", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true, notion: "sin conexión" }), { status: 200 }));
    await irAManana();
    fireEvent.click(screen.getByRole("button", { name: "Ver detalles" }));
    fireEvent.click(await screen.findByRole("button", { name: /Programar$/ }));
    await waitFor(() => expect(f).toHaveBeenCalled());
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/functions\/v1\/publicar$/);
    expect(JSON.parse(String(init.body))).toEqual({ action: "programar", item_id: pieza.id });
    f.mockRestore();
  });
  it("vista Semana: 7 días y la app guarda la vista elegida", async () => {
    render(<ParaPublicar />);
    upserts.length = 0;
    fireEvent.click(await screen.findByRole("tab", { name: /Semana/ }));
    expect(await screen.findAllByRole("button", { name: /^Abrir / })).toHaveLength(7);
    expect(upserts.at(-1)).toMatchObject({ user_id: "u", vista: "semana" });
  });
  it("el plan de 10 al día muestra 10 casillas", async () => {
    render(<ParaPublicar />);
    fireEvent.click(await screen.findByRole("button", { name: "10" }));
    await waitFor(() => expect(screen.getAllByText(/Casilla libre|Sin pieza/).length + screen.queryAllByText("Listo para programar").length).toBe(10));
  });
});
