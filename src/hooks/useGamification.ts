import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { XP_BY_ACTION, STREAK_MILESTONES, levelOf } from "@/lib/gamification";
import type { CreditAction } from "@/hooks/useCredits";

export interface GamificationState {
  xp: number;
  level: number;
  streak: number;
  lastLoginDate: string | null;
  badges: string[];
  loading: boolean;
}

const initial: GamificationState = { xp: 0, level: 1, streak: 0, lastLoginDate: null, badges: [], loading: true };

export function useGamification() {
  const [state, setState] = useState<GamificationState>(initial);
  const [levelUpTo, setLevelUpTo] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setState(s => ({ ...s, loading: false })); return; }
    const { data } = await supabase.from("user_gamification")
      .select("xp,level,streak_days,last_login_date,badges")
      .eq("user_id", auth.user.id).maybeSingle();
    if (data) {
      setState({
        xp: data.xp, level: data.level, streak: data.streak_days,
        lastLoginDate: data.last_login_date, badges: data.badges ?? [], loading: false,
      });
    } else {
      setState(s => ({ ...s, loading: false }));
    }
  }, []);

  // Initial load + register login
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { setState(s => ({ ...s, loading: false })); return; }
      const { data: login } = await supabase.rpc("register_daily_login");
      const result = login as any;
      if (result?.milestone && STREAK_MILESTONES[result.milestone]) {
        setTimeout(() => toast(STREAK_MILESTONES[result.milestone], { duration: 6000 }), 1200);
      }
      if (result?.broke) {
        setTimeout(() => toast("Rompiste tu racha. Hoy empieza una nueva.", { duration: 5000 }), 1200);
      }
      if (mounted) refresh();
    })();
    return () => { mounted = false; };
  }, [refresh]);

  const addXP = useCallback(async (amount: number) => {
    if (amount <= 0) return;
    const prevLevel = state.level;
    const { data } = await supabase.rpc("add_xp", { p_amount: amount });
    const result = data as any;
    if (result && !result.error) {
      const newLevel = result.level;
      setState(s => ({ ...s, xp: result.xp, level: newLevel, badges: result.badges ?? s.badges }));
      if (result.leveled_up && newLevel > prevLevel) {
        setLevelUpTo(newLevel);
      }
    }
  }, [state.level]);

  const unlockBadge = useCallback(async (badge: string) => {
    if (state.badges.includes(badge)) return;
    const { data } = await supabase.rpc("unlock_badge", { p_badge: badge });
    const result = data as any;
    if (result?.new) {
      setState(s => ({ ...s, badges: result.badges }));
    }
  }, [state.badges]);

  // Listen to credit-spend events to auto-add XP
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action: CreditAction };
      const xp = XP_BY_ACTION[detail.action];
      if (xp) addXP(xp);
      // auto-unlock badges
      if (detail.action === "search_ads") unlockBadge("first_search");
      if (detail.action === "sofisticar") unlockBadge("first_offer");
      if (detail.action === "gen_funnel") unlockBadge("first_funnel");
    };
    window.addEventListener("supernova_credit_spent", handler);
    return () => window.removeEventListener("supernova_credit_spent", handler);
  }, [addXP, unlockBadge]);

  const dismissLevelUp = useCallback(() => setLevelUpTo(null), []);

  const cur = levelOf(state.xp);
  return { ...state, addXP, unlockBadge, refresh, levelUpTo, dismissLevelUp, currentLevel: cur };
}
