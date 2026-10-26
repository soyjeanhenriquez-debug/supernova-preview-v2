import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { diaRD, instante } from "@/lib/publicar";

const hoy = diaRD(new Date(Date.now() + 86_400_000)); // mañana: casillas en el futuro
const pieza = { id: "11111111-1111-1111-1111-111111111111", title: "Lo que venden las empresas líderes", topic: "x", caption: "Comenta «LIDER» y te lo mando.",
  slot_at: instante(hoy, "12:30"), media_tipo: "reel", media_paths: ["u/a/reel.mp4"], pub_estado: "listo", pub_redes: ["instagram", "youtube"], pub_error: null };

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u" } }) }));
vi.mock("@/lib/fnAuth", () => ({ fnHeaders: async () => ({}), fnErrorMessage: async () => "error" }));
vi.mock("@/integrations/supabase/client", () => {
  const q = () => { const o: Record<string, unknown> = {}; for (const k of ["select", "eq", "gte", "lte", "order", "update", "insert"]) o[k] = () => o;
    o.then = (res: (v: unknown) => void) => res({ data: [pieza], error: null }); return o; };
  return { supabase: { from: () => q(), storage: { from: () => ({ createSignedUrls: async () => ({ data: [{ path: "u/a/reel.mp4", signedUrl: "blob:x" }] }) }) } } };
});

import { ParaPublicar } from "./ParaPublicar";

describe("Para publicar", () => {
  it("muestra 3 casillas por día con la pieza en su hora y las vacías listas para subir", async () => {
    render(<ParaPublicar />);
    expect(await screen.findByText("Lo que venden las empresas líderes")).toBeInTheDocument();
    expect(screen.getAllByText(/Subir el reel/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Subir las láminas/).length).toBeGreaterThan(0);
    expect(screen.getByText("Listo para programar")).toBeInTheDocument();
  });
  it("«Programar» llama al servidor con la pieza (no programa desde el navegador)", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true, notion: "sin conexión" }), { status: 200 }));
    render(<ParaPublicar />);
    fireEvent.click(await screen.findByRole("button", { name: /Programar/ }));
    await waitFor(() => expect(f).toHaveBeenCalled());
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/functions\/v1\/publicar$/);
    expect(JSON.parse(String(init.body))).toEqual({ action: "programar", item_id: pieza.id });
    f.mockRestore();
  });
});
