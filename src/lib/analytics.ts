import type { PostHog, CaptureResult } from "posthog-js";

/**
 * Medición de uso con PostHog (us.posthog.com): grabaciones de sesión, mapas de calor, errores y
 * embudos. Reglas:
 * - Solo en la app oficial (ALLOWED_HOSTS): nada en local ni en las versiones de prueba de Vercel.
 * - Se carga DESPUÉS de que la app está lista (import dinámico en un momento libre): no pesa en la
 *   primera carga.
 * - Privacidad: todo lo que se escribe (inputs) sale como •••• en las grabaciones; lo marcado con
 *   data-ph-mask también. Los tokens de los enlaces de acceso (#access_token=…) y los ?t= / ?code=
 *   se borran de toda URL antes de enviarla.
 * - Los admins no se graban (ensucian los datos). Los clientes se identifican por su id de usuario
 *   y su correo (para encontrar la sesión de alguien que reporta un problema).
 * La llave phc_ es PÚBLICA (va en el bundle, como la de Supabase); la privada nunca va aquí.
 */
const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const ALLOWED_HOSTS = ["supernova-six-eta.vercel.app"];

let ph: PostHog | null = null;
let loading: Promise<PostHog | null> | null = null;
let disabled = false;
// Cuenta con sesión (solo para recordar en este navegador el último estado visto de SU plan).
let currentUid: string | null = null;
// Lo que pasa antes de que PostHog termine de cargar se guarda y se manda al cargar.
const queue: ((p: PostHog) => void)[] = [];

export const analyticsEnabled = () => !!KEY && ALLOWED_HOSTS.includes(window.location.hostname);

/** Quita de una URL todo lo que parezca un token o código de acceso. */
export function scrubUrl(url: string): string {
  return url
    .replace(/#.*(access_token|refresh_token|provider_token|error_code|error_description|type=recovery|token)=.*$/i, "#[oculto]")
    .replace(/([?&])(t|token|code|access_token|refresh_token|apikey|key)=[^&#]*/gi, "$1$2=[oculto]");
}

const URL_PROPS = ["$current_url", "$referrer", "$initial_current_url", "$initial_referrer", "$pathname", "$prev_pageview_pathname"];

function scrub(ev: CaptureResult | null): CaptureResult | null {
  if (!ev) return ev;
  for (const bag of [ev.properties, ev.$set, ev.$set_once] as (Record<string, unknown> | undefined)[]) {
    if (!bag) continue;
    for (const k of URL_PROPS) if (typeof bag[k] === "string") bag[k] = scrubUrl(bag[k] as string);
  }
  return ev;
}

function load(): Promise<PostHog | null> {
  if (loading) return loading;
  if (!analyticsEnabled() || disabled) return (loading = Promise.resolve(null));
  loading = new Promise<void>(res => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void };
    if (w.requestIdleCallback) w.requestIdleCallback(() => res(), { timeout: 4000 }); else setTimeout(res, 2500);
  }).then(() => import("posthog-js")).then(({ default: posthog }) => {
    if (disabled) return null;
    posthog.init(KEY!, {
      api_host: "https://us.i.posthog.com",
      ui_host: "https://us.posthog.com",
      defaults: "2026-08-30",
      person_profiles: "identified_only",
      respect_dnt: true, // "No rastrear" del navegador = no se mide (lo promete la política de privacidad)
      // La app cambia de pantalla por el hash (#/ofertas): cada cambio es una vista.
      capture_pageview: { path: true, hash: true },
      capture_pageleave: true,
      autocapture: true,
      enable_heatmaps: true,
      disable_surveys: true, // no usamos encuestas: 33 KB menos por visita
      capture_exceptions: true,
      mask_personal_data_properties: true,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: "[data-ph-mask]",
        blockSelector: "[data-ph-block]",
      },
      before_send: scrub,
    });
    ph = posthog;
    queue.splice(0).forEach(fn => fn(posthog));
    return posthog;
  }).catch(() => null);
  return loading;
}

