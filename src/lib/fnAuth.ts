import { supabase } from "@/integrations/supabase/client";

/**
 * Cabeceras para llamar edge functions con `fetch` directo (las que hacen
 * streaming; `supabase.functions.invoke` ya manda la sesión por su cuenta).
 *
 * Las funciones exigen la sesión del USUARIO: la llave pública del bundle es
 * un JWT válido para el gateway, así que el servidor ya no la acepta sola
 * (cualquiera podía extraerla y usar la IA sin cuenta ni créditos).
 */
export async function fnHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    "Content-Type": "application/json",
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Mensaje de error de una edge function que respondió mal. Las funciones
 * devuelven `{ error }` en español (sesión vencida, sin acceso, límite de uso):
 * mostrarlo es más útil que un "Error de IA" genérico.
 */
export async function fnErrorMessage(resp: Response, fallback: string): Promise<string> {
  try {
    const data = await resp.clone().json();
    if (typeof data?.error === "string" && data.error.trim()) return data.error;
  } catch { /* cuerpo no-JSON (stream cortado, HTML de un proxy…) */ }
  return fallback;
}

/** Lo que el servidor cobró por una llamada (los créditos se cobran allá, no aquí). */
export interface ServerBilling { charged: number; balance: number | null; receipt: string | null }

/** Lee el cobro de las cabeceras de la respuesta (sirve también para streams). */
export function readBilling(resp: Response): ServerBilling {
  const bal = resp.headers.get("x-credits-balance");
  return {
    charged: Number(resp.headers.get("x-credits-charged")) || 0,
    balance: bal !== null && bal !== "" && Number.isFinite(Number(bal)) ? Number(bal) : null,
    receipt: resp.headers.get("x-credit-receipt"),
  };
}

/**
 * `supabase.functions.invoke` esconde el cuerpo cuando la función responde con
 * error: deja un mensaje genérico y el Response real en `error.context`.
 * Esto recupera el `{ error }` en español que mandó la función.
 */
export async function invokeErrorMessage(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: unknown } | null)?.context;
  if (ctx instanceof Response) return fnErrorMessage(ctx, fallback);
  const msg = (error as { message?: unknown } | null)?.message;
  return typeof msg === "string" && msg && !/non-2xx/i.test(msg) ? msg : fallback;
}
