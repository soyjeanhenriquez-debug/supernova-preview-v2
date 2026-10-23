import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTrialState, TRIAL_REFRESH_EVENT } from "@/hooks/useTrialState";

const HIST_KEY = "supernova_credits_history_v1";
/** Cada pantalla tiene su propia instancia del hook: este evento las mantiene con el mismo saldo. */
export const SYNC_EVENT = "supernova_credits_sync";
const MILESTONES_KEY = "supernova_milestones_v1";
const DEFAULT_BALANCE = 2000;
const DEFAULT_LIMIT = 2000;

export type CreditAction =
  | "search_ads" | "analyze_url" | "landing_intelligence" | "sofisticar"
  | "blueprint" | "adaptar" | "pain_discovery" | "chat_message" | "ai_intel"
  | "gen_landing" | "gen_ad_copies" | "gen_avatar" | "gen_funnel"
  | "content_month"
  | "gen_master_prompt" | "pillar_assist" | "gen_light" | "gen_medium" | "gen_heavy" | "gen_media"
  | "gen_ad_image" | "gen_ad_image_nb2" | "gen_ad_image_nbpro" | "clone_carousel" | "model_slide" | "follow_offer" | "unlock_kit" | "video_subtitles" | "reel_analyze" | "reel_level" | "reel_carousel"
  | "build_piece_std" | "build_piece_sonnet" | "build_piece_opus" | "build_piece_fable" | "build_piece_gpt" | "build_piece_astra"
  | "business_map"
  | "vid_mini_5" | "vid_mini_10" | "yt_voice_scene" | "yt_scene_image"
  | "motion_style" | "motion_ad";

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
  gen_funnel: 50, gen_master_prompt: 50, gen_light: 15, gen_medium: 30, gen_heavy: 75, gen_media: 0, // gen_media: el precio sale del catálogo (media_models)
  gen_ad_image: 7, // GPT Image 2: US$0,0115 medido en ai_usage → 7 créditos ≈ 4,9× (12-oct-2026, decisión de Jean)
  gen_ad_image_nb2: 10, // APIMart Nano Banana 2 (~US$0,0143) ≈ 5,6× (05-oct-2026, aprobado por Jean)
  gen_ad_image_nbpro: 20, // APIMart Nano Banana Pro (~US$0,0285) ≈ 5,6× (05-oct-2026, aprobado por Jean)
  video_subtitles: 20, // Sube tu video: audio a Gemini (~US$0,01–0,02) (13-oct-2026, Jean)
  reel_analyze: 25, // Analiza un Reel: Apify + Gemini mira el video + tu versión (~US$0,04) (16-oct-2026, Jean)
  reel_level: 5, // Analiza un Reel: otra versión con otro nivel, sin volver a mirar el video (~US$0,01) (16-oct-2026, Jean)
  reel_carousel: 10, // Reel → Carrusel de un Reel ya analizado, sin volver a mirar el video (~US$0,015) (17-oct-2026, Jean)
  clone_carousel: 15, // carousel-clone: Apify + Gemini con imágenes (~US$0,02) ≈ 6× (05-oct-2026, aprobado por Jean)
  model_slide: 6, // carousel-slide-model: la IA lee UNA lámina del original y escribe la nuestra (Jean, 06-oct-2026: entre 3× y 6× del costo).
  follow_offer: 5, // se cobra server-side en la RPC follow_offer (Cazador de ROI)
  unlock_kit: 150, // se cobra server-side en la RPC unlock_kit (Mini Apps Rentables)
  // Crear producto: por capítulo, lección o bono, según la IA (edge function product-builder).
  build_piece_std: 15, build_piece_sonnet: 35, build_piece_opus: 75, build_piece_fable: 180, build_piece_gpt: 35, build_piece_astra: 125,
  // Mapa del negocio: escalera propuesta con IA (edge function business-map).
  business_map: 15,
  // Video IA (edge function video-studio, APIMart seedance-2.0-mini 720p, ~US$0,0217/s ≈ 4×).
  vid_mini_5: 89, vid_mini_10: 177, // costo × 6 (22-oct-2026, decisión de Jean; antes 75/150 a ×5)
  // Producir video de YouTube (edge function yt-produce). PROPUESTOS el 04-oct-2026: Jean los confirma
  // antes de aplicar la migración 20261004060000_yt_production.sql.
  yt_voice_scene: 5, // gpt-4o-mini-tts ≤600 caracteres a speed ≥1 (≤US$0,0104) → ~3,9× peor caso, ~5× normal
  yt_scene_image: 6, // gpt-image-2 (~US$0,0081) → 5,9×
  // Tu mes de contenido (edge function content-month, gemini-3-flash ~US$0,03 → ~13×). Jean, 07-oct-2026.
  content_month: 50,
  // Motion graphics (edge function motion-graphics, gemini-3-flash). Jean, 08-oct-2026: "×15, sin exagerar".
  motion_style: 40, // desglose + ADN del estilo + prompt listo para pegar (≤ US$0,023 → ≈ 14×)
  motion_ad: 50, // escenas, narración y prompts de clips de 10 s (≤ US$0,029 → ≈ 14×); la animación se dibuja gratis
};

