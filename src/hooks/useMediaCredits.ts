import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Media Credits: pool separado de los créditos de texto (useCredits), porque
 * el costo real de generar video con avatar IA (HeyGen) es órdenes de
 * magnitud mayor. El balance solo se mueve server-side (consume_media_credits
 * / grant_media_credits, ambas SECURITY DEFINER restringidas a service_role)
 * — este hook es de solo lectura del saldo.
 */
export const MEDIA_COST_PER_VIDEO = 10; // debe calzar con COST_MEDIA_CREDITS en heygen-generate-video

export function useMediaCredits() {
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  // El id sale de la sesión que ya tiene la app (sin viaje a /auth/v1/user). Antes este hook pedía
  // getUser() y volvía a leer en CADA aviso de sesión (cada vuelta a la pestaña, cada renovación del
  // token): 95 llamadas a /auth/v1/user en 24 h (12-oct-2026). La seguridad no cambia: el saldo lo
  // filtra RLS en el servidor, el id solo arma la consulta.
  const { user } = useAuth();
  const uid = user?.id ?? null;

  const refresh = useCallback(async () => {
    if (!uid) { setLoading(false); return; }

    const { data } = await supabase
      .from("user_media_credits")
      .select("balance")
      .eq("user_id", uid)
      .maybeSingle();

    setBalance(data?.balance ?? 0);
    setLoading(false);
  }, [uid]);

  // Se relee solo si cambia el usuario (entrar/salir), no en cada aviso de sesión.
  useEffect(() => { void refresh(); }, [refresh]);

  const canAfford = (videos = 1) => balance >= MEDIA_COST_PER_VIDEO * videos;

  return { balance, loading, canAfford, refresh };
}