function run(fn: (p: PostHog) => void) {
  if (!analyticsEnabled() || disabled) return;
  if (ph) fn(ph); else { queue.push(fn); void load(); }
}

/** Arranca la medición (visitantes sin sesión también: landing, login, registro). */
export function startAnalytics() { void load(); }

/** Con sesión: liga lo que hace a su cuenta. Admin → se apaga y no se graba. */
export function identifyUser(u: { id: string; email?: string | null }, isAdmin: boolean) {
  currentUid = u.id;
  if (isAdmin) {
    disabled = true;
    queue.length = 0;
    if (ph) { ph.opt_out_capturing(); ph.stopSessionRecording(); }
    return;
  }
  run(p => p.identify(u.id, u.email ? { email: u.email } : undefined));
}

/** Al cerrar sesión: lo siguiente ya no es de esa persona. */
export function resetAnalytics() { currentUid = null; if (ph) ph.reset(); }

/**
 * Eventos del negocio, con nombres fijos para armar los embudos en PostHog.
 * Nunca se mandan textos que escribe el usuario ni datos de pago (track() lo filtra igual).
 */
export type AppEvent =
  | "gemelo_oferta_elegida" | "gemelo_clonar" | "gemelo_guardado"
  | "etapa_completada"
  | "personaje_ideas" | "personaje_creado" | "personaje_foto" | "guiones_generados" | "bio_copiada"
  | "video_avisame" | "video_reserva_click" | "higgsfield_click"
  | "video_generado" | "video_final_armado" | "comunidad_upsell_click"
  | "motion_grabado" | "motion_estilo_modelado" | "motion_escenas" | "motion_partes" | "motion_clip_ia"
  | "home_card_click" | "home_ask_assistant" | "search_used"
  | "idea_sheet_open" | "idea_create_click"
  // Prueba 9 de 10 (R2-10, 12-oct-2026): el embudo de la misión 10, en orden. Ver FUNNEL_9DE10.
  | "portada_vista" | "prueba_click" | "cuenta_creada" | "inicio_abierto"
  | "mi_version_click" | "mi_version_lista" | "pieza_creada" | "te_sirvio"
  | "pago_click" | "plan_pagado" | "recarga_click" | "recarga_hecha"
  | "recarga_suave_vista";

type Props = Record<string, string | number | boolean | null>;

/**
 * Llaves que NUNCA salen hacia PostHog aunque alguien las pase (textos que escribe la persona,
 * correos, nombres). Ej.: home_ask_assistant mandaba { text } con la pregunta escrita.
 */
const BLOCKED_KEYS = /^(text|texto|q|query|pregunta|prompt|note|nota|mensaje|message|email|correo|mail|name|nombre|full_name|display_name|phone|telefono|whatsapp_num)$/i;

/** Limpia las propiedades de un evento: sin llaves bloqueadas, sin correos, textos cortos. */
export function cleanProps(props?: Props): Props | undefined {
  if (!props) return undefined;
  const out: Props = {};
  for (const [k, v] of Object.entries(props)) {
    if (BLOCKED_KEYS.test(k)) continue;
    if (typeof v === "string") {
      if (/@/.test(v)) continue; // parece un correo: no sale
      out[k] = v.length > 64 ? v.slice(0, 64) : v;
    } else out[k] = v;
  }
  return out;
}

export function track(event: AppEvent, props?: Props) {
  const clean = cleanProps(props);
  run(p => p.capture(event, clean));
}

// ── Embudo "Prueba 9 de 10" ─────────────────────────────────────────────────────────────────────
// Misión 10 (docs/agentes/2026-10-11-mision-10-juez.md): 10 personas reales en prueba de 3 días.
// Metas: 9 usan Mi versión, 5 pagan el día 4, 3 recargan en 30 días. En PostHog se arma un embudo
// con estos eventos en este orden; el admin (Admin → Prueba 9 de 10) ve lo mismo desde la base.

