import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const HIST_KEY = "supernova_credits_history_v1";
const MILESTONES_KEY = "supernova_milestones_v1";
const DEFAULT_BALANCE = 2000;
const DEFAULT_LIMIT = 2000;

export type CreditAction =
  | "search_ads" | "analyze_url" | "landing_intelligence" | "sofisticar"
  | "blueprint" | "adaptar" | "pain_discovery" | "chat_message" | "ai_intel"
  | "gen_landing" | "gen_ad_copies" | "gen_avatar" | "gen_funnel"
  | "gen_master_prompt" | "pillar_assist" | "gen_light" | "gen_medium" | "gen_heavy";

export const CREDIT_COSTS: Record<CreditAction, number> = {
  search_ads: 10, analyze_url: 10, chat_message: 10, adaptar: 10, ai_intel: 10,
  pillar_assist: 15, sofisticar: 30, gen_ad_copies: 30, gen_avatar: 30,
  pain_discovery: 30, blueprint: 80, gen_landing: 80, landing_intelligence: 80,
  gen_funnel: 100, gen_master_prompt: 100, gen_light: 30, gen_medium: 60, gen_heavy: 150,
};

export const ACTION_LABEL: Record<CreditAction, string> = {
  search_ads: "JARVIS — Búsqueda de anuncios", analyze_url: "JARVIS — Analizar URL básico",
  landing_intelligence: "JARVIS — Análisis Oráculo", sofisticar: "JARVIS — Sofisticar oferta",
  blueprint: "JARVIS — Blueprint completo", adaptar: "JARVIS — Adaptar anuncio al mercado",
  pain_discovery: "JARVIS — Pain Discovery", chat_message: "JARVIS — Consulta estratégica",
  ai_intel: "JARVIS — Análisis del ad", gen_landing: "JARVIS — Generar landing page",
  gen_ad_copies: "JARVIS — 10 variaciones de ad copy", gen_avatar: "JARVIS — Avatar del comprador",
  gen_funnel: "JARVIS — Funnel completo VSL+emails", gen_master_prompt: "JARVIS — Mega-Prompt Replicador",
  pillar_assist: "JARVIS — Asistente de Pilar", gen_light: "JARVIS — Generador",
  gen_medium: "JARVIS — Generador", gen_heavy: "JARVIS — Generador",
};

const GEN_LIGHT_IDS = new Set(["captions-ig","yt-titles","hooks-meta","hooks-tiktok","reels-script","dm-script","whatsapp-sequence"]);
const GEN_MEDIUM_IDS = new Set(["landing-copy","email-launch","email-sequence","yt-script","funnel-strategy","audience-research","product-desc","offer-stack"]);
const GEN_HEAVY_IDS = new Set(["vsl-downsell","vsl-upsell-1","vsl-upsell-2"]);

export function generatorCost(id: string): { action: CreditAction; cost: number } {
  if (GEN_HEAVY_IDS.has(id)) return { action: "gen_heavy", cost: 150 };
  if (GEN_MEDIUM_IDS.has(id)) return { action: "gen_medium", cost: 60 };
  return { action: "gen_light", cost: 30 };
}

export const ACTION_HOURS: Record<CreditAction, number> = {
  search_ads: 0.5, analyze_url: 0.5, ai_intel: 1, chat_message: 0.25, adaptar: 1,
  pillar_assist: 1, sofisticar: 2, gen_ad_copies: 2, gen_avatar: 2, pain_discovery: 2,
  blueprint: 4, gen_landing: 4, landing_intelligence: 4, gen_funnel: 8,
  gen_master_prompt: 6, gen_light: 1, gen_medium: 3, gen_heavy: 6,
};

export interface CreditHistoryEntry {
  date: string; action: CreditAction; label: string; cost: number; meta?: string;
}

function readHistory(): CreditHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(HIST_KEY) || "[]"); } catch { return []; }
}

function readMilestones(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(MILESTONES_KEY) || "[]"); } catch { return []; }
}

function checkMilestones(prevBalance: number, nextBalance: number, limit: number) {
  const seen = new Set(readMilestones());
  const fire = (key: string, title: string, description?: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    toast(title, { description, duration: 6000 });
  };
  const spentBefore = limit - prevBalance, spentAfter = limit - nextBalance;
  if (spentBefore < 500 && spentAfter >= 500) fire("spent_500", "⚡ 500 créditos bien invertidos");
  if (spentBefore < 1500 && spentAfter >= 1500) fire("spent_1500", "🔥 Has usado la mitad de tus créditos");
  if (prevBalance > 500 && nextBalance <= 500) fire("left_500", "⚡ Te quedan 500 créditos");
  if (prevBalance > 100 && nextBalance <= 100) fire("left_100", "🚨 Últimos 100 créditos");
  localStorage.setItem(MILESTONES_KEY, JSON.stringify(Array.from(seen)));
}

