import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import ReactMarkdown from "react-markdown";
import { fnErrorMessage, fnHeaders, readBilling, type ServerBilling } from "@/lib/fnAuth";

/**
 * Fase 1 · "Crear producto" (etapa 4 · Construir): el ebook, mini curso o reto de días del usuario, escrito a
 * partir de la ficha del producto activo. El índice es gratis; cada capítulo o lección se cobra
 * aparte EN EL SERVIDOR (edge function product-builder) y se reembolsa sola si la IA falla.
 * Tablas: product_builds (un libro/curso) y product_build_pieces (una fila por pieza).
 * Los modelos salen de ai_builder_models: sumar una IA nueva es agregar una fila, sin tocar esto.
 * El cliente NUNCA manda precio ni model_id: manda el slug y el servidor decide.
 */

export type BuildFormat = "ebook" | "curso" | "reto";
export type BuildSize = "corto" | "normal";
export type BuildTone = "limpio" | "cercano" | "groserias";
export type PieceKind = "capitulo" | "leccion" | "bono";
export type BuildStatus = "borrador" | "listo";
export type CoverColor = "noche" | "coral" | "bosque";
export type BuildCover = { template?: "clasica"; color?: CoverColor; author?: string };

export interface Build {
  id: string;
  product_id?: string;
  format: BuildFormat;
  size: BuildSize;
  tone: BuildTone;
  title: string;
  subtitle: string | null;
  status: BuildStatus;
  pieces_total: number;
  pieces_done: number;
  cover?: BuildCover | null;
  created_at?: string;
  updated_at?: string;
}

export interface Piece {
  id: string;
  build_id?: string;
  idx: number;
  kind: PieceKind;
  module: string | null;
  title: string;
  brief: string | null;
  content: string | null;
  model_slug?: string | null;
  gen_count?: number;
  generated_at?: string | null;
  edited_at?: string | null;
  /** Solo lo manda el servidor al escribir: la IA se quedó sin espacio. */
  truncated?: boolean;
}

export type ModelTier = "estandar" | "premium" | "maximo";
export interface BuilderModel {
  slug: string;
  label: string;
  hint: string;
  /** "Qué obtienes" (ai_builder_models.benefits, máx. 3): el cliente compara niveles como en HeyGen. */
  benefits: string[];
  tier: ModelTier;
  provider: "gemini" | "anthropic" | "openai";
  allows_profanity: boolean;
  /** Acción de credit_prices que cobra el servidor por pieza. */
  piece_action: string;
  /** Precio por pieza (de credit_prices; solo para mostrar, cobra el servidor). */
  cost: number;
  /** Solo las habilitadas se pueden elegir; las demás se muestran como "Pronto" (también al admin). */
  enabled: boolean;
}

/** Modelos que se anuncian aunque aún no estén habilitados (se muestran como "Pronto"). */
export const UPCOMING_MODELS: { slug: string; label: string; tier: ModelTier }[] = [
  { slug: "estandar", label: "Estándar", tier: "estandar" },
  { slug: "sonnet", label: "Premium · Sonnet 5", tier: "premium" },
  { slug: "chatgpt", label: "Premium · ChatGPT", tier: "premium" },
  { slug: "astra", label: "Máximo · ChatGPT Astra", tier: "maximo" },
  { slug: "opus", label: "Pro · Opus 5.5", tier: "premium" },
  { slug: "fable", label: "Máximo · Fable 5.1", tier: "maximo" },
];

/** Tope de partes por libro (reto de 28 días = 29). Igual que el servidor y el trigger pb_piece_guard. */
export const MAX_PIECES = 30;
export const MAX_NOTES = 500;
export const MAX_PIECE_CHARS = 40000;
/** Una parte cuenta como "hecha" con ≥200 caracteres (mismo criterio que el trigger pb_refresh_counts). */
export const DONE_MIN_CHARS = 200;
export const isPieceDone = (p: Pick<Piece, "content">) => (p.content ?? "").trim().length >= DONE_MIN_CHARS;

