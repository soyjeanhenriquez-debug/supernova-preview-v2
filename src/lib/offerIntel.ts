import { supabase } from "@/integrations/supabase/client";
import { fnHeaders, fnErrorMessage } from "@/lib/fnAuth";

/**
 * Ficha completa de una oferta (tabla `offer_intel`, edge function offer-intel):
 * página de ventas, checkout, embudo, precio y el veredicto de SUPERNOVA.
 * Se calcula UNA vez por oferta y se comparte entre todos: leerla es gratis, y
 * solo la primera persona que abre una oferta nueva espera a que se genere.
 */
export interface OfferVerdict {
  would_copy: "si" | "con_cambios" | "no";
  score: number;
  /** De dónde sale la nota (prueba de venta, embudo, facilidad). Veredictos antiguos no lo traen. */
  score_basis?: string;
  your_twist?: string;
  ads_plan?: string;
  organic_plan?: { platform: "instagram" | "tiktok" | "ambas"; account_idea: string; content_ideas: string[] } | null;
  headline: string;
  why_attention: string;
  whats_working: string;
  copy_this: string[];
  change_this: string[];
  latam_adaptation: string;
  countries_to_test: string[];
  suggested_ticket: string;
  ticket_detected: string | null;
  miniapp_idea: string;
  conclusion: string;
}

export interface CheckoutData {
  platform: string;
  product_name: string | null;
  price: number | null;
  currency: string | null;
  guarantee_days: number | null;
  /** El embudo tiene un upsell configurado después del pago (su precio no se ve sin comprar). */
  has_upsell: boolean;
  /** false = desde el checkout no se puede saber si hay upsell (Kiwify, SamCart, tiendas de apps). */
  upsell_visible?: boolean;
  bumps: { name: string; price: number | null; currency: string | null }[];
  /** El producto principal se cobra de forma recurrente. */
  subscription?: { price: number | null; interval: string | null } | null;
  /** Ficha pública de App Store o Google Play. */
  app?: {
    store: "App Store" | "Google Play";
    in_app: { name: string; price: number | null }[];
    in_app_min: number | null;
    in_app_max: number | null;
    rating: number | null;
    ratings_count: number | null;
    installs: number | null;
    installs_label: string | null;
  } | null;
  /** Prueba pública de demanda que muestra la propia plataforma. */
  public_sales?: number | null;
  members?: number | null;
  rating?: number | null;
  ratings_count?: number | null;
  source_url: string;
}

export interface OfferIntel {
  offer_id: string;
  landing_url: string | null;
  landing_domain: string | null;
  landing_title: string | null;
  checkout_url: string | null;
  checkout_platform: string | null;
  funnel_type: string | null;
  price_text: string | null;
  /** Mapa del negocio: lo que su checkout deja ver sin pagar (hoy solo Hotmart). */
  checkout_data: CheckoutData | null;
  verdict: OfferVerdict | null;
  status: "pending" | "ready" | "partial" | "failed";
  verdict_at: string | null;
  updated_at: string;
}

export const FUNNEL_LABEL: Record<string, string> = {
  pagina_ventas: "Página de ventas",
  vsl: "Video de ventas (VSL)",
  advertorial: "Artículo tipo noticia que lleva a la venta",
  quiz: "Cuestionario (quiz) que lleva a la venta",
  webinar: "Clase / webinar",
  aplicacion: "Formulario + llamada de venta (precio alto)",
  captura: "Página para dejar tu correo o WhatsApp",
  tienda: "Tienda online",
  app: "App (tienda de apps)",
  whatsapp: "Venta por WhatsApp",
  checkout_directo: "Directo a la página de pago",
};