export function useCredits() {
  const [balance, setBalance] = useState<number>(DEFAULT_BALANCE);
  const [renewalDate, setRenewalDate] = useState<Date>(() => new Date(Date.now() + 30 * 86400000));
  const [history, setHistory] = useState<CreditHistoryEntry[]>(readHistory);
  const userIdRef = useRef<string | null>(null);

  const refreshFromDB = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    userIdRef.current = uid;

    // Otorgar mensual si toca (idempotente)
    await supabase.rpc("grant_monthly_if_due").then(({ data }) => {
      if ((data as any)?.granted) {
        toast("✨ Créditos mensuales renovados", { description: `+${DEFAULT_BALANCE} créditos disponibles` });
      }
    });

    const { data: row } = await supabase
      .from("user_credits")
      .select("balance, last_grant_at")
      .eq("user_id", uid)
      .maybeSingle();

    if (row) {
      setBalance(row.balance);
      const last = new Date(row.last_grant_at);
      setRenewalDate(new Date(last.getTime() + 30 * 86400000));
    }

    // Hidratar history desde credit_transactions (últimas 200)
    const { data: txs } = await supabase
      .from("credit_transactions")
      .select("created_at, action, label, cost, meta")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(200);

    if (txs) {
      const mapped: CreditHistoryEntry[] = txs.map(t => ({
        date: t.created_at,
        action: t.action as CreditAction,
        label: t.label || ACTION_LABEL[t.action as CreditAction] || t.action,
        cost: t.cost,
        meta: (t.meta as any)?.note,
      }));
      setHistory(mapped);
      localStorage.setItem(HIST_KEY, JSON.stringify(mapped));
    }
  }, []);

  useEffect(() => {
    refreshFromDB();
    const { data: sub } = supabase.auth.onAuthStateChange(() => refreshFromDB());
    const iv = window.setInterval(refreshFromDB, 60_000);
    return () => { sub.subscription.unsubscribe(); window.clearInterval(iv); };
  }, [refreshFromDB]);

  const consume = useCallback((action: CreditAction, meta?: string): boolean => {
    const cost = CREDIT_COSTS[action];
    if (balance < cost) return false;

    // Optimistic UI
    const prev = balance;
    const next = balance - cost;
    setBalance(next);
    const entry: CreditHistoryEntry = {
      date: new Date().toISOString(), action, label: ACTION_LABEL[action], cost, meta,
    };
    setHistory(h => [entry, ...h].slice(0, 200));
    toast(`-${cost} ⚡`, { description: ACTION_LABEL[action], duration: 1800 });
    window.dispatchEvent(new CustomEvent("supernova_credit_spent", { detail: { cost, action, label: ACTION_LABEL[action] } }));
    checkMilestones(prev, next, DEFAULT_LIMIT);

    // Persistir en DB de forma atómica
    supabase.rpc("consume_credits", {
      p_amount: cost,
      p_action: action,
      p_label: ACTION_LABEL[action],
      p_meta: meta ? { note: meta } : {},
    }).then(({ data, error }) => {
      const result = data as any;
      if (error || !result?.success) {
        // Rollback si falla
        setBalance(prev);
        toast.error(result?.error || "No se pudo consumir créditos");
      } else if (typeof result.balance === "number") {
        setBalance(result.balance);
      }
    });
    return true;
  }, [balance]);

  const canAfford = (action: CreditAction) => balance >= CREDIT_COSTS[action];

  const refill = useCallback(async (amount: number) => {
    const uid = userIdRef.current;
    if (!uid) return;
    // Self-refill solo via admin RPC en su propio usuario no permitido; usar UPDATE directo (RLS uc_admin_all)
    // o desde la página de packs vía edge function. Para mantener compat: hacemos UPDATE optimista + refresh.
    const next = balance + amount;
    setBalance(next);
    await supabase.from("user_credits")
      .update({ balance: next })
      .eq("user_id", uid);
    refreshFromDB();
  }, [balance, refreshFromDB]);

  return {
    balance,
    monthly: Math.min(balance, DEFAULT_BALANCE),
    purchased: Math.max(0, balance - DEFAULT_BALANCE),
    limit: DEFAULT_LIMIT,
    renewalDate,
    history,
    consume,
    canAfford,
    refill,
  };
}
