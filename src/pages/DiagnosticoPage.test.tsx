import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// El tracker devuelve 2 piezas con leads y ventas de los últimos 30 días. vi.hoisted: los mocks se
// evalúan antes que el resto del archivo.
const { chain, auth } = vi.hoisted(() => {
  const tracker = [{ leads: 30, sales: 2 }, { leads: 10, sales: 1 }];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = { select: () => chain, eq: () => chain, gte: () => chain, limit: async () => ({ data: tracker }) };
  return { chain, auth: { user: { id: "u" } } };
});
const fetchMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => chain } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("@/components/ToolFeedback", () => ({ ToolFeedback: () => null }));
vi.mock("@/lib/businessProfile", async () => {
  const actual = await vi.importActual<typeof import("@/lib/businessProfile")>("@/lib/businessProfile");
  return { ...actual, useBusinessProfile: () => ({ profile: actual.EMPTY_PROFILE, loaded: true, savePatch: vi.fn(), productId: "p" }) };
});

import { DiagnosticoPage } from "./DiagnosticoPage";

const type = (label: string, v: string) => fireEvent.change(screen.getByLabelText(label), { target: { value: v } });

describe("DiagnosticoPage", () => {
  beforeEach(() => { localStorage.clear(); fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });

  it("el caso de Brez: dice que el freno es responder y que más anuncios no lo arreglan, sin gastar IA", () => {
    const go = vi.fn();
    render(<DiagnosticoPage onNavigate={go} />);
    type("Te vieron", "100.000");
    type("Hicieron clic", "2.000");
    type("Te escribieron", "400");
    type("Les respondiste", "88");
    type("Te compraron", "9");
    expect(screen.getByText(/Lo que más te frena: te escriben → les respondes/)).toBeInTheDocument();
    expect(screen.getByText(/No necesitas más anuncios ni más contenido todavía/)).toBeInTheDocument();
    expect(screen.getAllByText("22 %").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Mensajes para los que dejaste sin respuesta/ }));
    expect(go).toHaveBeenCalledWith("Recuperar");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("trae leads y ventas del tracker con un toque", async () => {
    render(<DiagnosticoPage onNavigate={vi.fn()} />);
    const btn = await screen.findByRole("button", { name: /Usar mi tracker: 40 te escribieron · 3 compraron/ });
    fireEvent.click(btn);
    expect((screen.getByLabelText("Te escribieron") as HTMLInputElement).value).toBe("40");
    expect((screen.getByLabelText("Te compraron") as HTMLInputElement).value).toBe("3");
  });

  it("un 'No' en lo que ya tienes lleva a la herramienta que lo resuelve y se recuerda", async () => {
    const go = vi.fn();
    const { unmount } = render(<DiagnosticoPage onNavigate={go} />);
    const noBtns = screen.getAllByRole("button", { name: /^No$/ });
    fireEvent.click(noBtns[2]); // order bump
    fireEvent.click(screen.getByRole("button", { name: /Armar order bump/ }));
    expect(go).toHaveBeenCalledWith("Order bump");
    unmount();
    render(<DiagnosticoPage onNavigate={go} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Armar order bump/ })).toBeInTheDocument());
  });
});
