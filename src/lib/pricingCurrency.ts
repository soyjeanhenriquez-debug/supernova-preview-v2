import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { currencyForCountry } from "@/lib/pricing";

/**
 * La moneda de la persona según el país que dio al entrar (user_age_country, pantalla
 * AgeCountryGate). Es solo el valor por defecto: la calculadora deja elegir otra y la guarda en
 * el producto (products.pricing.currency). Una consulta por sesión (se guarda en memoria).
 */
const cache = new Map<string, Promise<string>>();

function load(uid: string): Promise<string> {
  let p = cache.get(uid);
  if (!p) {
    p = (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any).from("user_age_country").select("country").eq("user_id", uid).maybeSingle();
        return currencyForCountry(data?.country);
      } catch {
        return "US$";
      }
    })();
    cache.set(uid, p);
  }
  return p;
}

export function useLocalCurrency(): { currency: string; ready: boolean } {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [state, setState] = useState<{ uid: string | null; currency: string; ready: boolean }>({ uid: null, currency: "US$", ready: false });
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    void load(uid).then(currency => { if (alive) setState({ uid, currency, ready: true }); });
    return () => { alive = false; };
  }, [uid]);
  // Sin sesión (pruebas, previsualización): dólares y listo, para no quedarse cargando.
  if (!uid) return { currency: "US$", ready: true };
  return state.uid === uid ? { currency: state.currency, ready: state.ready } : { currency: "US$", ready: false };
}
