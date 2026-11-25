// SUPERNOVA — Entrar a la app al volver de Whop con la prueba de 3 días (pedido de Jean, 25-nov-2026).
//
// Flujo: /signup crea la cuenta (sin confirmar el correo) y guarda en user_metadata un
// `signup_nonce` aleatorio que solo conoce esa pestaña. La persona activa la prueba en Whop con
// ESE correo; el whop-webhook anota la suscripción (trialing/active). Al volver, la página llama
// aquí con { email, nonce } y, si todo cuadra, la cuenta queda confirmada y se devuelve un
// token de un solo uso para abrir la sesión sin esperar el correo de confirmación.
//
// Compuertas (todas en el servidor):
//  1. El nonce coincide con el de la cuenta (solo lo tiene el navegador que la creó).
//  2. La cuenta se creó hace menos de 24 h.
//  3. Whop ya registró una suscripción trialing/active para ese correo DESPUÉS de crear la cuenta
//     (así nadie entra a la cuenta pagada de otra persona registrándose con su correo).
// Si la suscripción aún no llegó responde { pending: true } y la página vuelve a preguntar.
import { corsHeaders } from "npm:@supabase/supabase-js@2.117.1/cors";
import { createClient } from "npm:@supabase/supabase-js@2.117.1";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NONCE_RE = /^[0-9a-f-]{32,64}$/i;
const DAY_MS = 24 * 3600 * 1000;
const SLACK_MS = 10 * 60 * 1000; // relojes y orden de eventos

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Método no permitido" });

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const nonce = String(body.nonce ?? "").trim();
  if (!EMAIL_RE.test(email) || !NONCE_RE.test(nonce)) return json(400, { error: "Datos inválidos" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Misma respuesta para "no existe" y "no coincide": no se revela qué correos tienen cuenta.
  const denied = () => json(403, { error: "No se pudo verificar" });

  const { data: userId } = await admin.rpc("get_user_id_by_email", { p_email: email });
  if (!userId) return denied();
  const { data: got, error: getErr } = await admin.auth.admin.getUserById(String(userId));
  const user = got?.user;
  if (getErr || !user) return denied();
  const stored = String((user.user_metadata as Record<string, unknown> | undefined)?.signup_nonce ?? "");
  if (!stored || !sameText(stored, nonce)) return denied();
  const createdAt = Date.parse(user.created_at);
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > DAY_MS) return denied();

  const { data: sub } = await admin.from("subscriptions")
    .select("status, created_at, updated_at").eq("email", email).maybeSingle();
  const subAt = Math.max(Date.parse(sub?.created_at ?? "") || 0, Date.parse(sub?.updated_at ?? "") || 0);
  const subOk = !!sub && (sub.status === "trialing" || sub.status === "active") && subAt >= createdAt - SLACK_MS;
  if (!subOk) return json(200, { pending: true });

  if (!user.email_confirmed_at) {
    const { error: confErr } = await admin.auth.admin.updateUserById(user.id, { email_confirm: true });
    if (confErr) { console.error("entrar-tras-prueba confirmar:", confErr.message); return json(500, { error: "No se pudo activar" }); }
  }
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkErr || !tokenHash) { console.error("entrar-tras-prueba enlace:", linkErr?.message); return json(500, { error: "No se pudo activar" }); }

  const { error: auditErr } = await admin.from("audit_log").insert({
    user_id: user.id, action: "SIGNUP_TRIAL_AUTOLOGIN", resource_type: "user", resource_id: user.id, new_data: { status: sub.status },
  });
  if (auditErr) console.error("entrar-tras-prueba audit_log:", auditErr.message);
  return json(200, { token_hash: tokenHash });
});
