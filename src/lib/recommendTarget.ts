import { CREDIT_COSTS } from "@/hooks/useCredits";
import type { CreativeSeed, SeedAspect, SeedSource, SeedTarget } from "@/lib/creativeSeed";
import type { Offer } from "@/lib/offers";

/**
 * "La IA eligió por ti": qué pieza conviene crear con una idea real, sin preguntarle nada al usuario.
 * Reglas fijas (sin IA ni costo), para que la recomendación sea instantánea y predecible:
 *  - Anuncio del Radar con video → video anuncio; con imagen (o sin saber) → creativos 4:5.
 *  - Oferta → creativos 4:5.
 *  - Video de Nichos de YouTube → guion de YouTube (16:9, o 9:16 si es un Short).
 *  - Side hustle: UGC → video UGC; faceless → YouTube; marca personal → carrusel; el resto → creativos.
 */
export type HustleKind = "low_ticket" | "faceless" | "ugc" | "marca" | "kits" | "local";

export type RecInput =
  | { source: "radar"; media?: "video" | "image" | null }
  | { source: "oferta" }
  | { source: "nicho_yt"; kind?: "long" | "short" }
  | { source: "side_hustle"; hustle: HustleKind }
  | { source: "manual" };

export type Recommendation = { target: SeedTarget; reason: string; aspect: SeedAspect };

export function recommendTarget(input: RecInput): Recommendation {
  switch (input.source) {
    case "radar":
      return input.media === "video"
        ? { target: "video_anuncio", aspect: "9:16", reason: "El anuncio original es un video: haz el tuyo en 3 tomas." }
        : input.media === "image"
        ? { target: "creativos", aspect: "4:5", reason: "El anuncio original es una imagen: el formato 4:5 ocupa más pantalla en el feed." }
        : { target: "creativos", aspect: "4:5", reason: "Las imágenes son lo más rápido y barato de probar en Meta." };
    case "oferta":
      return { target: "creativos", aspect: "4:5", reason: "Para vender esta oferta, primero prueba 3 imágenes con ángulos distintos." };
    case "nicho_yt":
      return input.kind === "short"
        ? { target: "youtube", aspect: "9:16", reason: "Es un Short: tu versión vertical con un guion original." }
        : { target: "youtube", aspect: "16:9", reason: "Este tema ya atrae vistas: haz tu propio guion por escenas." };
    case "side_hustle":
      switch (input.hustle) {
        case "ugc": return { target: "video_ugc", aspect: "9:16", reason: "Un presentador IA explica el producto a cámara, sin grabarte." };
        case "faceless": return { target: "youtube", aspect: "16:9", reason: "Un canal sin cara empieza con un buen guion por escenas." };
        case "marca": return { target: "carrusel", aspect: "4:5", reason: "El carrusel es lo que más se guarda y comparte en Instagram." };
        case "local": return { target: "creativos", aspect: "1:1", reason: "A un negocio local le sirven imágenes cuadradas para feed y WhatsApp." };
        case "kits":
        case "low_ticket":
        default: return { target: "creativos", aspect: "4:5", reason: "Con 3 imágenes ya puedes probar si tu idea llama la atención." };
      }
    case "manual":
    default:
      return { target: "creativos", aspect: "4:5", reason: "Las imágenes son lo más rápido de crear y de probar." };
  }
}

/** Formato por defecto de cada pieza cuando no es la recomendada. */
export const DEFAULT_ASPECT: Record<SeedTarget, SeedAspect> = {
  creativos: "4:5", carrusel: "4:5", miniaturas: "16:9", foto_ugc: "9:16", foto_producto: "4:5",
  video_anuncio: "9:16", video_ugc: "9:16", serie: "9:16", youtube: "16:9",
};

// Precios de video: los fija el servidor (credit_prices vid_mini_5 / vid_mini_10). Si useCredits ya los
// tiene se usan esos; si no, los vigentes (55 y 110). Solo para MOSTRAR: quien cobra es el servidor.
const cc = CREDIT_COSTS as unknown as Record<string, number | undefined>;
const IMG = CREDIT_COSTS.gen_ad_image;
const VID5 = cc.vid_mini_5 ?? 55;
const VID10 = cc.vid_mini_10 ?? 110;
const YT_SCRIPT = CREDIT_COSTS.gen_medium; // yt-script es un generador "medio" de ai-chat

export type TargetInfo = { label: string; detail: string; credits: number; costLabel: string };

/** Nombre, qué incluye y costo de cada pieza (lo que dice el botón antes de gastar). */
export function targetInfo(t: SeedTarget): TargetInfo {
  const n = (credits: number) => `${credits.toLocaleString("es")} créditos`;
  switch (t) {
    case "creativos": return { label: "Creativos", detail: "3 imágenes para anuncios", credits: 3 * IMG, costLabel: n(3 * IMG) };
    case "carrusel": return { label: "Carrusel", detail: "5 láminas para Instagram", credits: 5 * IMG, costLabel: n(5 * IMG) };
    case "miniaturas": return { label: "Miniaturas", detail: "2 portadas para YouTube", credits: 2 * IMG, costLabel: n(2 * IMG) };
    case "foto_ugc": return { label: "Fotos estilo UGC", detail: "3 fotos como hechas con el celular", credits: 3 * IMG, costLabel: n(3 * IMG) };
    case "foto_producto": return { label: "Fotos de producto", detail: "3 fotos de estudio y en uso", credits: 3 * IMG, costLabel: n(3 * IMG) };
    case "video_anuncio": return { label: "Video anuncio", detail: "3 tomas de 5 s: gancho, demo y llamada", credits: 3 * VID5, costLabel: n(3 * VID5) };
    case "video_ugc": return { label: "UGC con IA", detail: "1 video de 10 s con presentador IA", credits: VID10, costLabel: n(VID10) };
    case "serie": return { label: "Serie de video", detail: "1 escena de 5 s para empezar", credits: VID5, costLabel: n(VID5) };
    case "youtube": return { label: "Video de YouTube", detail: "Guion original por escenas", credits: YT_SCRIPT, costLabel: `guion ${YT_SCRIPT}` };
  }
}

