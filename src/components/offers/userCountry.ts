import { supabase } from "@/integrations/supabase/client";

/**
 * País que la persona dio al entrar (pantalla AgeCountryGate → tabla user_age_country, código ISO de 2
 * letras: DO, CO, MX…). Ofertas y "Hacer mi versión" lo usan para no preguntar lo que la app ya sabe
 * (manual §3). Una sola consulta por sesión: la comparten todas las pantallas.
 */
let cached: Promise<string | null> | null = null;

export function getUserCountry(): Promise<string | null> {
  if (!cached) {
    cached = (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any).from("user_age_country").select("country").eq("user_id", user.id).maybeSingle();
        const c = String(data?.country ?? "").trim().toUpperCase();
        return /^[A-Z]{2}$/.test(c) ? c : null;
      } catch { return null; }
    })();
    // Sin sesión todavía o error: que la próxima pantalla lo vuelva a intentar.
    void cached.then((c) => { if (!c) cached = null; });
  }
  return cached;
}
