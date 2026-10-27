import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

/** Sesión guardada fuera del repo: nunca se sube ni se imprime. */
export const SESION = join(process.env.HOME ?? ".", ".supernova-e2e", "sesion.json");

function llavePublica(): string {
  if (process.env.VITE_SUPABASE_PUBLISHABLE_KEY) return process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  // El proyecto es ESM: no hay __dirname (27-oct-2026: por eso fallaban todas las pruebas antes de probar nada).
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const m = env.match(/^VITE_SUPABASE_PUBLISHABLE_KEY=["']?([^"'\n]+)/m);
  if (!m) throw new Error("Falta VITE_SUPABASE_PUBLISHABLE_KEY en .env");
  return m[1];
}
const URL_DB = "https://krfdoofwhtcxbyhkjoik.supabase.co";

/** Anota el resultado en el Guardián con la sesión que ya tiene la página (admin). */
export async function anotar(page: Page, paso: string, ok: boolean, ms: number, resumen: string, recorrido?: { journey: string; step: number }) {
  const apikey = llavePublica();
  const r = await page.evaluate(async ({ apikey, URL_DB, body }) => {
    const k = Object.keys(localStorage).find(x => /^sb-.*-auth-token$/.test(x));
    const token = k ? JSON.parse(localStorage.getItem(k) ?? "{}")?.access_token : null;
    if (!token) return "sin sesión";
    const res = await fetch(`${URL_DB}/rest/v1/rpc/guardian_log_e2e`, {
      method: "POST", headers: { apikey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return res.ok ? "ok" : `${res.status}`;
  }, { apikey, URL_DB, body: { p_step: paso, p_ok: ok, p_ms: Math.round(ms), p_summary: resumen.slice(0, 480), p_journey: recorrido?.journey ?? null, p_journey_step: recorrido?.step ?? null } });
  if (r !== "ok") console.warn(`No se pudo anotar «${paso}» en el Guardián: ${r}`);
}

/** Corre un paso, mide, anota y deja que la prueba falle si falló. */
export async function paso<T>(page: Page, nombre: string, fn: () => Promise<T>, recorrido?: { journey: string; step: number }, resumenOk = "Funcionó."): Promise<T> {
  const t0 = Date.now();
  try {
    const out = await fn();
    await anotar(page, nombre, true, Date.now() - t0, typeof out === "string" ? out : resumenOk, recorrido);
    return out;
  } catch (e) {
    await anotar(page, nombre, false, Date.now() - t0, e instanceof Error ? e.message.split("\n")[0] : "falló", recorrido).catch(() => undefined);
    throw e;
  }
}

/** La pantalla no se cayó (ErrorBoundary). */
export async function sinPantallazo(page: Page) {
  const caida = page.getByText(/Esta pantalla tuvo un problema/);
  if (await caida.count()) throw new Error("La pantalla mostró «Esta pantalla tuvo un problema».");
}
