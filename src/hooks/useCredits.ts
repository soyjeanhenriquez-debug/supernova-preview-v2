import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";


const KEY = "supernova_credits_v3";
const HIST_KEY = "supernova_credits_history_v1";
const MILESTONES_KEY = "supernova_milestones_v1";
const SIGNUP_KEY = "supernova_signup_at";
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
  | "gen_master_prompt"
  | "pillar_assist";

// Costos calibrados: ~3x margen sobre costo real de Claude API
export const CREDIT_COSTS: Record<CreditAction, number> = {
  search_ads: 5,
  analyze_url: 5,
  ai_intel: 15,
  chat_message: 15,
  adaptar: 15,
  pillar_assist: 15,
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
  pillar_assist: "Asistente IA de Pilar",
};

export const ACTION_HOURS: Record<CreditAction, number> = {
  search_ads: 0.5,
  analyze_url: 0.5,
  ai_intel: 1,
  chat_message: 0.25,
  adaptar: 1,
  pillar_assist: 1,
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

/**
 * Lógica estilo Lovable:
 * - El usuario recibe DEFAULT_BALANCE créditos mensuales al iniciar su cuenta.
 * - Los créditos mensuales NO se acumulan: cada nuevo ciclo se resetean a DEFAULT_BALANCE.
 * - Los créditos COMPRADOS no expiran y se suman al balance disponible.
 * - Al gastar: se descuenta primero del mensual, y el excedente del comprado.
 * - Un ciclo dura 30 días contados desde la fecha de registro (signup) del usuario.
 *   La renovación ocurre EXACTAMENTE cuando se cruza un múltiplo de 30 días desde signup,
 *   no en cada llamada ni a cada momento.
 */
interface State {
  monthly: number;        // saldo del ciclo actual
  purchased: number;      // créditos comprados acumulados (no expiran)
  cycleIndex: number;     // # del ciclo actual desde signup (0,1,2,...)
  signupAt: string;       // ISO date — anclaje fijo del usuario
  limit: number;          // tope mensual
}

const CYCLE_MS = 30 * 24 * 60 * 60 * 1000;

function getSignupAt(): string {
  if (typeof window === "undefined") return new Date().toISOString();
  const cached = localStorage.getItem(SIGNUP_KEY);
  if (cached) return cached;
  const fallback = new Date().toISOString();
  localStorage.setItem(SIGNUP_KEY, fallback);
  return fallback;
}

function setSignupAt(iso: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SIGNUP_KEY, iso);
}

function currentCycleIndex(signupISO: string): number {
  const start = new Date(signupISO).getTime();
  if (isNaN(start)) return 0;
  const diff = Date.now() - start;
  if (diff <= 0) return 0;
  return Math.floor(diff / CYCLE_MS);
}

function cycleEndDate(signupISO: string, cycleIndex: number): Date {
  const start = new Date(signupISO).getTime();
  return new Date(start + (cycleIndex + 1) * CYCLE_MS);
}

function freshState(signupAt: string): State {
  return {
    monthly: DEFAULT_BALANCE,
    purchased: 0,
    cycleIndex: currentCycleIndex(signupAt),
    signupAt,
    limit: DEFAULT_LIMIT,
  };
}

function read(): State {
  if (typeof window === "undefined") {
    return freshState(new Date().toISOString());
  }
  const signupAt = getSignupAt();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      // Posible migración desde esquemas anteriores (v1/v2)
      const legacy = localStorage.getItem("supernova_credits_v2") || localStorage.getItem("supernova_credits_v1");
      let monthly = DEFAULT_BALANCE;
      let purchased = 0;
      if (legacy) {
        try {
          const p = JSON.parse(legacy);
          if (typeof p.monthly === "number") {
            monthly = Math.min(DEFAULT_BALANCE, p.monthly);
            purchased = typeof p.purchased === "number" ? p.purchased : 0;
          } else if (typeof p.balance === "number") {
            monthly = Math.min(DEFAULT_BALANCE, p.balance);
            purchased = Math.max(0, p.balance - DEFAULT_BALANCE);
          }
        } catch { /* ignore */ }
      }
      const s: State = {
        monthly,
        purchased,
        cycleIndex: currentCycleIndex(signupAt),
        signupAt,
        limit: DEFAULT_LIMIT,
      };
      localStorage.setItem(KEY, JSON.stringify(s));
      return s;
    }
    const parsed = JSON.parse(raw);
    const s: State = {
      monthly: typeof parsed.monthly === "number" ? parsed.monthly : DEFAULT_BALANCE,
      purchased: typeof parsed.purchased === "number" ? parsed.purchased : 0,
      cycleIndex: typeof parsed.cycleIndex === "number" ? parsed.cycleIndex : currentCycleIndex(signupAt),
      signupAt,
      limit: DEFAULT_LIMIT,
    };
    return s;
  } catch {
    return freshState(signupAt);
  }
}