export const ACTION_LABEL: Record<CreditAction, string> = {
  search_ads: "Buscar anuncios", analyze_url: "Revisar una página (rápido)",
  landing_intelligence: "Oráculo: análisis completo de una página de venta", sofisticar: "Mejorar una oferta",
  blueprint: "Plan completo de un negocio", adaptar: "Adaptar un anuncio a tu país",
  pain_discovery: "Buscar problemas que la gente quiere resolver", chat_message: "Pregunta al asistente",
  ai_intel: "Análisis de un anuncio con IA", gen_landing: "Escribir una página de venta",
  gen_ad_copies: "10 textos para tu anuncio", gen_avatar: "Retrato de tu cliente ideal",
  gen_funnel: "Camino de venta completo (video de venta + correos)", gen_master_prompt: "Instrucciones para crear tu propia versión",
  pillar_assist: "Ayuda de la IA en un pilar", gen_light: "Texto corto con IA (ganchos, publicaciones, mensajes)", gen_media: "Video o imagen con IA",
  gen_medium: "Texto medio con IA (correos, guiones, páginas)", gen_heavy: "Texto largo con IA (guion de video de venta)",
  gen_ad_image: "Imagen para tu anuncio con IA",
  gen_ad_image_nb2: "Imagen con IA · Nano Banana 2",
  gen_ad_image_nbpro: "Imagen con IA · Nano Banana Pro",
  clone_carousel: "Modelar un carrusel viral",
  video_subtitles: "Subtítulos y gancho de tu video",
  reel_analyze: "Analizar un Reel",
  reel_level: "Otra versión de un Reel",
  reel_carousel: "Reel → Carrusel",
  model_slide: "Modelar una lámina de un carrusel",
  follow_offer: "Seguir una oferta",
  unlock_kit: "Desbloquear una Mini App",
  build_piece_std: "Capítulo o lección · Estándar",
  build_piece_sonnet: "Capítulo o lección · Premium",
  build_piece_opus: "Capítulo o lección · Pro",
  build_piece_fable: "Capítulo o lección · Máximo",
  build_piece_gpt: "Capítulo o lección · ChatGPT",
  build_piece_astra: "Capítulo o lección · ChatGPT Astra",
  business_map: "Escalera de tu negocio",
  vid_mini_5: "Video con IA de 5 segundos",
  vid_mini_10: "Video con IA de 10 segundos",
  yt_voice_scene: "Voz de una escena (hasta ~40 s)",
  yt_scene_image: "Imagen de una escena de tu video",
  content_month: "Tu mes de contenido",
  motion_style: "Modelar el estilo de un motion graphics",
  motion_ad: "Motion graphics con IA",
};

const GEN_LIGHT_IDS = new Set(["captions-ig","yt-titles","hooks-meta","hooks-tiktok","reels-script","dm-script","whatsapp-sequence","order-bump","ugc-script","mandala-ad","market-idea","etsy-ideas","personaje-ideas","carrusel-copy","historia-escenas"]);
const GEN_MEDIUM_IDS = new Set(["landing-copy","email-launch","email-sequence","yt-script","funnel-strategy","audience-research","product-desc","offer-stack","yapping-script","ecosystem","ascension-offer","meta-campaign","creative-brief","mandala-sequence","mandala-iterate","personaje-guiones"]);
const GEN_HEAVY_IDS = new Set(["vsl-downsell","vsl-upsell-1","vsl-upsell-2","vsl-main"]);

export function generatorCost(id: string): { action: CreditAction; cost: number } {
  if (GEN_HEAVY_IDS.has(id)) return { action: "gen_heavy", cost: 75 };
  if (GEN_MEDIUM_IDS.has(id)) return { action: "gen_medium", cost: 30 };
  return { action: "gen_light", cost: 15 };
}

