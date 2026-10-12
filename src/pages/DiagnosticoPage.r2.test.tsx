/**
 * R2-15 · Diagnóstico con números imposibles (12-oct-2026).
 * Cada paso del embudo sale del anterior: si alguien anota más clics que vistas (o más mensajes que
 * clics), la app avisa y NO da un diagnóstico que no tendría sentido. Con números sanos, no avisa.
 * Gratis y sin IA: nunca llama a la red.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { diagnose } from "@/lib/funnelDoctor";

const { chain } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = { select: () => chain, eq: () => chain, gte: () => chain, limit: async () => ({ data: [] }) };
  return { chain };
});
const fetchMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => chain } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u" } }) }));
vi.mock("@/components/ToolFeedback", () => ({ ToolFeedback: () => null }));
vi.mock("@/lib/businessProfile", async () => {
  const actual = await vi.importActual<typeof import("@/lib/businessProfile")>("@/lib/businessProfile");
  return { ...actual, useBusinessProfile: () => ({ profile: actual.EMPTY_PROFILE, loaded: true, savePatch: vi.fn(), productId: "r2" }) };
});

import { DiagnosticoPage } from "./DiagnosticoPage";

// La primera coincidencia es el campo de números (abajo están los mínimos sanos de cada paso).
const field = (re: RegExp) => screen.getAllByLabelText(re)[0];
const type = (re: RegExp, v: string) => fireEvent.change(field(re), { target: { value: v } });
const WARNING = /no puede ser mayor|no cuadra|imposible|revisa (esos|estos|tus) (dos )?n[úu]meros/i;
const BOTTLENECK = /Lo que más te frena/i;

describe("R2 · Diagnóstico: números imposibles", () => {
  beforeEach(() => { localStorage.clear(); fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });

  it("más clics que vistas → aviso y sin diagnóstico", () => {
    render(<DiagnosticoPage onNavigate={vi.fn()} />);
    type(/vieron/i, "100");
    type(/clic/i, "500");
    type(/escribieron/i, "20");
    type(/respondiste/i, "10");
    type(/^te compraron/i, "2");
    expect(screen.getByText(WARNING)).toBeInTheDocument();
    expect(screen.queryByText(BOTTLENECK)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("más mensajes que clics → aviso", () => {
    render(<DiagnosticoPage onNavigate={vi.fn()} />);
    type(/vieron/i, "10.000");
    type(/clic/i, "50");
    type(/escribieron/i, "80");
    expect(screen.getByText(WARNING)).toBeInTheDocument();
  });

  it("más ventas que conversaciones → aviso", () => {
    render(<DiagnosticoPage onNavigate={vi.fn()} />);
    type(/escribieron/i, "40");
    type(/respondiste/i, "10");
    type(/^te compraron/i, "12");
    expect(screen.getByText(WARNING)).toBeInTheDocument();
  });

  it("números sanos → sin aviso", () => {
    render(<DiagnosticoPage onNavigate={vi.fn()} />);
    type(/vieron/i, "100.000");
    type(/clic/i, "2.000");
    type(/escribieron/i, "400");
    type(/respondiste/i, "88");
    type(/^te compraron/i, "9");
    expect(screen.queryByText(WARNING)).toBeNull();
    expect(screen.getByText(BOTTLENECK)).toBeInTheDocument();
  });

  it("la cuenta nunca da más de 100 % ni ventas extra negativas, aunque los números no cuadren", () => {
    const d = diagnose({ views: 100, clicks: 500, leads: 900, contacted: 1000, sales: 2000, repeat: 5000 });
    for (const s of d.stages) {
      if (s.rate !== null) { expect(s.rate, s.def.id).toBeLessThanOrEqual(100); expect(s.rate, s.def.id).toBeGreaterThanOrEqual(0); }
      expect(s.extraSales, s.def.id).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(s.extraSales), s.def.id).toBe(true);
    }
  });
});
