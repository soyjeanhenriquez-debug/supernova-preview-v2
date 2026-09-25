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
  if (isAdmin) {
    disabled = true;
    queue.length = 0;
    if (ph) { ph.opt_out_capturing(); ph.stopSessionRecording(); }
    return;
  }
  run(p => p.identify(u.id, u.email ? { email: u.email } : undefined));
}

/** Al cerrar sesión: lo siguiente ya no es de esa persona. */
export function resetAnalytics() { if (ph) ph.reset(); }

/**
 * Eventos del negocio, con nombres fijos para armar los embudos en PostHog.
 * Nunca se mandan textos que escribe el usuario ni datos de pago.
 */
export type AppEvent =
  | "gemelo_oferta_elegida" | "gemelo_clonar" | "gemelo_guardado"
  | "etapa_completada"
  | "personaje_ideas" | "personaje_creado" | "personaje_foto" | "guiones_generados" | "bio_copiada"
  | "video_avisame" | "video_reserva_click";
export function track(event: AppEvent, props?: Record<string, string | number | boolean | null>) {
  run(p => p.capture(event, props));
}
