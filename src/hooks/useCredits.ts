import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";


const KEY = "supernova_credits_v2";
const HIST_KEY = "supernova_credits_history_v1";
const MILESTONES_KEY = "supernova_milestones_v1";
const DEFAULT_BALANCE = 1500;
const DEFAULT_LIMIT = 1500;

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

// Costos calibrados: ~3x margen sobre costo real de Claude API
export const CREDIT_COSTS: Record<CreditAction, number> = {
  search_ads: 5,
  analyze_url: 5,
  ai_intel: 15,
  chat_message: 15,
  adaptar: 15,
  sofisticar: 30,
  gen_ad_copies: 30,
  gen_avatar: 30,
  pain_discovery: 30,
  blueprint: 80,
  gen_landing: 80,
  landing_intelligence: 80,
  gen_funnel: 100,
  gen_master_prompt: 100,
};

export const ACTION_LABEL: Record<CreditAction, string> = {
  search_ads: "Búsqueda de anuncios",
  analyze_url: "Analizar URL del Oráculo",
  landing_intelligence: "Oráculo completo (IA)",
  sofisticar: "Sofisticar oferta",
  blueprint: "Blueprint completo",
  adaptar: "Adaptar anuncio al mercado",
  pain_discovery: "Pain Discovery",
  chat_message: "Mensaje Chat IA",
  ai_intel: "Análisis IA del ad",
  gen_landing: "Generar landing page",
  gen_ad_copies: "10 variaciones de ad copy",
  gen_avatar: "Avatar del comprador",
  gen_funnel: "Funnel completo (VSL+emails)",
  gen_master_prompt: "Mega-Prompt Replicador",
};

// Horas de trabajo manual equivalentes por acción (para "valor percibido")
export const ACTION_HOURS: Record<CreditAction, number> = {
  search_ads: 0.5,
  analyze_url: 0.5,
  ai_intel: 1,
  chat_message: 0.25,
  adaptar: 1,
  sofisticar: 2,
  gen_ad_copies: 2,
  gen_avatar: 2,
  pain_discovery: 2,
  blueprint: 4,
  gen_landing: 4,
  landing_intelligence: 4,
  gen_funnel: 8,
  gen_master_prompt: 6,
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

function readMilestones(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(MILESTONES_KEY) || "[]"); }
  catch { return []; }
}

function checkMilestones(prevBalance: number, nextBalance: number, limit: number) {
  const seen = new Set(readMilestones());
  const totalSpentBefore = limit - prevBalance;
  const totalSpentAfter = limit - nextBalance;

  const fire = (key: string, title: string, description?: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    toast(title, { description, duration: 6000 });
  };

  // Hitos por gasto acumulado
  if (totalSpentBefore < 500 && totalSpentAfter >= 500) {
    fire("spent_500", "⚡ 500 créditos bien invertidos", "Eres un usuario activo de SUPERNOVA.");
  }
  if (totalSpentBefore < 1500 && totalSpentAfter >= 1500) {
    fire("spent_1500", "🔥 Has usado la mitad de tus créditos", "Estás aprovechando SUPERNOVA al máximo.");
  }

  // Hitos por saldo restante
  if (prevBalance > 500 && nextBalance <= 500) {
    fire("left_500", "⚡ Te quedan 500 créditos este mes", "Úsalos en lo que más te mueve la aguja.");
  }
  if (prevBalance > 100 && nextBalance <= 100) {
    fire("left_100", "🚨 Últimos 100 créditos del mes", "¿Los usas en un Funnel completo o en 2 Oráculos? Tú decides.");
  }

  localStorage.setItem(MILESTONES_KEY, JSON.stringify(Array.from(seen)));
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
    localStorage.setItem(HIST_KEY, JSON.stringify(nextHist.slice(0, 200)));
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

    // Feedback visual del gasto
    toast(`-${cost} ⚡`, {
      description: ACTION_LABEL[action],
      duration: 1800,
    });
    window.dispatchEvent(new CustomEvent("supernova_credit_spent", { detail: { cost, action, label: ACTION_LABEL[action] } }));

    // Hitos de gamificación
    checkMilestones(cur.balance, next.balance, cur.limit);

    // Espejo a Supabase
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (!uid) return;
      supabase.from("credit_transactions").insert({
        user_id: uid, action, label: ACTION_LABEL[action], cost,
        meta: meta ? { note: meta } : {},
      }).then(() => {});
    });
    return true;
  }, []);


  const canAfford = (action: CreditAction) => state.balance >= CREDIT_COSTS[action];

  const refill = (amount: number) => {
    const cur = read();
    persist({ ...cur, balance: Math.min(cur.limit, cur.balance + amount) }, readHistory());
  };

  return { balance: state.balance, limit: state.limit, history, consume, canAfford, refill };
}