export const ACTION_HOURS: Record<CreditAction, number> = {
  search_ads: 0.5, analyze_url: 0.5, ai_intel: 1, chat_message: 0.25, adaptar: 1,
  pillar_assist: 1, sofisticar: 2, gen_ad_copies: 2, gen_avatar: 2, pain_discovery: 2,
  blueprint: 4, gen_landing: 4, landing_intelligence: 4, gen_funnel: 8,
  gen_master_prompt: 6, gen_light: 1, gen_medium: 3, gen_heavy: 6, gen_ad_image: 1, gen_ad_image_nb2: 1, gen_ad_image_nbpro: 1, clone_carousel: 2, model_slide: 0.5, gen_media: 2,
  follow_offer: 0.5, unlock_kit: 12, video_subtitles: 1, reel_analyze: 1, reel_level: 0.5, reel_carousel: 2,
  build_piece_std: 3, build_piece_sonnet: 3, build_piece_opus: 3, build_piece_fable: 3, build_piece_gpt: 3, build_piece_astra: 3,
  business_map: 3,
  vid_mini_5: 2, vid_mini_10: 3, yt_voice_scene: 0.5, yt_scene_image: 1,
  content_month: 6,
  motion_style: 2, motion_ad: 6,
};

export interface CreditHistoryEntry {
  date: string; action: CreditAction; label: string; cost: number; meta?: string;
  /** Recargas y bonos: créditos que ENTRARON (se pintan como +N en el historial). */
  granted?: number;
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
  // Sin avisos por cada gasto: la ruedita de la barra superior lo muestra. Solo saldo bajo.
  void limit;
  if (prevBalance > 500 && nextBalance <= 500) fire("left_500", "⚡ Te quedan 500 créditos");
  if (prevBalance > 100 && nextBalance <= 100) fire("left_100", "🚨 Últimos 100 créditos");
  localStorage.setItem(MILESTONES_KEY, JSON.stringify(Array.from(seen)));
}

// ── Carga compartida ────────────────────────────────────────────────────
// Varias pantallas usan el hook a la vez (barra superior, aviso de saldo, Inicio…). Antes cada
// una pedía por su cuenta sesión + recarga mensual + saldo + 200 movimientos, dos veces al montar
// y otra vez cada minuto. Ahora hay UNA carga para todas: se reutiliza 30 s, se refresca cada
// 5 min solo con la pestaña visible, y la recarga mensual se revisa una vez por sesión.
interface CreditsSnapshot { balance: number; purchased: number; renewalDate: Date; history: CreditHistoryEntry[] }
let snapshot: CreditsSnapshot | null = null;
let snapshotAt = 0;
let inflight: Promise<void> | null = null;
let monthlyCheckedFor: string | null = null;
const listeners = new Set<(s: CreditsSnapshot) => void>();
let poll: number | null = null;
let authSub: { unsubscribe: () => void } | null = null;

async function loadCredits(): Promise<void> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) return;

  // Saldo e historial en paralelo.
  const readAll = () => Promise.all([
    // select("*"): purchased (comprados) existe desde el 11-oct-2026; sin la columna no se rompe.
    supabase.from("user_credits").select("*").eq("user_id", uid).maybeSingle(),
    supabase.from("credit_transactions").select("created_at, action, label, cost, meta")
      .eq("user_id", uid).order("created_at", { ascending: false }).limit(200),
  ]);

  // Otorgar mensual si toca (idempotente): una vez por sesión basta. Va A LA VEZ que la lectura
  // del saldo (11-oct-2026: antes iba primero y la ruedita esperaba un viaje más al servidor).
  // Solo si de verdad se renovó se vuelve a leer, para que el saldo ya incluya la recarga.
  const grant = monthlyCheckedFor !== uid ? supabase.rpc("grant_monthly_if_due") : null;
  monthlyCheckedFor = uid;
  let [{ data: row }, { data: txs }] = await readAll();
  if (grant) {
    const { data } = await grant;
    if ((data as { granted?: boolean } | null)?.granted) {
      toast("✨ Créditos mensuales renovados", { description: `+${DEFAULT_BALANCE} créditos disponibles` });
      [{ data: row }, { data: txs }] = await readAll();
    }
  }

  const next: CreditsSnapshot = snapshot
    ? { ...snapshot }
    : { balance: DEFAULT_BALANCE, purchased: 0, renewalDate: new Date(Date.now() + 30 * 86400000), history: readHistory() };
  if (row) {
    next.balance = row.balance;
    const p = Number((row as { purchased?: number }).purchased);
    next.purchased = Number.isFinite(p) ? p : Math.max(0, row.balance - DEFAULT_BALANCE);
    next.renewalDate = new Date(new Date(row.last_grant_at).getTime() + 30 * 86400000);
  }
  if (txs) {
    next.history = txs.map(t => ({
      date: t.created_at,
      action: t.action as CreditAction,
      label: t.label || ACTION_LABEL[t.action as CreditAction] || t.action,
      cost: t.cost,
      granted: (t.meta as { granted?: number } | null)?.granted,
      meta: (t.meta as { note?: string } | null)?.note,
    }));
    try { localStorage.setItem(HIST_KEY, JSON.stringify(next.history)); } catch { /* sin almacenamiento */ }
  }
  snapshot = next;
  snapshotAt = Date.now();
  listeners.forEach((l) => l(next));
}

