import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const invocaciones: string[] = [];
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: async (fn: string) => { invocaciones.push(fn); return { data: { subtitulos: [{ desde: 0, hasta: 2, texto: "hola a todos" }] }, error: null }; } } },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u" } }) }));
vi.mock("@/lib/businessProfile", () => ({ useBusinessProfile: () => ({ profile: {} }) }));
vi.mock("@/hooks/useCredits", () => ({ CREDIT_COSTS: { video_subtitles: 20, yt_scene_image: 6 }, useCredits: () => ({ applyServerCharge: () => undefined }) }));
vi.mock("@/hooks/useIsAdmin", () => ({ useIsAdmin: () => ({ isAdmin: false }) }));
vi.mock("@/components/tool/ToolShell", () => ({ ToolShell: ({ aside, children, title }: { aside: ReactNode; children: ReactNode; title: string }) => <div><h1>{title}</h1>{children}{aside}</div> }));
vi.mock("@/components/agentes/SiguientePaso", () => ({ SiguientePaso: () => null }));
vi.mock("@/components/ToolFeedback", () => ({ ToolFeedback: () => null }));
vi.mock("@remotion/player", () => ({ Player: () => <div data-testid="player" /> }));
vi.mock("@/lib/burnSubtitles", async (orig) => ({ ...(await orig<object>()), extractAudio: async () => ({ audio: "A".repeat(3000), seconds: 2 }), videoHasImage: async () => true }));
vi.mock("@/lib/edicionVideo", async (orig) => ({ ...(await orig<object>()), audioMono: async () => new Float32Array(16_000) }));

URL.createObjectURL = () => "blob:prueba";
URL.revokeObjectURL = () => undefined;

import { SubeTuVideo } from "./SubeTuVideo";

const elegirVideo = () => {
  render(<SubeTuVideo onHome={() => undefined} onNavigate={() => undefined} />);
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [new File(["x"], "toma.mp4", { type: "video/mp4" })] } });
};

describe("Sube tu video: qué hacemos con tu video", () => {
  it("al elegir el video pregunta: Subtítulos o Editarlo (y Editarlo abre sus 3 formas)", async () => {
    elegirVideo();
    expect(await screen.findByText("¿Qué hacemos con este video?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /solo programarlo/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Editarlo/ }));
    for (const t of ["Edición simple", "Con B-roll", "Plantilla Reel dinámico"]) expect(screen.getByRole("button", { name: new RegExp(`^${t}`) })).toBeInTheDocument();
  });
  it("«Subtítulos» abre la sección de subtítulos y los hace", async () => {
    invocaciones.length = 0;
    elegirVideo();
    fireEvent.click(await screen.findByRole("button", { name: /^Subtítulos/ }));
    expect(screen.getByRole("tab", { name: "Subtítulos" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("radiogroup", { name: "Estilo de subtítulos" })).toBeInTheDocument();
    await waitFor(() => expect(invocaciones).toEqual(["video-subtitles"]));
  });
  it("«Edición simple» abre Editar sin gastar (silencios en el navegador)", async () => {
    invocaciones.length = 0;
    elegirVideo();
    fireEvent.click(await screen.findByRole("button", { name: /^Editarlo/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Edición simple/ }));
    expect(screen.getByRole("tab", { name: "Editar" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("radio", { name: /Edición simple/ })).toHaveAttribute("aria-checked", "true");
    await new Promise(r => setTimeout(r, 50));
    expect(invocaciones).toEqual([]);
  });
  it("el agente editor entiende el pedido, cambia el estilo y contesta", async () => {
    elegirVideo();
    fireEvent.click(await screen.findByRole("button", { name: /^Editarlo/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Edición simple/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Pídele algo a tu editor" }), { target: { value: "ponle subtítulos estilo caja" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    expect(await screen.findByText(/^Hecho: hago los subtítulos, estilo En caja/)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Subtítulos" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("radio", { name: /En caja/ })).toHaveAttribute("aria-checked", "true");
  });
});
