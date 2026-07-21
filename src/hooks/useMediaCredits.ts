import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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

  const refresh = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) { setLoading(false); return; }

    const { data } = await supabase
      .from("user_media_credits")
      .select("balance")
      .eq("user_id", uid)
      .maybeSingle();

    setBalance(data?.balance ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange(() => refresh());
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  const canAfford = (videos = 1) => balance >= MEDIA_COST_PER_VIDEO * videos;

  return { balance, loading, canAfford, refresh };
}
