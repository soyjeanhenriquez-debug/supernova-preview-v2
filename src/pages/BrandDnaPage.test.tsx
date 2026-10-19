import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Tu ADN (19-oct-2026): pruebas de aceptación 1, 2, 8 y 11 del brief de Jean, con la base simulada en
 * memoria (una fila de brand_dna por usuario, como la tabla real).
 */
const UID = "11111111-2222-3333-4444-555555555555";
let stored: Record<string, unknown> | null = null;
const upserts: Record<string, unknown>[] = [];
let failNext = false;

vi.mock("@/integrations/supabase/client", () => {
  const q: Record<string, unknown> = {};
  Object.assign(q, {
    select: () => q, eq: () => q, order: () => q,
    limit: async () => ({ data: [], error: null }),
    maybeSingle: async () => ({ data: stored, error: null }),
    upsert: async (row: Record<string, unknown>) => {
      if (failNext) { failNext = false; return { error: { message: "sin red" } }; }
      upserts.push(row); stored = { ...(stored ?? {}), ...row }; return { error: null };
    },
  });
  return { supabase: { from: () => q } };
});
const USER = { id: UID };
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: USER }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { BrandDnaPage } from "./BrandDnaPage";

const ESENCIAL = "Soy nutricionista y llevo ocho años trabajando con deportistas 💪🏽 en Santo Domingo.";

describe("Tu ADN", () => {
  beforeEach(() => { stored = null; upserts.length = 0; failNext = false; localStorage.clear(); vi.useRealTimers(); });

  it("1) las esenciales se guardan solas a los 600 ms y siguen ahí al volver", async () => {
    const { unmount } = render(<BrandDnaPage />);
    const q1 = await screen.findByLabelText(/1\. ¿Quién eres/);
    fireEvent.change(q1, { target: { value: ESENCIAL } });
    expect(upserts.length).toBe(0); // todavía no: espera a que dejes de escribir
    await waitFor(() => expect(upserts.length).toBe(1), { timeout: 2000 });
    expect(upserts[0]).toMatchObject({ user_id: UID, identity: ESENCIAL });
    expect(await screen.findByText("Guardado")).toBeInTheDocument();
    unmount();
    render(<BrandDnaPage />);
    expect(await screen.findByDisplayValue(ESENCIAL)).toBeInTheDocument();
    expect(screen.getByText(/Tu ADN al 17 %/)).toBeInTheDocument();
  });

  it("2) las opcionales se guardan aunque cierres el acordeón", async () => {
    render(<BrandDnaPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Profundiza en tu ADN/ }));
    const p11 = screen.getByLabelText(/¿De qué tres temas hablarías/);
    fireEvent.change(p11, { target: { value: "Viajes, cocina y videojuegos" } });
    fireEvent.click(screen.getByRole("button", { name: /Profundiza en tu ADN/ })); // se cierra
    await waitFor(() => expect(stored?.intrinsic_interests).toBe("Viajes, cocina y videojuegos"), { timeout: 2000 });
  });

  it("11) tildes y emojis cuentan igual que la base; lo que pasa el tope no se guarda ni se recorta", async () => {
    render(<BrandDnaPage />);
    const q6 = await screen.findByLabelText(/6\. Dentro de un año/);
    const largo = "ñ😀é".repeat(117); // 351 caracteres reales (tope 350)
    fireEvent.change(q6, { target: { value: largo } });
    expect(screen.getByText("351/350")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Te pasaste por 1");
    await new Promise(r => setTimeout(r, 900));
    expect(upserts.some(u => "desired_perception" in u)).toBe(false);
    expect((q6 as HTMLTextAreaElement).value).toBe(largo); // nada se recortó
  });

  it("si falla la red, avisa en lenguaje humano y conserva el borrador para el próximo intento", async () => {
    failNext = true;
    const { unmount } = render(<BrandDnaPage />);
    const q2 = await screen.findByLabelText(/2\. ¿Para qué te busca la gente/);
    fireEvent.change(q2, { target: { value: "Me escriben para saber cómo vender por internet." } });
    expect(await screen.findByText("No se guardó, revisa tu conexión", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(`supernova.adn.borrador.${UID}`) ?? "{}").recognized_value).toContain("vender por internet");
    unmount();
    render(<BrandDnaPage />); // al volver, el borrador se envía solo
    await waitFor(() => expect(stored?.recognized_value).toBe("Me escriben para saber cómo vender por internet."));
    expect(localStorage.getItem(`supernova.adn.borrador.${UID}`)).toBeNull();
  });

  it("8) la pregunta 8 es privada hasta que actives su uso, y se puede quitar", async () => {
    render(<BrandDnaPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Profundiza en tu ADN/ }));
    const toggle = screen.getByRole("checkbox", { name: /Usar esta respuesta en mi contenido/ });
    expect(toggle).not.toBeChecked();
    expect(screen.getByText(/Apagado: es privada/)).toBeInTheDocument();
    await act(async () => { fireEvent.click(toggle); });
    await waitFor(() => expect(stored?.formative_editorial_ok).toBe(true));
    await act(async () => { fireEvent.click(toggle); });
    await waitFor(() => expect(stored?.formative_editorial_ok).toBe(false));
  });
});