export const FUNNEL_9DE10: readonly { event: AppEvent; label: string; where: string }[] = [
  { event: "portada_vista", label: "Visita la portada", where: "public/fundador (landing estática)" },
  { event: "prueba_click", label: "Toca «Probar 3 días»", where: "landing → /signup" },
  { event: "cuenta_creada", label: "Crea su cuenta", where: "SignupPage, al crear la cuenta" },
  { event: "inicio_abierto", label: "Abre Inicio", where: "DashboardPage (una vez por sesión)" },
  { event: "mi_version_click", label: "Toca «Hacer mi versión»", where: "OfferCard / OfferDetailSheet / DailyPicksHero" },
  { event: "mi_version_lista", label: "Mi versión lista", where: "MiniAppModal, phase = done" },
  { event: "pieza_creada", label: "Primera pieza (imagen, carrusel o video)", where: "Creativos, Carrusel, Video" },
  { event: "te_sirvio", label: "«¿Te sirvió?» → Sí", where: "ToolFeedback (si = true)" },
  { event: "pago_click", label: "Va a pagar en Whop", where: "SignupPage / Créditos / Pricing" },
  { event: "plan_pagado", label: "Paga el día 4 (prueba → pago)", where: "notePlanState() al leer la suscripción" },
  { event: "recarga_click", label: "Va a recargar", where: "Créditos / RechargePopup" },
  { event: "recarga_hecha", label: "Recarga (créditos comprados suben)", where: "notePurchased() al leer créditos" },
];

export type PieceKind = "imagen" | "carrusel" | "video";
export type FunnelOrigin = string; // pantalla o botón de donde viene (ej. "oferta_tarjeta", "inicio_hoy")

const once = new Set<string>();
/** Un evento una sola vez por sesión de la pestaña (ej. abrir Inicio). */
function trackOnce(key: string, event: AppEvent, props?: Props) {
  if (once.has(key)) return;
  once.add(key);
  track(event, props);
}

/** Landing: la persona vio la portada. */
export const trackLandingView = (variante?: string) => trackOnce("portada", "portada_vista", { variante: variante ?? null });
/** Landing: tocó el botón de la prueba. */
export const trackTrialClick = (origen: FunnelOrigin) => track("prueba_click", { origen });
/** Registro: la cuenta se creó (sin correo ni nombre: solo de dónde vino). */
export const trackSignup = (origen: FunnelOrigin = "signup") => trackOnce("cuenta", "cuenta_creada", { origen });
/** Inicio abierto: una vez por sesión. */
export const trackHomeOpen = () => trackOnce("inicio", "inicio_abierto");
/** Tocó «Hacer mi versión» (antes de cobrar). */
export const trackMiVersionClick = (origen: FunnelOrigin, offerId?: string | null, dias?: number | null) =>
  track("mi_version_click", { origen, offer_id: offerId ?? null, dias: dias ?? null });
/** Mi versión terminó bien (ya cobrada y guardada). */
export const trackMiVersionReady = (offerId?: string | null, segundos?: number | null) =>
  track("mi_version_lista", { offer_id: offerId ?? null, segundos: segundos ?? null });
/** Una pieza lista: imagen de anuncio, carrusel o video. */
export const trackPieceCreated = (tipo: PieceKind, herramienta: string, extra?: Props) =>
  track("pieza_creada", { ...(extra ?? {}), tipo, herramienta });
/** Respuesta a «¿Te sirvió?» (la llama ToolFeedback). */
export const trackFeedback = (herramienta: string, si: boolean) => track("te_sirvio", { herramienta, si });
/** Va al checkout de Whop del plan. */
export const trackCheckoutClick = (plan: string, origen: FunnelOrigin) => track("pago_click", { plan, origen });
/** Va a comprar un pack de créditos. */
export const trackRechargeClick = (pack: string, origen: FunnelOrigin) => track("recarga_click", { pack, origen });
/** R2-03: se mostró la recarga suave. */
export const trackSoftRechargeShown = (saldo: number) => track("recarga_suave_vista", { saldo });

