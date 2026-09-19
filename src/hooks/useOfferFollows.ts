import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Offer } from "@/lib/offers";
import { CREDIT_COSTS } from "@/hooks/useCredits";

/**
 * Cazador de ROI — seguimiento privado de ofertas.
 * Seguir cobra créditos SERVER-SIDE (RPC follow_offer → consume_credits, atómico);
 * aquí solo reflejamos el resultado. Dejar de seguir es gratis (DELETE con RLS).
 */
export function useOfferFollows() {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const { data } = await supabase.from("offer_follows").select("offer_id");
    setIds(new Set((data ?? []).map((r) => r.offer_id)));
    setLoaded(true);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const follow = useCallback(async (offer: Offer): Promise<boolean> => {
    const { data, error } = await supabase.rpc("follow_offer", { p_offer_id: offer.id });
    const res = (data ?? {}) as { success?: boolean; error?: string; already?: boolean };
    if (error || !res.success) {
      toast.error(res.error || error?.message || "No se pudo seguir la oferta");
      return false;
    }
    setIds((prev) => new Set(prev).add(offer.id));
    if (!res.already) {
      const cost = CREDIT_COSTS.follow_offer;
      toast(`-${cost} ⚡`, { description: `Siguiendo: ${offer.product_name || offer.page_name}`, duration: 2200 });
      window.dispatchEvent(new CustomEvent("supernova_credit_spent", { detail: { cost, action: "follow_offer", label: "Seguir oferta" } }));
    }
    return true;
  }, []);

  const unfollow = useCallback(async (offer: Offer) => {
    const { error } = await supabase.from("offer_follows").delete().eq("offer_id", offer.id);
    if (error) { toast.error("No se pudo dejar de seguir"); return; }
    setIds((prev) => { const n = new Set(prev); n.delete(offer.id); return n; });
    toast("Dejaste de seguir", { description: offer.product_name || offer.page_name || "", duration: 1800 });
  }, []);

  const toggle = useCallback((offer: Offer) => (ids.has(offer.id) ? unfollow(offer) : follow(offer)), [ids, follow, unfollow]);

  return { followingIds: ids, loaded, isFollowing: (id: string) => ids.has(id), follow, unfollow, toggle, refresh };
}
