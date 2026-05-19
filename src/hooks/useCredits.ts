import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";


const KEY = "supernova_credits_v2";
const HIST_KEY = "supernova_credits_history_v1";
const DEFAULT_BALANCE = 3000;
const DEFAULT_LIMIT = 3000;

export type CreditAction =
  | "search_ads"
  | "analyze_url"
  | "landing_intelligence"
  | "sofisticar"
  | "blueprint"
  | "adaptar"
  | "pain_discovery"
  | "chat_message"
  | "ai_intel"
  | "gen_landing"
  | "gen_ad_copies"
  | "gen_avatar"
  | "gen_funnel"
  | "gen_master_prompt";

export const CREDIT_COSTS: Record<CreditAction, number> = {
  search_ads: 1,
  analyze_url: 1,
  landing_intelligence: 5,
  sofisticar: 2,
  blueprint: 3,
  adaptar: 1,
  pain_discovery: 2,
  chat_message: 1,
  ai_intel: 1,
  gen_landing: 3,
  gen_ad_copies: 2,
  gen_avatar: 2,
  gen_funnel: 5,
  gen_master_prompt: 4,
};

export const ACTION_LABEL: Record<CreditAction, string> = {
  search_ads: "Búsqueda de anuncios",
  analyze_url: "Analizar URL",
  landing_intelligence: "Intelligence Analyzer (landing)",
  sofisticar: "Sofisticar oferta",
  blueprint: "Blueprint completo",
  adaptar: "Adaptar al mercado",
  pain_discovery: "Pain Discovery",
  chat_message: "Mensaje Chat IA",
  ai_intel: "Análisis IA del ad",
  gen_landing: "Generar landing page",
  gen_ad_copies: "10 variaciones de ad copy",
  gen_avatar: "Avatar del comprador",
  gen_funnel: "Funnel completo (VSL+emails)",
  gen_master_prompt: "Mega-Prompt Replicador",
};

export interface CreditHistoryEntry {
  date: string;
  action: CreditAction;
  label: string;
  cost: number;
  meta?: string;
}

interface State { balance: number; limit: number; }

function read(): State {
  if (typeof window === "undefined") return { balance: DEFAULT_BALANCE, limit: DEFAULT_LIMIT };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { balance: DEFAULT_BALANCE, limit: DEFAULT_LIMIT };
    return JSON.parse(raw);
  } catch { return { balance: DEFAULT_BALANCE, limit: DEFAULT_LIMIT }; }
}

function readHistory(): CreditHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(HIST_KEY) || "[]"); }
  catch { return []; }
}

export function useCredits() {
  const [state, setState] = useState<State>(read);
  const [history, setHistory] = useState<CreditHistoryEntry[]>(readHistory);

  useEffect(() => {
    const sync = () => { setState(read()); setHistory(readHistory()); };
    window.addEventListener("storage", sync);
    window.addEventListener("supernova_credits_changed", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("supernova_credits_changed", sync);
    };
  }, []);

  const persist = (next: State, nextHist: CreditHistoryEntry[]) => {
    localStorage.setItem(KEY, JSON.stringify(next));
    localStorage.setItem(HIST_KEY, JSON.stringify(nextHist.slice(0, 50)));
    setState(next); setHistory(nextHist);
    window.dispatchEvent(new Event("supernova_credits_changed"));
  };

  const consume = useCallback((action: CreditAction, meta?: string): boolean => {
    const cost = CREDIT_COSTS[action];
    const cur = read();
    if (cur.balance < cost) return false;
    const next = { ...cur, balance: cur.balance - cost };
    const entry: CreditHistoryEntry = {
      date: new Date().toISOString(),
      action, label: ACTION_LABEL[action], cost, meta,
    };
    persist(next, [entry, ...readHistory()]);
    // Mirror to Supabase for admin analytics (fire-and-forget)
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (!uid) return;
      supabase.from("credit_transactions").insert({
        user_id: uid, action, label: ACTION_LABEL[action], cost,
        meta: meta ? { note: meta } : {},
      }).then(() => {});
    });
    return true;

  const canAfford = (action: CreditAction) => state.balance >= CREDIT_COSTS[action];

  const refill = (amount: number) => {
    const cur = read();
    persist({ ...cur, balance: Math.min(cur.limit, cur.balance + amount) }, readHistory());
  };

  return { balance: state.balance, limit: state.limit, history, consume, canAfford, refill };
}
