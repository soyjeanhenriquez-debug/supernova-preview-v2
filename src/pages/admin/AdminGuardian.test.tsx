import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// Base simulada: un hallazgo crítico abierto, uno que espera OK, una auditoría terminada y sus pruebas.
const rpc = vi.fn();
const tablas: Record<string, unknown[]> = {
  guardian_findings: [
    { id: "f1", fingerprint: "a", feature: "Analiza un Reel", severity: "critico", perspective: "calidad", problem: "La pantalla se cae.", impact: "Pierde el análisis.",
      evidence: { veces: 6 }, evidence_kind: "observado", proposal: "Pintar texto.", fix_type: "autonoma", status: "abierto", verification: null, occurrences: 6, last_seen: "2026-10-24T10:00:00Z", decision_note: null },
    { id: "f2", fingerprint: "b", feature: "Radar · búsqueda en vivo", severity: "importante", perspective: "confianza", problem: "Búsquedas cobradas solas.", impact: "Gasta cuota.",
      evidence: {}, evidence_kind: "observado", proposal: "Que no cobre.", fix_type: "requiere_ok", status: "pendiente_ok", verification: null, occurrences: 1363, last_seen: "2026-10-24T10:00:00Z", decision_note: null },
  ],
  guardian_runs: [{ id: "r1", kind: "completa", status: "terminada", requested_at: "2026-10-24T10:00:00Z", started_at: "2026-10-24T10:00:00Z", finished_at: "2026-10-24T10:00:01Z",
    steps: Array(13).fill("x"), steps_done: 13, current_step: null, summary: { pruebas: { pasaron: 11, fallaron: 4, sin_probar: 5 } } }],
  guardian_journey: [{ journey: "Reel Studio", step_order: 3, step: "Seleccionar su voz", status: "con_friccion", method: "inspeccion", evidence: "id de ElevenLabs" }],
  guardian_checks: [{ id: 1, area: "Cobros", name: "Precios ≥ costo real × 5", ok: false, method: "datos", detail: "3 precios" }],
};
vi.mock("@/integrations/supabase/client", () => {
  const q = (t: string) => {
    const o = { select: () => o, order: () => o, eq: () => o, limit: () => o,
      then: (res: (v: unknown) => void) => res({ data: tablas[t] ?? [], error: null }) };
    return o;
  };
  return { supabase: { from: (t: string) => q(t), rpc: (...a: unknown[]) => rpc(...a) } };
});

import AdminGuardian from "./AdminGuardian";

describe("Admin → Guardián del Creador", () => {
  it("muestra el estado real (conteos) y el hallazgo crítico primero", async () => {
    render(<AdminGuardian />);
    expect(await screen.findByText("La pantalla se cae.")).toBeInTheDocument();
    expect(screen.getByText(/11 pruebas pasaron · 4 fallaron · 5 no se pudieron probar/)).toBeInTheDocument();
    expect(screen.getByText("Críticos").previousSibling?.textContent).toBe("1");
  });

  it("«Auditar toda Supernova» pide la auditoría y la avanza hasta terminar", async () => {
    rpc.mockReset();
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "guardian_request_audit") return { data: { run_id: "r2", ya_corriendo: false }, error: null };
      return { data: { status: "terminada", done: 13, total: 13, step: null }, error: null };
    });
    render(<AdminGuardian />);
    fireEvent.click(await screen.findByRole("button", { name: /Auditar toda Supernova/ }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("guardian_advance", { p_run: "r2" }));
    expect(rpc).toHaveBeenCalledWith("guardian_request_audit", { p_kind: "completa" });
  });

  it("lo que necesita OK se aprueba con un clic y queda guardado en el servidor", async () => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: null, error: null });
    render(<AdminGuardian />);
    fireEvent.click(await screen.findByRole("button", { name: "Esperan tu OK" }));
    fireEvent.click(await screen.findByRole("button", { name: "Aprobar" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("guardian_decide", { p_finding: "f2", p_decision: "aprobado", p_note: null }));
  });

  it("muestra las pruebas y los recorridos con cómo se verificaron", async () => {
    render(<AdminGuardian />);
    fireEvent.click(await screen.findByRole("tab", { name: "Pruebas" }));
    expect(await screen.findByText(/Precios ≥ costo real × 5/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Recorridos" }));
    expect(await screen.findByText("Con fricción")).toBeInTheDocument();
  });
});