const COLS = "offer_id, landing_url, landing_domain, landing_title, checkout_url, checkout_platform, funnel_type, price_text, checkout_data, verdict, status, verdict_at, updated_at";
const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/offer-intel`;

async function readIntel(offerId: string): Promise<OfferIntel | null> {
  const { data } = await supabase.from("offer_intel").select(COLS).eq("offer_id", offerId).maybeSingle();
  return (data as unknown as OfferIntel | null) ?? null;
}

const isFinal = (i: OfferIntel | null) => !!i && i.status !== "pending";

/**
 * Devuelve la ficha. `onGenerating` avisa cuando toca calcularla (la interfaz
 * muestra el progreso). Nunca lanza: un fallo vuelve como `{ error }`.
 */
export async function loadOfferIntel(
  offerId: string,
  opts: { onGenerating?: () => void; signal?: AbortSignal } = {},
): Promise<{ intel: OfferIntel | null; error?: string }> {
  try {
    const cached = await readIntel(offerId);
    if (isFinal(cached)) return { intel: cached };

    opts.onGenerating?.();
    const res = await fetch(FN_URL, {
      method: "POST", headers: await fnHeaders(), body: JSON.stringify({ offer_id: offerId }), signal: opts.signal,
    });
    if (res.status === 200) return { intel: (await res.json()) as OfferIntel };
    if (res.status !== 202) return { intel: cached, error: await fnErrorMessage(res, "No pudimos analizar esta oferta ahora mismo.") };

    // Otra persona la está generando en este momento: se espera el resultado.
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      if (opts.signal?.aborted) return { intel: null };
      const fresh = await readIntel(offerId);
      if (isFinal(fresh)) return { intel: fresh };
    }
    return { intel: null, error: "El análisis está tardando más de lo normal. Vuelve a abrir la oferta en un minuto." };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return { intel: null };
    return { intel: null, error: "No pudimos analizar esta oferta ahora mismo." };
  }
}

/** Enlace externo seguro para pintar en un <a>: solo http(s). */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export async function reportOffer(offerId: string, reason: "inactive" | "broken_link" | "wrong_info" | "other" = "inactive"): Promise<boolean> {
  const { error } = await supabase.from("offer_reports").insert({ offer_id: offerId, reason });
  // 23505 = ya la había reportado: para el usuario es lo mismo que un éxito.
  return !error || error.code === "23505";
}

/** El veredicto como texto plano, para pegar en notas o mandarlo por WhatsApp. */
export function verdictToText(name: string, v: OfferVerdict): string {
  const decision = v.would_copy === "si" ? "Sí, véndela" : v.would_copy === "no" ? "Hoy no la vendería" : "Véndela con cambios";
  return [
    `${name} — Veredicto SUPERNOVA: ${decision} (${v.score}/10)`,
    v.headline,
    "", "POR QUÉ LLAMA LA ATENCIÓN", v.why_attention,
    "", "QUÉ ESTÁ FUNCIONANDO", v.whats_working,
    "", "QUÉ COPIAR", ...v.copy_this.map((x) => `• ${x}`),
    "", "QUÉ CAMBIAR", ...v.change_this.map((x) => `• ${x}`),
    ...(v.your_twist ? ["", "HAZLA TUYA (ROBA COMO UN ARTISTA)", v.your_twist] : []),
    ...(v.ads_plan ? ["", "CÓMO PROBARLA CON ANUNCIOS", v.ads_plan] : []),
    ...(v.organic_plan ? ["", `PLAN ORGÁNICO (${v.organic_plan.platform.toUpperCase()})`, v.organic_plan.account_idea, ...v.organic_plan.content_ideas.map((x) => `• ${x}`)] : []),
    "", "CÓMO ADAPTARLA A LATAM", v.latam_adaptation,
    "", `PAÍSES PARA PROBAR: ${v.countries_to_test.join(", ")}`,
    `PRECIO SUGERIDO: ${v.suggested_ticket}`,
    "", "IDEA DE MINI APP", v.miniapp_idea,
    "", "CONCLUSIÓN", v.conclusion,
  ].filter((l) => l !== undefined).join("\n");
}
