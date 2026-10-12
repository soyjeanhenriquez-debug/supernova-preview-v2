import { useEffect, useId, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          theme?: "dark" | "light" | "auto";
          language?: string;
          appearance?: "always" | "execute" | "interaction-only";
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          "timeout-callback"?: () => void;
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";
/** Si en este tiempo no hay token, se le dice a la persona qué hacer (sin bloquearla más). */
export const TURNSTILE_SLOW_MS = 10_000;

let scriptPromise: Promise<void> | null = null;
function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve());
    // Un bloqueador de anuncios o una red que corta Cloudflare: antes la promesa nunca terminaba y el
    // botón se quedaba gris para siempre, sin explicación.
    script.addEventListener("error", () => { scriptPromise = null; script.remove(); reject(new Error("turnstile_script")); });
    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
  return scriptPromise;
}

type State = "loading" | "waiting" | "ok" | "error" | "slow";

/**
 * Verificación de Cloudflare Turnstile (la pide Supabase para registrarse, entrar y pedir códigos).
 * Llama onVerify(token) cuando pasa; onVerify("") si caduca o falla.
 *
 * R2-19 (12-oct-2026), "que no bloquee de más":
 *  · Solo se ve si Cloudflare necesita que la persona toque algo (appearance "interaction-only");
 *    casi siempre pasa sola y la persona no ve ninguna casilla.
 *  · En español.
 *  · Si no carga (bloqueador de anuncios, red) o tarda, dice qué hacer y deja reintentar, en vez de
 *    dejar el botón gris sin explicación.
 * Se reinicia si `resetKey` cambia (ej. tras un error de envío: cada token sirve una sola vez).
 */
export function Turnstile({
  onVerify,
  resetKey,
}: {
  onVerify: (token: string) => void;
  resetKey?: unknown;
}) {
  const id = useId();
  const widgetIdRef = useRef<string | null>(null);
  const onVerifyRef = useRef(onVerify);
  onVerifyRef.current = onVerify;
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
  const [state, setState] = useState<State>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    setState("loading");
    const slow = window.setTimeout(() => {
      if (!cancelled) setState((s) => (s === "ok" ? s : "slow"));
    }, TURNSTILE_SLOW_MS);

    loadTurnstileScript().then(() => {
      if (cancelled) return;
      const el = document.getElementById(id);
      if (!el || !window.turnstile) { setState("error"); return; }
      setState("waiting");
      try {
        widgetIdRef.current = window.turnstile.render(el, {
          sitekey: siteKey,
          theme: "dark",
          language: "es",
          appearance: "interaction-only",
          callback: (token) => { setState("ok"); onVerifyRef.current(token); },
          "expired-callback": () => { setState("waiting"); onVerifyRef.current(""); },
          "error-callback": () => { setState("error"); onVerifyRef.current(""); },
          "timeout-callback": () => { setState("slow"); onVerifyRef.current(""); },
        });
      } catch {
        setState("error");
      }
    }, () => { if (!cancelled) setState("error"); });

    return () => {
      cancelled = true;
      window.clearTimeout(slow);
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch { /* ya no está */ }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, id, attempt]);

  useEffect(() => {
    if (widgetIdRef.current && window.turnstile) {
      try { window.turnstile.reset(widgetIdRef.current); } catch { /* nada */ }
      setState("waiting");
    }
  }, [resetKey]);

  if (!siteKey) return null;
  const retry = () => { onVerifyRef.current(""); setAttempt((a) => a + 1); };

  return (
    <div className="flex flex-col items-center gap-1.5" aria-live="polite">
      <div id={id} className="flex justify-center empty:hidden" />
      {(state === "loading" || state === "waiting") && (
        <p className="text-[11px] text-muted-foreground opacity-80">Comprobando que eres una persona…</p>
      )}
      {(state === "error" || state === "slow") && (
        <div role="alert" className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-center text-[12px] leading-relaxed text-muted-foreground">
          {state === "error"
            ? "No pudimos cargar la verificación de seguridad. Revisa tu internet o desactiva el bloqueador de anuncios en esta página."
            : "La verificación está tardando. Si ves una casilla, márcala; si no, toca Reintentar."}{" "}
          <button type="button" onClick={retry} className="font-semibold text-primary underline-offset-2 hover:underline">
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
}
