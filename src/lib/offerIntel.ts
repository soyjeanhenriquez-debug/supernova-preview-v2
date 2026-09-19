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

export interface OfferIntel {
  offer_id: string;
  landing_url: string | null;
  landing_domain: string | null;
  landing_title: string | null;
  checkout_url: string | null;
  checkout_platform: string | null;
  funnel_type: string | null;
  price_text: string | null;
  verdict: OfferVerdict | null;
  status: "pending" | "ready" | "partial" | "failed";
  verdict_at: string | null;
  updated_at: string;
}

export const FUNNEL_LABEL: Record<string, string> = {
  pagina_ventas: "Página de ventas",
  vsl: "Video de ventas (VSL)",
  advertorial: "Advertorial → venta",
  quiz: "Quiz",
  webinar: "Clase / webinar",
  aplicacion: "Aplicación + llamada (ticket alto)",
  captura: "Página de captura",
  tienda: "Tienda online",
  app: "App (tienda de apps)",
  whatsapp: "Venta por WhatsApp",
  checkout_directo: "Directo al checkout",
};

const COLS = "offer_id, landing_url, landing_domain, landing_title, checkout_url, checkout_platform, funnel_type, price_text, verdict, status, verdict_at, updated_at";
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
  const decision = v.would_copy === "si" ? "Sí, la copiaría" : v.would_copy === "no" ? "No la copiaría" : "La copiaría con cambios";
  return [
    `${name} — Veredicto SUPERNOVA: ${decision} (${v.score}/10)`,
    v.headline,
    "", "POR QUÉ LLAMA LA ATENCIÓN", v.why_attention,
    "", "QUÉ ESTÁ FUNCIONANDO", v.whats_working,
    "", "QUÉ COPIAR", ...v.copy_this.map((x) => `• ${x}`),
    "", "QUÉ CAMBIAR", ...v.change_this.map((x) => `• ${x}`),
    "", "CÓMO ADAPTARLA A LATAM", v.latam_adaptation,
    "", `PAÍSES PARA PROBAR: ${v.countries_to_test.join(", ")}`,
    `PRECIO SUGERIDO: ${v.suggested_ticket}`,
    "", "IDEA DE MINI APP", v.miniapp_idea,
    "", "CONCLUSIÓN", v.conclusion,
  ].filter((l) => l !== undefined).join("\n");
}