// Lo que pasa en Whop (el pago y la recarga) no ocurre en la app: se detecta al volver, comparando
// con lo último que vio este navegador para esta cuenta. Lo seguro está en la base (Admin).
const PLAN_KEY = "sn_plan_estado_v1";
const BOUGHT_KEY = "sn_comprados_v1";
function readMap(key: string): Record<string, string | number> {
  try { return JSON.parse(localStorage.getItem(key) || "{}") as Record<string, string | number>; } catch { return {}; }
}
function writeMap(key: string, m: Record<string, string | number>) {
  try { localStorage.setItem(key, JSON.stringify(m)); } catch { /* sin almacenamiento */ }
}

/**
 * Estado del plan leído de la base (trialing / active / past_due / canceled…). Lo deja como propiedad
 * de la persona en PostHog y, si este navegador la vio en prueba y ahora paga, manda plan_pagado.
 * Devuelve true si mandó plan_pagado (para las pruebas).
 */
export function notePlanState(status: string | null | undefined): boolean {
  const st = String(status ?? "").toLowerCase().slice(0, 20);
  if (!st || !currentUid) return false;
  const m = readMap(PLAN_KEY);
  const prev = m[currentUid];
  if (prev === st) return false;
  m[currentUid] = st;
  writeMap(PLAN_KEY, m);
  run(p => p.setPersonProperties({ estado_plan: st }));
  const paid = prev === "trialing" && (st === "active" || st === "past_due");
  if (paid) track("plan_pagado", { desde: "trialing" });
  return paid;
}

/**
 * Créditos comprados leídos de la base (user_credits.purchased). Si suben respecto a lo último que
 * vio este navegador, manda recarga_hecha. Devuelve los créditos que subieron (0 si nada).
 */
export function notePurchased(purchased: number | null | undefined): number {
  if (typeof purchased !== "number" || !Number.isFinite(purchased) || !currentUid) return 0;
  const m = readMap(BOUGHT_KEY);
  const prev = typeof m[currentUid] === "number" ? (m[currentUid] as number) : null;
  m[currentUid] = purchased;
  writeMap(BOUGHT_KEY, m);
  const up = prev === null ? 0 : purchased - prev;
  if (up > 0) track("recarga_hecha", { creditos: up });
  return up > 0 ? up : 0;
}

// ── Recarga suave (coordinado con R2-03) ──────────────────────────────────────────────────────────
// Tras un «¿Te sirvió? → Sí» con saldo bajo, ToolFeedback avisa con un evento de la ventana. R2-03
// lo escucha y muestra su recarga suave (sin bloquear, sin toasts encima). Aquí solo se avisa.
export const SOFT_RECHARGE_EVENT = "sn:soft-recharge";
export const SOFT_RECHARGE_BELOW = 300;
export type SoftRechargeDetail = { balance: number; tool: string };

/** Avisa a la app que conviene ofrecer recarga suave. Devuelve true si avisó. */
export function emitSoftRecharge(balance: number, tool: string): boolean {
  if (!Number.isFinite(balance) || balance >= SOFT_RECHARGE_BELOW) return false;
  window.dispatchEvent(new CustomEvent<SoftRechargeDetail>(SOFT_RECHARGE_EVENT, { detail: { balance, tool } }));
  return true;
}

/** Para R2-03: escuchar la recarga suave. Devuelve la función para dejar de escuchar. */
export function onSoftRecharge(cb: (d: SoftRechargeDetail) => void): () => void {
  const h = (e: Event) => { const d = (e as CustomEvent<SoftRechargeDetail>).detail; if (d) cb(d); };
  window.addEventListener(SOFT_RECHARGE_EVENT, h);
  return () => window.removeEventListener(SOFT_RECHARGE_EVENT, h);
}