export const FORMAT_LABEL: Record<BuildFormat, string> = { ebook: "Ebook", curso: "Mini curso", reto: "Reto" };
export const KIND_LABEL: Record<PieceKind, string> = { capitulo: "Capítulo", leccion: "Lección", bono: "Bono" };
/** "Día" en un reto, "Lección"/"Capítulo"/"Bono" en lo demás (igual que el servidor). */
export const kindLabel = (format: BuildFormat, kind: PieceKind) =>
  format === "reto" && kind === "leccion" ? "Día" : KIND_LABEL[kind];
/** Formatos agrupados por módulo (curso) o por semana (reto). */
export const isGrouped = (format: BuildFormat) => format === "curso" || format === "reto";
export const TONE_LABEL: Record<BuildTone, string> = { limpio: "Limpio", cercano: "Cercano", groserias: "Con groserías" };

export type BuilderErrorCode =
  | "invalid_body" | "profile_incomplete" | "unauthorized" | "insufficient_credits" | "no_access"
  | "not_found" | "no_product" | "busy" | "too_many_builds" | "tone_not_allowed" | "ai_refusal"
  | "rate_limited" | "ai_busy" | "unknown_action" | "ai_failed" | "model_unavailable" | "disabled"
  | "guard_error" | "ai_timeout" | "not_available" | "needs_recharge";

/** Respaldo por si el servidor no manda `error` (siempre se muestra primero data.error). */
export const BUILDER_ERRORS: Record<BuilderErrorCode, string> = {
  invalid_body: "Algo no cuadra en lo que enviaste. Revisa e intenta de nuevo.",
  profile_incomplete: "Primero completa tu ficha: qué vendes, para quién y qué promete.",
  unauthorized: "Tu sesión venció. Vuelve a entrar.",
  insufficient_credits: "No te alcanzan los créditos.",
  no_access: "Tu plan no incluye esta herramienta.",
  not_found: "No encontramos esta parte. Recarga la página.",
  no_product: "No encontramos tu producto. Abre uno en Mis productos.",
  busy: "Esta parte ya se está escribiendo.",
  too_many_builds: "Tienes 30 ebooks, cursos o retos. Borra alguno para crear otro.",
  tone_not_allowed: "Esta IA no escribe con groserías. Cambia el tono o elige otra.",
  ai_refusal: "La IA no quiso escribir esta parte. No se te cobró. Cambia el título o el tono.",
  rate_limited: "Vas muy rápido. Espera un poco e intenta de nuevo.",
  ai_busy: "La IA está saturada. No se te cobró.",
  unknown_action: "Esta acción no está disponible.",
  ai_failed: "La IA no respondió. No se te cobró: intenta de nuevo.",
  model_unavailable: "Este modelo aún no está disponible. No se te cobró.",
  disabled: "Esta herramienta está en pausa por un momento.",
  guard_error: "No pudimos verificar tu cuenta. Intenta de nuevo.",
  ai_timeout: "Tardó demasiado. No se te cobró: intenta de nuevo o usa otra IA.",
  not_available: "Muy pronto disponible.",
  needs_recharge: "Escribir tu producto se activa cuando se cobra tu primer mes (al terminar la prueba) o con una recarga. No se te cobró.",
};

export type BuilderError = { error: string; code?: BuilderErrorCode; refunded?: boolean; balance?: number; cost?: number };

export type OutlineBody = { action: "outline"; product_id?: string; format: BuildFormat; size: BuildSize; tone: BuildTone; notes?: string };
export type PieceBody = { action: "piece"; build_id: string; piece_id: string; model: string; instructions?: string };
export type OutlineResult = { build: Build; pieces: Piece[]; charged: 0 };
export type PieceResult = { piece: Piece; charged: number; balance: number | null };

export type BuilderResponse<T> =
  | { ok: true; status: number; data: T; billing: ServerBilling }
  | { ok: false; status: number; data: BuilderError; billing: ServerBilling };

const NO_BILLING: ServerBilling = { charged: 0, balance: null, receipt: null };

