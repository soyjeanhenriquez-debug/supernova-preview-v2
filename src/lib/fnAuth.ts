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
