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

interface State {
  monthly: number;      // saldo del ciclo mensual (gratis)
  purchased: number;    // créditos comprados (no expiran)
  cycleStart: string;   // ISO date — inicio del ciclo de 30 días
  limit: number;        // tope mensual (1500)
}

const CYCLE_MS = 30 * 24 * 60 * 60 * 1000;

function freshCycle(): State {
  return {
    monthly: DEFAULT_BALANCE,
    purchased: 0,
    cycleStart: new Date().toISOString(),
    limit: DEFAULT_LIMIT,
  };
}

function maybeRenew(s: State): { state: State; renewed: boolean } {
  const start = new Date(s.cycleStart).getTime();
  if (isNaN(start) || Date.now() - start >= CYCLE_MS) {
    // Renovación: monthly vuelve a 1500. Purchased se conserva.
    if (typeof window !== "undefined") {
      // Reiniciar hitos del ciclo nuevo
      localStorage.removeItem(MILESTONES_KEY);
    }
    return {
      state: { ...s, monthly: DEFAULT_BALANCE, limit: DEFAULT_LIMIT, cycleStart: new Date().toISOString() },
      renewed: true,
    };
  }
  return { state: s, renewed: false };
}

function read(): State {
  if (typeof window === "undefined") return freshCycle();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const s = freshCycle();
      localStorage.setItem(KEY, JSON.stringify(s));
      return s;
    }
    const parsed = JSON.parse(raw);
    let s: State;
    if (typeof parsed.monthly === "number" && typeof parsed.cycleStart === "string") {
      s = {
        monthly: parsed.monthly,
        purchased: typeof parsed.purchased === "number" ? parsed.purchased : 0,
        cycleStart: parsed.cycleStart,
        limit: DEFAULT_LIMIT,
      };
    } else {
      // Migración del esquema anterior {balance, limit}
      const prevBalance = typeof parsed.balance === "number" ? parsed.balance : DEFAULT_BALANCE;
      s = {
        monthly: Math.min(DEFAULT_BALANCE, prevBalance),
        purchased: Math.max(0, prevBalance - DEFAULT_BALANCE),
        cycleStart: new Date().toISOString(),
        limit: DEFAULT_LIMIT,
      };
    }
    const { state: renewed, renewed: didRenew } = maybeRenew(s);
    if (didRenew) localStorage.setItem(KEY, JSON.stringify(renewed));
    return renewed;
  } catch {
    return freshCycle();
  }
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

  if (totalSpentBefore < 500 && totalSpentAfter >= 500) {
    fire("spent_500", "⚡ 500 créditos bien invertidos", "Eres un usuario activo de SUPERNOVA.");
  }
  if (totalSpentBefore < 1500 && totalSpentAfter >= 1500) {
    fire("spent_1500", "🔥 Has usado la mitad de tus créditos", "Estás aprovechando SUPERNOVA al máximo.");
  }
  if (prevBalance > 500 && nextBalance <= 500) {
    fire("left_500", "⚡ Te quedan 500 créditos este mes", "Úsalos en lo que más te mueve la aguja.");
  }
  if (prevBalance > 100 && nextBalance <= 100) {
    fire("left_100", "🚨 Últimos 100 créditos del mes", "¿Los usas en un Funnel completo o en 2 Oráculos? Tú decides.");
  }

  localStorage.setItem(MILESTONES_KEY, JSON.stringify(Array.from(seen)));
}

function totalBalance(s: State) { return s.monthly + s.purchased; }

function renewalDate(s: State): Date {
  return new Date(new Date(s.cycleStart).getTime() + CYCLE_MS);
}

export function useCredits() {
  const [state, setState] = useState<State>(read);
  const [history, setHistory] = useState<CreditHistoryEntry[]>(readHistory);

  useEffect(() => {
    const sync = () => { setState(read()); setHistory(readHistory()); };
    window.addEventListener("storage", sync);
    window.addEventListener("supernova_credits_changed", sync);
    // Chequeo periódico de renovación (cada 60s)
    const interval = window.setInterval(() => {
      const before = state;
      const fresh = read();
      if (fresh.cycleStart !== before.cycleStart) {
        toast("✨ Créditos mensuales renovados", { description: `+${DEFAULT_BALANCE} créditos disponibles este mes.` });
        setState(fresh);
      }
    }, 60000);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("supernova_credits_changed", sync);
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const total = totalBalance(cur);
    if (total < cost) return false;

    // Gastar primero del saldo mensual; el excedente, de los comprados.
    let remaining = cost;
    const useMonthly = Math.min(cur.monthly, remaining);
    remaining -= useMonthly;
    const usePurchased = remaining;
    const next: State = {
      ...cur,
      monthly: cur.monthly - useMonthly,
      purchased: cur.purchased - usePurchased,
    };

    const entry: CreditHistoryEntry = {
      date: new Date().toISOString(),
      action, label: ACTION_LABEL[action], cost, meta,
    };
    persist(next, [entry, ...readHistory()]);

    toast(`-${cost} ⚡`, { description: ACTION_LABEL[action], duration: 1800 });
    window.dispatchEvent(new CustomEvent("supernova_credit_spent", { detail: { cost, action, label: ACTION_LABEL[action] } }));

    checkMilestones(total, totalBalance(next), cur.limit);

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

  const canAfford = (action: CreditAction) => totalBalance(state) >= CREDIT_COSTS[action];

  // Las recargas se suman a "purchased" (no expiran, no se topan al límite mensual)
  const refill = (amount: number) => {
    const cur = read();
    persist({ ...cur, purchased: cur.purchased + amount }, readHistory());
  };

  return {
    balance: totalBalance(state),
    monthly: state.monthly,
    purchased: state.purchased,
    limit: state.limit,
    renewalDate: renewalDate(state),
    history,
    consume,
    canAfford,
    refill,
  };
}

