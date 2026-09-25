// SUPERNOVA — Lo común de video-generate e image-generate (fal.ai): usuario, plan, catálogo y cobro.
// Reglas: el servidor decide TODO (modelo, plan, precio); el navegador solo manda el id del modelo.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

export const FAL_KEY = Deno.env.get("FAL_KEY");

/** Planes de Whop que cuentan como Comunidad Creativos 10X (modelos "comunidad"). */
const COMUNIDAD_PLANS = ["plan_oRht08inLOu39"];

export const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, ...extra, "Content-Type": "application/json" } });

export function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface Caller { id: string; email: string | null; isAdmin: boolean; comunidad: boolean }

/** Usuario real (no la llave anon), si es admin y si tiene la Comunidad activa. */
export async function caller(req: Request): Promise<Caller | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const db = admin();
  const { data } = await db.auth.getUser(token);
  const u = data?.user;
  if (!u) return null;
  const email = (u.email ?? "").toLowerCase() || null;
  // La suscripción se liga por user_id o, si Whop llegó antes que el registro, por el correo.
  const subs = () => db.from("subscriptions").select("plan_id").in("plan_id", COMUNIDAD_PLANS)
    .in("status", ["active", "trialing", "past_due"]).limit(1);
  const [{ data: role }, { data: byId }, byEmail] = await Promise.all([
    db.from("user_roles").select("role").eq("user_id", u.id).eq("role", "admin").maybeSingle(),
    subs().eq("user_id", u.id),
    email ? subs().eq("email", email) : Promise.resolve({ data: [] as unknown[] }),
  ]);
  const isAdmin = !!role;
  return { id: u.id, email, isAdmin, comunidad: isAdmin || (byId ?? []).length > 0 || (byEmail.data ?? []).length > 0 };
}

export interface MediaModel {
  id: string; kind: "video" | "image" | "avatar"; grp: string; label: string; endpoint: string;
  image_field: string | null; tier: "pro" | "comunidad"; action: string; seconds: number | null;
  status: "admin" | "live" | "soon" | "off"; input: Record<string, unknown>; cost_usd: number | null;
}

/** Lo que nos cobra fal por esta generación, en ai_usage (sale en Admin → Salud → costos y márgenes). */
export async function logCost(userId: string, fn: string, m: MediaModel) {
  const { error } = await admin().from("ai_usage").insert({
    user_id: userId, fn, model: `fal:${m.id}`, images: m.kind === "image" ? 1 : 0, cost_usd: Number(m.cost_usd) || 0,
  });
  if (error) console.error("ai_usage:", error.message);
}

/** Busca el modelo y decide si esta persona lo puede usar. Devuelve el modelo o la respuesta de error. */
export async function pickModel(id: unknown, kind: MediaModel["kind"], who: Caller): Promise<MediaModel | Response> {
  if (typeof id !== "string" || !/^[a-z0-9_]{2,40}$/.test(id)) return json({ error: "Modelo inválido." }, 400);
  const { data } = await admin().from("media_models").select("*").eq("id", id).eq("kind", kind).maybeSingle();
  const m = data as MediaModel | null;
  if (!m || m.status === "off") return json({ error: "Ese modelo no está disponible." }, 404);
  if (m.status === "soon" || (m.status === "admin" && !who.isAdmin)) return json({ error: "Este modelo llega pronto.", pronto: true }, 503);
  if (m.tier === "comunidad" && !who.comunidad) {
    return json({ error: "Este modelo es de la Comunidad Creativos 10X.", code: "comunidad_required" }, 403);
  }
  return m;
}

export interface Gate { txId: string | null; charged: number; balance: number | null }

/** Acceso + tope + cobro ANTES de gastar (edge_guard_charge; el precio lo pone credit_prices). */
export async function charge(fn: string, userId: string, action: string, label: string, maxHour: number, maxDay: number): Promise<Gate | Response> {
  const { data: g, error } = await admin().rpc("edge_guard_charge", {
    p_user_id: userId, p_fn: fn, p_max_hour: maxHour, p_max_day: maxDay,
    p_action: action, p_label: label.slice(0, 120), p_kind: null, p_receipt: null,
  });
  if (error) return json({ error: "No se pudo verificar el acceso. Intenta de nuevo." }, 503);
  if (g?.ok !== true) {
    switch (g?.reason) {
      case "rate_limited": return json({ error: "Alcanzaste el límite por ahora. Intenta más tarde." }, 429);
      case "insufficient_credits": return json({ error: "No tienes créditos suficientes.", code: "insufficient_credits", balance: g.balance, cost: g.cost }, 402);
      case "disabled": return json({ error: "Llega pronto.", pronto: true }, 503);
      case "unknown_action": return json({ error: "Modelo sin precio configurado." }, 500);
      default: return json({ error: "Tu cuenta no tiene acceso activo." }, 403);
    }
  }
  return { txId: g.tx_id ?? null, charged: Number(g.charged) || 0, balance: typeof g.balance === "number" ? g.balance : null };
}

export async function refund(txId: string | null, reason: string) {
  if (!txId) return;
  try { await admin().rpc("refund_charge", { p_tx_id: txId, p_reason: reason.slice(0, 200) }); }
  catch (e) { console.error("refund_charge:", e); }
}

export const billingHeaders = (g: Gate): Record<string, string> => ({
  "Access-Control-Expose-Headers": "x-credits-charged, x-credits-balance",
  "x-credits-charged": String(g.charged),
  ...(g.balance !== null ? { "x-credits-balance": String(g.balance) } : {}),
});

export function fal(url: string, init: RequestInit = {}) {
  return fetch(url, { ...init, headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
}

/** La cola de fal consulta por la APP (dos primeros tramos), no por la ruta completa del modelo. */
export const appOf = (endpoint: string) => endpoint.split("/").slice(0, 2).join("/");

/** Foto del personaje: solo de la carpeta del propio usuario; URL firmada temporal para fal. */
export async function signedPhoto(userId: string, path: unknown): Promise<string | null> {
  if (typeof path !== "string" || !path.startsWith(`${userId}/`) || path.includes("..")) return null;
  const { data } = await admin().storage.from("personajes").createSignedUrl(path, 60 * 30);
  return data?.signedUrl ?? null;
}
