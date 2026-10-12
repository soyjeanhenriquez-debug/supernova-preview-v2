import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Turnstile } from "./Turnstile";

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

describe("Turnstile", () => {
  beforeEach(() => { vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "site-key"); delete window.turnstile; document.head.innerHTML = ""; });
  afterEach(() => { vi.unstubAllEnvs(); delete window.turnstile; });

  it("si el guion de Cloudflare no carga, dice qué hacer y deja reintentar (antes: botón gris sin explicación)", async () => {
    const onVerify = vi.fn();
    render(<Turnstile onVerify={onVerify} />);
    const script = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
    expect(script).toBeTruthy();
    await act(async () => { script!.dispatchEvent(new Event("error")); });
    expect(await screen.findByRole("alert")).toHaveTextContent(/bloqueador de anuncios/);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onVerify).toHaveBeenCalledWith("");
    expect(document.querySelector(`script[src="${SRC}"]`)).toBeTruthy();
  });

  it("pide la verificación en español y solo si hace falta tocar algo", async () => {
    const render_ = vi.fn((_el: HTMLElement, opts: { callback: (t: string) => void }) => { opts.callback("tok"); return "w1"; });
    window.turnstile = { render: render_, reset: vi.fn(), remove: vi.fn() };
    const onVerify = vi.fn();
    render(<Turnstile onVerify={onVerify} />);
    await act(async () => { await Promise.resolve(); });
    expect(render_).toHaveBeenCalledTimes(1);
    expect(render_.mock.calls[0][1]).toMatchObject({ sitekey: "site-key", language: "es", appearance: "interaction-only" });
    expect(onVerify).toHaveBeenCalledWith("tok");
    expect(screen.queryByText(/Comprobando/)).toBeNull();
  });
});
