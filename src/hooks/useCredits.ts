import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const HIST_KEY = "supernova_credits_history_v1";
/** Cada pantalla tiene su propia instancia del hook: este evento las mantiene con el mismo saldo. */
const SYNC_EVENT = "supernova_credits_sync";
const MILESTONES_KEY = "supernova_milestones_v1";
const DEFAULT_BALANCE = 2000;
const DEFAULT_LIMIT = 2000;

export type CreditAction =
  | "search_ads" | "analyze_url" | "landing_intelligence" | "sofisticar"
  | "blueprint" | "adaptar" | "pain_discovery" | "chat_message" | "ai_intel"
  | "gen_landing" | "gen_ad_copies" | "gen_avatar" | "gen_funnel"
  | "gen_master_prompt" | "pillar_assist" | "gen_light" | "gen_medium" | "gen_heavy"
  | "gen_ad_image" | "follow_offer" | "unlock_kit";

// Precios calibrados para uso DIARIO: 2000/mes alcanza para ~1 mes de uso
// intenso; explorar el radar es gratis, las acciones ligeras casi gratis.
//
// OJO: esto es SOLO para mostrar el precio y avisar antes si no alcanza. Quien
// cobra es el servidor con la tabla `credit_prices` (las acciones de IA dentro
// de su edge function; seguir/desbloquear en su RPC). Si cambias un precio,
// cámbialo en los dos sitios.
export const CREDIT_COSTS: Record<CreditAction, number> = {
  search_ads: 5, analyze_url: 5, chat_message: 2, adaptar: 5, ai_intel: 5,
  pillar_assist: 10, sofisticar: 15, gen_ad_copies: 15, gen_avatar: 15,
  pain_discovery: 15, blueprint: 25, gen_landing: 40, landing_intelligence: 50,
  gen_funnel: 50, gen_master_prompt: 50, gen_light: 15, gen_medium: 30, gen_heavy: 75,
  gen_ad_image: 25,
  follow_offer: 5, // se cobra server-side en la RPC follow_offer (Cazador de ROI)
  unlock_kit: 150, // se cobra server-side en la RPC unlock_kit (Mini Apps Rentables)
};

export const ACTION_LABEL: Record<CreditAction, string> = {
  search_ads: "Búsqueda de anuncios", analyze_url: "Analizar URL básico",
  landing_intelligence: "Oráculo completo (IA)", sofisticar: "Sofisticar oferta",
  blueprint: "Blueprint completo", adaptar: "Adaptar anuncio al mercado",
  pain_discovery: "Pain Discovery", chat_message: "Consulta IA (por mensaje)",
  ai_intel: "Análisis IA del ad", gen_landing: "Generar landing page",
  gen_ad_copies: "10 variaciones de ad copy", gen_avatar: "Avatar del comprador",
  gen_funnel: "Funnel completo VSL+emails", gen_master_prompt: "Mega-Prompt Replicador",
  pillar_assist: "Asistente IA de Pilar", gen_light: "Generador",
  gen_medium: "Generador", gen_heavy: "Generador",
  gen_ad_image: "Creativo de anuncio (imagen IA)",
  follow_offer: "Seguir oferta (Cazador de ROI)",
  unlock_kit: "Desbloquear Mini App Rentable",
};

const GEN_LIGHT_IDS = new Set(["captions-ig","yt-titles","hooks-meta","hooks-tiktok","reels-script","dm-script","whatsapp-sequence"]);
const GEN_MEDIUM_IDS = new Set(["landing-copy","email-launch","email-sequence","yt-script","funnel-strategy","audience-research","product-desc","offer-stack","yapping-script"]);
const GEN_HEAVY_IDS = new Set(["vsl-downsell","vsl-upsell-1","vsl-upsell-2"]);

export function generatorCost(id: string): { action: CreditAction; cost: number } {
  if (GEN_HEAVY_IDS.has(id)) return { action: "gen_heavy", cost: 75 };
  if (GEN_MEDIUM_IDS.has(id)) return { action: "gen_medium", cost: 30 };
  return { action: "gen_light", cost: 15 };
}

export const ACTION_HOURS: Record<CreditAction, number> = {
  search_ads: 0.5, analyze_url: 0.5, ai_intel: 1, chat_message: 0.25, adaptar: 1,
  pillar_assist: 1, sofisticar: 2, gen_ad_copies: 2, gen_avatar: 2, pain_discovery: 2,
  blueprint: 4, gen_landing: 4, landing_intelligence: 4, gen_funnel: 8,
  gen_master_prompt: 6, gen_light: 1, gen_medium: 3, gen_heavy: 6, gen_ad_image: 1,
  follow_offer: 0.5, unlock_kit: 12,
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
      if ((data as { granted?: boolean } | null)?.granted) {
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
        meta: (t.meta as { note?: string } | null)?.note,
      }));
      setHistory(mapped);
      localStorage.setItem(HIST_KEY, JSON.stringify(mapped));
    }
  }, []);

  useEffect(() => {
    refreshFromDB();
    const { data: sub } = supabase.auth.onAuthStateChange(() => refreshFromDB());
    const iv = window.setInterval(refreshFromDB, 60_000);
    const onSync = (e: Event) => {
      const b = (e as CustomEvent<{ balance?: number }>).detail?.balance;
      if (typeof b === "number") setBalance(b);
    };
    window.addEventListener(SYNC_EVENT, onSync);
    return () => { sub.subscription.unsubscribe(); window.clearInterval(iv); window.removeEventListener(SYNC_EVENT, onSync); };
  }, [refreshFromDB]);

  /**
   * El servidor ya cobró (edge function): refleja el cargo en la interfaz.
   * No descuenta nada por su cuenta: usa el saldo que devolvió el servidor.
   */
  const applyServerCharge = useCallback((action: CreditAction, billing: { charged: number; balance: number | null }, meta?: string) => {
    if (typeof billing.balance === "number") {
      window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { balance: billing.balance } }));
    }
    if (!billing.charged) return; // cubierto por un recibo (paso de un flujo ya pagado)
    const entry: CreditHistoryEntry = {
      date: new Date().toISOString(), action, label: ACTION_LABEL[action], cost: billing.charged, meta,
    };
    setHistory(h => [entry, ...h].slice(0, 200));
    toast(`-${billing.charged} ⚡`, { description: ACTION_LABEL[action], duration: 1800 });
    window.dispatchEvent(new CustomEvent("supernova_credit_spent", { detail: { cost: billing.charged, action, label: ACTION_LABEL[action] } }));
    if (typeof billing.balance === "number") checkMilestones(billing.balance + billing.charged, billing.balance, DEFAULT_LIMIT);
  }, []);

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
      const result = data as { success?: boolean; error?: string; balance?: number } | null;
      if (error || !result?.success) {
        // Rollback si falla
        setBalance(prev);
        toast.error(result?.error || "No se pudo consumir créditos");
      } else if (typeof result.balance === "number") {
        // El precio real lo puso el servidor: este saldo es el que vale.
        window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { balance: result.balance } }));
      }
    });
    return true;
  }, [balance]);

  const canAfford = (action: CreditAction) => balance >= CREDIT_COSTS[action];

  return {
    balance,
    monthly: Math.min(balance, DEFAULT_BALANCE),
    purchased: Math.max(0, balance - DEFAULT_BALANCE),
    limit: DEFAULT_LIMIT,
    renewalDate,
    history,
    consume,
    applyServerCharge,
    refresh: refreshFromDB,
    canAfford,
  };
}
