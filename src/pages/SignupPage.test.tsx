import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const signUp = vi.fn();
const resend = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signUp: (...a: unknown[]) => signUp(...a), resend: (...a: unknown[]) => resend(...a) } },
}));
// La verificación de Cloudflare pasa sola en la prueba.
vi.mock("@/components/Turnstile", async () => {
  const { useEffect } = await import("react");
  return { Turnstile: ({ onVerify, resetKey }: { onVerify: (t: string) => void; resetKey?: unknown }) => { useEffect(() => { onVerify(`tok-${String(resetKey ?? 0)}`); }, [onVerify, resetKey]); return null; } };
});
vi.mock("@/lib/loadFonts", () => ({ loadEditorialFonts: () => {} }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import SignupPage from "./SignupPage";

function fill(email = "ana@gmail.com") {
  fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Ana Pérez" } });
  fireEvent.change(screen.getByLabelText("Correo"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "clave-segura-1" } });
}

async function answerAll() {
  fireEvent.click(await screen.findByRole("button", { name: "Estoy empezando desde cero" }));
  fireEvent.click(await screen.findByRole("button", { name: "Todavía no lo sé: quiero ideas" }));
}

// Con muchas pruebas a la vez la máquina va lenta: 5 s no alcanzan para montar el formulario.
vi.setConfig({ testTimeout: 20_000 });

describe("SignupPage", () => {
  beforeEach(() => { signUp.mockReset(); resend.mockReset(); sessionStorage.clear(); });

  it("crea la cuenta tras 2 preguntas, ofrece los 3 días en Whop con su correo y deja entrar sin tarjeta", async () => {
    signUp.mockResolvedValue({ data: { user: { identities: [{ id: "i" }] }, session: null }, error: null });
    render(<MemoryRouter><SignupPage /></MemoryRouter>);
    fill();
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    await answerAll();
    // 25-nov (Jean): el registro encadena con la prueba de 3 días de PRO en Whop.
    const cta = await screen.findByRole("link", { name: /Activar mis 3 días gratis/ });
    expect(cta.getAttribute("href")).toMatch(/^https:\/\/whop\.com\/checkout\/plan_ukBjctlEKufto\?/);
    expect(cta.getAttribute("href")).toContain("email=ana%40gmail.com");
    expect(screen.getByText(/no te cobra nada en esos 3 días/)).toBeTruthy();
    expect(sessionStorage.getItem("sn_signup_email")).toBe("ana@gmail.com");
    fireEvent.click(screen.getByRole("button", { name: /Prefiero entrar sin tarjeta/ }));
    expect(await screen.findByText("Confirma tu correo para entrar.")).toBeTruthy();
    expect(signUp).toHaveBeenCalledTimes(1);
    const arg = signUp.mock.calls[0][0];
    expect(arg.email).toBe("ana@gmail.com");
    expect(arg.options.emailRedirectTo).toBe(window.location.origin);
    expect(arg.options.data).toEqual({
      display_name: "Ana Pérez",
      signup_source: "trial",
      onboarding: { experience_level: "Estoy empezando desde cero", sells_what: "Todavía no lo sé: quiero ideas" },
    });
    expect(screen.queryByText(/COMUNIDAD/i)).toBeNull();
    expect(screen.getByRole("link", { name: /Abrir Gmail/ })).toBeTruthy();
  });

  it("al volver de Whop con la cuenta ya creada, salta a 'confirma tu correo' con el pago registrado", async () => {
    sessionStorage.setItem("sn_signup_email", "ana@gmail.com");
    window.history.pushState({}, "", "/signup?checkout_status=success");
    render(<MemoryRouter><SignupPage /></MemoryRouter>);
    expect(await screen.findByText("Confirma tu correo para entrar.")).toBeTruthy();
    expect(screen.getByText(/tu pago ya está registrado/)).toBeTruthy();
    expect(screen.getByText("ana@gmail.com")).toBeTruthy();
    expect(signUp).not.toHaveBeenCalled();
    window.history.pushState({}, "", "/");
  });

  it("también reconoce la vuelta de Whop sin parámetros (viene de whop.com)", async () => {
    sessionStorage.setItem("sn_signup_email", "ana@gmail.com");
    Object.defineProperty(document, "referrer", { configurable: true, value: "https://whop.com/checkout/plan_ukBjctlEKufto/" });
    render(<MemoryRouter><SignupPage /></MemoryRouter>);
    expect(await screen.findByText("Confirma tu correo para entrar.")).toBeTruthy();
    expect(screen.getByText("ana@gmail.com")).toBeTruthy();
    Object.defineProperty(document, "referrer", { configurable: true, value: "" });
  });

  it("si Supabase falla, vuelve a los datos con el error en español y sin perder lo escrito", async () => {
    signUp.mockResolvedValue({ data: { user: null, session: null }, error: { message: "email rate limit exceeded", code: "over_email_send_rate_limit", status: 429 } });
    render(<MemoryRouter><SignupPage /></MemoryRouter>);
    fill();
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    await answerAll();
    expect(await screen.findByRole("alert")).toHaveTextContent(/registrando mucha gente/);
    expect((screen.getByLabelText("Correo") as HTMLInputElement).value).toBe("ana@gmail.com");
  });

  it("no avanza con datos incompletos y lo dice en pantalla", async () => {
    render(<MemoryRouter><SignupPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Correo"), { target: { value: "ana@gmail.com" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "corta" } });
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/al menos 8 caracteres/);
    expect(signUp).not.toHaveBeenCalled();
  });

  it("propone corregir un correo mal escrito", async () => {
    render(<MemoryRouter><SignupPage /></MemoryRouter>);
    const input = screen.getByLabelText("Correo");
    fireEvent.change(input, { target: { value: "ana@gmial.com" } });
    fireEvent.blur(input);
    fireEvent.click(await screen.findByRole("button", { name: "Sí, corregir" }));
    expect((input as HTMLInputElement).value).toBe("ana@gmail.com");
  });

  it("correo ya registrado → al login", async () => {
    signUp.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null });
    const loc = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...loc, href: "", origin: loc.origin, search: "", replace: vi.fn() } });
    render(<MemoryRouter><SignupPage /></MemoryRouter>);
    fill();
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    await answerAll();
    await waitFor(() => expect(window.location.href).toBe("/auth"));
    Object.defineProperty(window, "location", { configurable: true, value: loc });
  });
});
