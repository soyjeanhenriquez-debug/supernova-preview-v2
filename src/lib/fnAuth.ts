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