/** Llama a la edge function product-builder. Nunca lanza: los errores vuelven en `data.error`. */
export async function builderCall(body: OutlineBody): Promise<BuilderResponse<OutlineResult>>;
export async function builderCall(body: PieceBody): Promise<BuilderResponse<PieceResult>>;
export async function builderCall(body: OutlineBody | PieceBody): Promise<BuilderResponse<OutlineResult | PieceResult>> {
  let resp: Response;
  try {
    resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/product-builder`, {
      method: "POST",
      headers: await fnHeaders(),
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, data: { error: "Sin conexión. Revisa tu internet e intenta de nuevo." }, billing: NO_BILLING };
  }
  const billing = readBilling(resp);
  if (!resp.ok) {
    let raw: Partial<BuilderError> = {};
    try { raw = await resp.clone().json(); } catch { /* cuerpo no-JSON (proxy, corte) */ }
    const code = raw.code as BuilderErrorCode | undefined;
    const error = await fnErrorMessage(resp, (code && BUILDER_ERRORS[code]) || "Algo falló. Intenta de nuevo.");
    return { ok: false, status: resp.status, data: { ...raw, error, code }, billing };
  }
  try {
    return { ok: true, status: resp.status, data: await resp.json(), billing };
  } catch {
    return { ok: false, status: 502, data: { error: "Algo falló. Intenta de nuevo." }, billing };
  }
}

// ---------- Exportar (gratis, todo en el navegador) ----------

/** "Día N" de cada lección de un reto (numeradas en el orden del índice, como en la pantalla). */
function dayLabels(build: Pick<Build, "format">, sorted: Piece[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (build.format !== "reto") return out;
  let n = 0;
  for (const p of sorted) if (p.kind === "leccion") out[p.id] = `Día ${++n}`;
  return out;
}

/** Contenido de una pieza con su título arriba (las lecciones pueden venir sin "## …"). */
function pieceMarkdown(p: Piece, dayLabel?: string) {
  const body = (p.content ?? "").trim();
  const head = `## ${p.kind === "bono" ? "Bono · " : dayLabel ? `${dayLabel}: ` : ""}${p.title}`;
  if (!body) return `${head}\n\n_${p.brief ?? "Pendiente"}_`;
  return /^#{1,3}\s/.test(body) ? body : `${head}\n\n${body}`;
}

export function exportMarkdown(build: Pick<Build, "title" | "subtitle" | "format">, pieces: Piece[], author?: string): string {
  const out: string[] = [`# ${build.title}`];
  if (build.subtitle) out.push(`_${build.subtitle}_`);
  if (author?.trim()) out.push(`Por ${author.trim()}`);
  let lastModule: string | null = null;
  const all = [...pieces].sort((a, b) => a.idx - b.idx);
  const days = dayLabels(build, all);
  // Solo lo ya escrito (igual que el PDF). Curso: "# Módulo"; reto: "# Semana N: …".
  for (const p of all.filter(x => (x.content ?? "").trim())) {
    if (isGrouped(build.format) && p.kind !== "bono" && p.module && p.module !== lastModule) {
      out.push(`# ${p.module}`);
      lastModule = p.module;
    }
    out.push(pieceMarkdown(p, days[p.id]));
  }
  return out.join("\n\n") + "\n";
}

export const COVER_COLORS: Record<CoverColor, { label: string; bg: string; fg: string; accent: string }> = {
  noche: { label: "Noche", bg: "#0f172a", fg: "#f8fafc", accent: "#a78bfa" },
  coral: { label: "Coral", bg: "#fb7185", fg: "#1c1917", accent: "#fff7ed" },
  bosque: { label: "Bosque", bg: "#14532d", fg: "#f0fdf4", accent: "#fde68a" },
};

// Mismo patrón que el plan de lanzamiento (LaunchPlanPage): en papel solo se ve el contenedor.
const PRINT_CSS = `
.pb-print { display: none; }
@media print {
  @page { margin: 18mm 16mm; }
  body > *:not(.pb-print) { display: none !important; }
  .pb-print { display: block !important; color: #111; background: #fff; font: 11.5pt/1.6 Georgia, "Times New Roman", serif; }
  .pb-cover { height: 250mm; display: flex; flex-direction: column; justify-content: center; padding: 0 14mm; border-radius: 4mm;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; break-after: page; page-break-after: always; }
  .pb-cover h1 { font: 700 34pt/1.15 system-ui, -apple-system, sans-serif; margin: 0 0 6mm; }
  .pb-cover p { font: 400 14pt/1.4 system-ui, -apple-system, sans-serif; margin: 0; opacity: .85; }
  .pb-cover .pb-bar { width: 22mm; height: 2mm; margin-bottom: 8mm; border-radius: 1mm; }
  .pb-cover .pb-author { margin-top: 16mm; font-size: 11pt; letter-spacing: .08em; text-transform: uppercase; }
  .pb-module { break-before: page; page-break-before: always; font: 700 22pt/1.2 system-ui, sans-serif; margin: 40mm 0 0; }
  .pb-piece { break-before: page; page-break-before: always; }
  .pb-module + .pb-piece { break-before: auto; page-break-before: auto; margin-top: 10mm; }
  .pb-piece h1, .pb-piece h2, .pb-piece h3 { font-family: system-ui, -apple-system, sans-serif; break-after: avoid; color: #111; }
  .pb-piece h2 { font-size: 18pt; margin: 0 0 4mm; }
  .pb-piece h3 { font-size: 13pt; margin: 6mm 0 2mm; }
  .pb-piece p, .pb-piece li { orphans: 3; widows: 3; }
  .pb-piece ul, .pb-piece ol { padding-left: 6mm; }
  .pb-piece blockquote { border-left: 1mm solid #ccc; margin: 3mm 0; padding-left: 4mm; color: #333; }
}`;

/**
 * "Guardar PDF": arma un contenedor oculto con portada + piezas y abre el diálogo de impresión del
 * navegador (ahí se elige "Guardar como PDF"). Sin dependencias nuevas.
 */
export function printBuild(build: Pick<Build, "title" | "subtitle" | "format">, pieces: Piece[], cover: BuildCover | null | undefined) {
  const colors = COVER_COLORS[cover?.color ?? "noche"] ?? COVER_COLORS.noche;
  const style = document.createElement("style");
  style.textContent = PRINT_CSS;
  const host = document.createElement("div");
  host.className = "pb-print";
  document.head.appendChild(style);
  document.body.appendChild(host);

  const h = createElement;
  const all = [...pieces].sort((a, b) => a.idx - b.idx);
  const days = dayLabels(build, all);
  const sorted = all.filter(p => (p.content ?? "").trim());
  const nodes: ReturnType<typeof h>[] = [
    h("section", { key: "cover", className: "pb-cover", style: { background: colors.bg, color: colors.fg } },
      h("div", { className: "pb-bar", style: { background: colors.accent } }),
      h("h1", null, build.title),
      build.subtitle ? h("p", null, build.subtitle) : null,
      cover?.author?.trim() ? h("p", { className: "pb-author" }, cover.author.trim()) : null,
    ),
  ];
  let lastModule: string | null = null;
  for (const p of sorted) {
    if (isGrouped(build.format) && p.kind !== "bono" && p.module && p.module !== lastModule) {
      nodes.push(h("h1", { key: `m-${p.id}`, className: "pb-module" }, p.module));
      lastModule = p.module;
    }
    nodes.push(h("article", { key: p.id, className: "pb-piece" }, h(ReactMarkdown, null, pieceMarkdown(p, days[p.id]))));
  }

  const root = createRoot(host);
  flushSync(() => root.render(h("div", null, ...nodes)));
  const cleanup = () => {
    window.removeEventListener("afterprint", cleanup);
    root.unmount();
    host.remove();
    style.remove();
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
  // Algunos navegadores móviles no disparan afterprint.
  window.setTimeout(() => { if (host.isConnected) cleanup(); }, 60_000);
}