function refreshShared(force = false): Promise<void> {
  if (inflight) return inflight;
  if (!force && snapshot && Date.now() - snapshotAt < 30_000) return Promise.resolve();
  inflight = loadCredits().finally(() => { inflight = null; });
  return inflight;
}

function subscribe(l: (s: CreditsSnapshot) => void): () => void {
  listeners.add(l);
  if (listeners.size === 1) {
    poll = window.setInterval(() => { if (document.visibilityState === "visible") void refreshShared(true); }, 5 * 60_000);
    authSub = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        if (event === "SIGNED_OUT") { snapshot = null; monthlyCheckedFor = null; }
        void refreshShared(true);
      }
    }).data.subscription;
  }
  return () => {
    listeners.delete(l);
    if (listeners.size === 0) {
      if (poll !== null) window.clearInterval(poll);
      poll = null;
      authSub?.unsubscribe();
      authSub = null;
    }
  };
}

export function useCredits() {
  const [balance, setBalance] = useState<number>(() => snapshot?.balance ?? DEFAULT_BALANCE);
  const [purchasedRaw, setPurchased] = useState<number>(() => snapshot?.purchased ?? 0);
  const [renewalDate, setRenewalDate] = useState<Date>(() => snapshot?.renewalDate ?? new Date(Date.now() + 30 * 86400000));
  const [history, setHistory] = useState<CreditHistoryEntry[]>(() => snapshot?.history ?? readHistory());

  const refreshFromDB = useCallback(() => refreshShared(true), []);

  useEffect(() => {
    const unsub = subscribe((s) => { setBalance(s.balance); setPurchased(s.purchased); setRenewalDate(s.renewalDate); setHistory(s.history); });
    void refreshShared();
    const onSync = (e: Event) => {
      const b = (e as CustomEvent<{ balance?: number }>).detail?.balance;
      if (typeof b === "number") {
        setBalance(b);
        if (snapshot) snapshot = { ...snapshot, balance: b };
      }
    };
    window.addEventListener(SYNC_EVENT, onSync);
    return () => { unsub(); window.removeEventListener(SYNC_EVENT, onSync); };
  }, []);

  /**
   * El servidor ya cobró (edge function): refleja el cargo en la interfaz.
   * No descuenta nada por su cuenta: usa el saldo que devolvió el servidor.
   */
  const applyServerCharge = useCallback((action: CreditAction, billing: { charged: number; balance: number | null }, meta?: string) => {
    if (typeof billing.balance === "number") {
      window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { balance: billing.balance } }));
    }
    // Cada uso de la prueba gratis cambia lo que le queda: se vuelve a leer (barato, una RPC).
    try { window.dispatchEvent(new Event(TRIAL_REFRESH_EVENT)); } catch { /* sin ventana (pruebas) */ }
    if (!billing.charged) return; // cubierto por un recibo (paso de un flujo ya pagado)
    const entry: CreditHistoryEntry = {
      date: new Date().toISOString(), action, label: ACTION_LABEL[action], cost: billing.charged, meta,
    };
    setHistory(h => [entry, ...h].slice(0, 200));
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

  // Prueba gratis (12-oct-2026): la cuenta gratis no tiene créditos reales; el navegador usa su
  // prueba expresada en créditos (2.000 × lo que le queda) para no bloquearla antes de tiempo.
  // Quien decide de verdad es el servidor (5 usos por herramienta y tope de costo).
  const trial = useTrialState();
  const effBalance = trial.kind === "free" ? Math.max(balance, Math.round(DEFAULT_LIMIT * trial.leftPct / 100)) : balance;
  const canAfford = (action: CreditAction) => effBalance >= CREDIT_COSTS[action];

  return {
    balance: effBalance,
    // Como Higgsfield: se gastan primero los del mes y después los comprados (servidor, debit_credits).
    // Por eso lo comprado solo baja cuando ya no quedan del mes: min(comprados, saldo).
    monthly: effBalance - Math.min(purchasedRaw, effBalance),
    purchased: Math.min(purchasedRaw, effBalance),
    limit: DEFAULT_LIMIT,
    renewalDate,
    history,
    consume,
    applyServerCharge,
    refresh: refreshFromDB,
    canAfford,
  };
}