function write(s: State) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(s));
}

/**
 * Aplica renovaciones pendientes: si hoy estamos en un cycleIndex mayor al guardado,
 * el saldo mensual se restablece a DEFAULT_BALANCE (no se acumula). Los comprados no cambian.
 * Devuelve { state, renewedCount } — renewedCount > 0 si efectivamente se renovó.
 */
function applyRenewal(s: State): { state: State; renewedCount: number } {
  const now = currentCycleIndex(s.signupAt);
  if (now > s.cycleIndex) {
    if (typeof window !== "undefined") {
      localStorage.removeItem(MILESTONES_KEY);
    }
    return {
      state: {
        ...s,
        monthly: DEFAULT_BALANCE,
        limit: DEFAULT_LIMIT,
        cycleIndex: now,
      },
      renewedCount: now - s.cycleIndex,
    };
  }
  return { state: s, renewedCount: 0 };
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

export function useCredits() {
  // Init: lee estado y aplica renovación si corresponde
  const [state, setState] = useState<State>(() => {
    const initial = read();
    const { state: renewed, renewedCount } = applyRenewal(initial);
    if (renewedCount > 0) write(renewed);
    return renewed;
  });
  const [history, setHistory] = useState<CreditHistoryEntry[]>(readHistory);
  const lastCycleRef = useRef<number>(state.cycleIndex);

  // Sincroniza el signupAt con la fecha real de la cuenta del usuario (auth.user.created_at)
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      const createdAt = data.user?.created_at;
      if (!createdAt || cancelled) return;
      const current = localStorage.getItem(SIGNUP_KEY);
      if (current !== createdAt) {
        setSignupAt(createdAt);
        // Recalcula estado con el anclaje correcto
        const cur = read();
        const aligned: State = { ...cur, signupAt: createdAt };
        const { state: renewed, renewedCount } = applyRenewal(aligned);
        write(renewed);
        lastCycleRef.current = renewed.cycleIndex;
        setState(renewed);
        if (renewedCount > 0) {
          toast("✨ Créditos mensuales renovados", {
            description: `+${DEFAULT_BALANCE} créditos disponibles este ciclo.`,
          });
        }
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Sync entre tabs y verificación periódica (sólo dispara toast cuando realmente cambia el ciclo)
  useEffect(() => {
    const sync = () => {
      const fresh = read();
      const { state: renewed, renewedCount } = applyRenewal(fresh);
      if (renewedCount > 0) {
        write(renewed);
        toast("✨ Créditos mensuales renovados", {
          description: `+${DEFAULT_BALANCE} créditos disponibles este ciclo.`,
        });
      }
      lastCycleRef.current = renewed.cycleIndex;
      setState(renewed);
      setHistory(readHistory());
    };
    window.addEventListener("storage", sync);
    window.addEventListener("supernova_credits_changed", sync);
    const interval = window.setInterval(() => {
      const fresh = read();
      const { state: renewed, renewedCount } = applyRenewal(fresh);
      if (renewedCount > 0 && renewed.cycleIndex !== lastCycleRef.current) {
        write(renewed);
        lastCycleRef.current = renewed.cycleIndex;
        setState(renewed);
        toast("✨ Créditos mensuales renovados", {
          description: `+${DEFAULT_BALANCE} créditos disponibles este ciclo.`,
        });
      }
    }, 60_000);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("supernova_credits_changed", sync);
      window.clearInterval(interval);
    };
  }, []);

  const persist = (next: State, nextHist: CreditHistoryEntry[]) => {
    write(next);
    localStorage.setItem(HIST_KEY, JSON.stringify(nextHist.slice(0, 200)));
    setState(next);
    setHistory(nextHist);
    window.dispatchEvent(new Event("supernova_credits_changed"));
  };

  const consume = useCallback((action: CreditAction, meta?: string): boolean => {
    const cost = CREDIT_COSTS[action];
    // Asegúrate de aplicar renovación antes de gastar
    const { state: cur } = applyRenewal(read());
    const total = totalBalance(cur);
    if (total < cost) return false;

    // Gasta primero del saldo mensual; el excedente, de los comprados.
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
    const { state: cur } = applyRenewal(read());
    persist({ ...cur, purchased: cur.purchased + amount }, readHistory());
  };

  return {
    balance: totalBalance(state),
    monthly: state.monthly,
    purchased: state.purchased,
    limit: state.limit,
    renewalDate: cycleEndDate(state.signupAt, state.cycleIndex),
    history,
    consume,
    canAfford,
    refill,
  };
}