/** Las 3 alternativas a la recomendada, en orden de utilidad para esa fuente. */
export function alternativesFor(rec: SeedTarget, source: SeedSource): SeedTarget[] {
  const base: SeedTarget[] = source === "nicho_yt"
    ? ["miniaturas", "video_anuncio", "carrusel", "creativos"]
    : ["creativos", "carrusel", "video_anuncio", "video_ugc", "youtube"];
  return base.filter((t) => t !== rec).slice(0, 3);
}

/** Primera línea del texto de un anuncio, para usarla como REFERENCIA de gancho (≤140). */
export function firstLine(text: string | null | undefined): string {
  const para = (text ?? "").split(/\r?\n/).map((s) => s.trim()).find((s) => s.length >= 4) ?? "";
  // Primera frase del primer párrafo (sin lookbehind: Safari viejo no lo entiende).
  const m = para.match(/^.{4,}?[.!?](?=\s|$)/);
  const line = (m ? m[0] : para).trim();
  return line.length > 140 ? `${line.slice(0, 137).trimEnd()}…` : line;
}

/** "214 días pagando anuncios" (dato real: days_active). */
export function daysEvidence(days: number | null | undefined): string | undefined {
  const d = Math.round(Number(days));
  if (!Number.isFinite(d) || d < 1) return undefined;
  return d === 1 ? "1 día pagando anuncios" : `${d.toLocaleString("es")} días pagando anuncios`;
}

/**
 * ¿El creativo de un anuncio del Radar es video o imagen? Lo sabe la vista previa (AdMediaPreview) una
 * vez cargada, que lo guarda en localStorage (`sn:ad-prev:<id de Meta>`). Sin dato → null.
 */
export function adMediaKind(adUrl: string | null | undefined, store: Pick<Storage, "getItem"> | null = safeLocalStorage()): "video" | "image" | null {
  if (!adUrl || !store) return null;
  const m = adUrl.match(/[?&]id=(\d{6,})/);
  if (!m) return null;
  try {
    const raw = store.getItem(`sn:ad-prev:${m[1]}`);
    if (!raw) return null;
    const e = JSON.parse(raw) as { imageUrl?: string | null; videoUrl?: string | null };
    return e.videoUrl ? "video" : e.imageUrl ? "image" : null;
  } catch { return null; }
}

function safeLocalStorage(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

// ─────────────── Semillas desde cada fuente (sin target: lo pone la hoja al tocar) ───────────────

/** Lo que una idea aporta a la semilla; la hoja añade `target`, `aspect` y `autostart` al tocar. */
export type IdeaDraft = Omit<CreativeSeed, "v" | "at" | "target" | "autostart" | "aspect"> & { aspect?: SeedAspect };

type OfferLike = Pick<Offer, "id" | "product_name" | "sample_title" | "page_name" | "sample_body" | "target_audience"
  | "mechanism" | "why_wins" | "price_hint" | "days_active">;

/** Oferta del catálogo → idea. `who`/`promise` salen del análisis; si faltan, de su nombre. */
export function ideaFromOffer(o: OfferLike, price?: string | null): IdeaDraft {
  const product = (o.product_name || o.sample_title || o.page_name || "Oferta").trim();
  return {
    source: "oferta",
    title: product.slice(0, 80),
    product,
    who: (o.target_audience ?? "").trim() || `Personas interesadas en ${product}`,
    promise: (o.mechanism || o.why_wins || "").trim() || `Lograr lo que ofrece ${product}`,
    price: (price || o.price_hint || "").trim() || undefined,
    hook: firstLine(o.sample_body) || undefined,
    angle: (o.why_wins ?? "").trim() || undefined,
    evidence: daysEvidence(o.days_active),
    refId: o.id,
  };
}

type AdLike = { id: string; title: string; body: string; pageName: string; daysActive: number };

/** Anuncio del Radar → idea. El gancho es la primera línea del anuncio, SOLO como referencia. */
export function ideaFromAd(ad: AdLike): IdeaDraft {
  const product = (ad.title || ad.pageName || "Anuncio").trim();
  return {
    source: "radar",
    title: product.slice(0, 80),
    product,
    who: `Personas interesadas en ${product}`,
    promise: firstLine(ad.body) && firstLine(ad.body) !== firstLine(ad.title) ? firstLine(ad.body) : `Lograr lo que ofrece ${product}`,
    hook: firstLine(ad.body) || undefined,
    evidence: daysEvidence(ad.daysActive),
    refId: ad.id,
  };
}

type YtLike = { id: string; title: string; seconds: number; views: number };

/** Video de Nichos de YouTube → idea. Tema y estructura como referencia; nunca su texto. */
export function ideaFromYt(it: YtLike, niche: string, short: boolean): IdeaDraft {
  const views = Math.max(0, Math.round(it.views));
  return {
    source: "nicho_yt",
    title: it.title.slice(0, 80),
    product: it.title,
    who: `Personas que ven videos de ${niche}`,
    promise: `Un video original sobre ${niche}`,
    hook: it.title.slice(0, 140),
    evidence: views > 0 ? `${views.toLocaleString("es")} vistas en YouTube` : undefined,
    ytRef: { id: it.id, title: it.title, seconds: it.seconds },
    aspect: short ? "9:16" : "16:9",
    refId: it.id,
  };
}
