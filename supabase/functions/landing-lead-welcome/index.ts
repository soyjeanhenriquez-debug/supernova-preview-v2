// SUPERNOVA — Envía el correo que promete el popup de salida de /fundador/:
// "te mando 3 ofertas por correo". Cron cada 15 min: busca en landing_leads los
// correos que aún no recibieron el envío, arma las 3 ofertas del día (mismo
// origen que la landing, landing_teasers()) y las manda por Resend.
//
// Modo dry-run automático si falta RESEND_API_KEY: no envía nada, solo marca
// cuántos enviaría (mismo patrón que send-daily-digest). Así queda desplegado
// y listo; falta la llave y el dominio verificado en Resend para que salga de
// verdad — eso lo pone Jean.
//
// verify_jwt = false (lo invoca pg_cron). Compuerta: secreto de cron o admin.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { htmlToText } from "../_shared/mailtext.ts";
// eslint-disable @typescript-eslint/no-explicit-any

const APP_URL = "https://supernova-six-eta.vercel.app";
const FROM = "SUPERNOVA <hola@supernova.jeanhenriquez.com>"; // dominio verificado en Resend (25-sep-2026)
const BATCH = 40;

// deno-lint-ignore no-explicit-any
async function authorizeInternal(req: Request, admin: any): Promise<boolean> {
  const secret = req.headers.get("x-cron-secret");
  if (secret) {
    const { data } = await admin.rpc("verify_cron_secret", { p_secret: secret });
    if (data === true) return true;
  }
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (token) {
    const { data } = await admin.auth.getUser(token);
    const uid = data?.user?.id;
    if (uid) {
      const { data: role } = await admin.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
      if (role) return true;
    }
  }
  return false;
}

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const N: Record<string, string> = {
  salud_fitness: "Salud & Fitness", dinero_negocios: "Dinero & Negocios", espiritualidad: "Espiritualidad",
  relaciones: "Relaciones", tecnologia_ia: "Tecnología & IA", belleza: "Belleza", educacion: "Educación",
  desarrollo_personal: "Desarrollo personal", hogar: "Hogar", mascotas: "Mascotas", finanzas: "Finanzas",
  marketing: "Marketing", idiomas: "Idiomas", cocina: "Cocina", maternidad: "Maternidad",
  arte_creatividad: "Arte & Creatividad", musica: "Música", moda: "Moda",
};
const nice = (v: unknown) => String(v ?? "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

// deno-lint-ignore no-explicit-any
function offerCard(o: any): string {
  return `<div style="border:1px solid #ffffff15;border-radius:14px;padding:18px;margin:0 0 14px;background:#141416">
    <p style="font-size:11px;color:#86868B;margin:0 0 6px;text-transform:uppercase;letter-spacing:1px">${esc(N[o.niche] ?? nice(o.niche))} · ${esc(o.market)} · ${esc(o.days)} días pagando anuncios</p>
    <p style="font-size:16px;font-weight:600;margin:0 0 8px;color:#F5F5F7">${esc(o.name)}</p>
    <p style="font-size:13px;color:#c9c9cf;margin:0">${esc(o.why)}</p>
  </div>`;
}

// deno-lint-ignore no-explicit-any
function welcomeHtml(deck: any[], unsubToken: string): string {
  const cards = deck.map(offerCard).join("");
  return `<!doctype html><html><body style="margin:0;background:#0B0B0C;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#F5F5F7">
  <div style="max-width:540px;margin:0 auto;padding:32px 24px">
    <p style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#F5A524;margin:0 0 8px">SUPERNOVA</p>
    <h1 style="font-size:22px;margin:0 0 10px;font-family:Georgia,serif">3 negocios que están vendiendo ahora mismo</h1>
    <p style="font-size:14px;color:#c9c9cf;margin:0 0 22px">Llevan semanas pagando anuncios. Si siguen pagando, es porque les entra más de lo que gastan. Aquí están, con el porqué de cada una.</p>
    ${cards}
    <a href="${APP_URL}/fundador/?utm_source=email_popup" style="display:block;text-align:center;background:#F5A524;color:#0A0A0A;text-decoration:none;font-weight:700;padding:14px;border-radius:10px;font-size:14px;margin-top:8px">Ver el catálogo completo →</a>
    <p style="font-size:12px;color:#86868B;text-align:center;margin:16px 0 0">Antes de que cierre el precio de fundador te avisamos por aquí.</p>
    <p style="font-size:11px;color:#86868B;text-align:center;margin:24px 0 0">
      <a href="${APP_URL}/unsub?tl=${encodeURIComponent(unsubToken)}" style="color:#86868B">Dejar de recibir estos correos</a>
    </p>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (!(await authorizeInternal(req, admin))) {
    return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const dryRun = !RESEND_API_KEY;

  const { data: leads } = await admin
    .from("landing_leads")
    .select("email, unsub_token")
    .is("sent_welcome_at", null)
    .eq("unsubscribed", false)
    .order("created_at", { ascending: true })
    .limit(BATCH);
  const list = leads ?? [];
  if (list.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, note: "sin correos pendientes" }), { headers: { "Content-Type": "application/json" } });
  }

  // Las mismas 3 ofertas que ve hoy la landing (tramo 60-250 del ranking, ganadoras).
  const { data: teasers } = await admin.rpc("landing_teasers");
  const deck = Array.isArray(teasers?.deck) ? teasers.deck : [];
  if (deck.length < 3) {
    return new Response(JSON.stringify({ error: "sin ofertas de muestra hoy" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  let sent = 0, failed = 0;
  for (const lead of list) {
    let mark = true;
    if (dryRun) { sent++; continue; }
    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM, to: lead.email,
          subject: "3 negocios que están vendiendo esta semana",
          html: welcomeHtml(deck, lead.unsub_token),
          text: htmlToText(welcomeHtml(deck, lead.unsub_token)),
        }),
      });
      if (resp.ok) sent++;
      else {
        failed++; console.error("resend:", resp.status, (await resp.text()).slice(0, 200));
        // 4xx del correo (inválido) = no reintentar; 401/403/429/5xx = problema nuestro o pasajero: se reintenta.
        mark = resp.status >= 400 && resp.status < 500 && ![401, 403, 429].includes(resp.status);
      }
    } catch (e) {
      failed++; mark = false; console.error("landing-lead-welcome:", e instanceof Error ? e.message : e);
    }
    // Se marca si salió o si el correo es inválido (no reintentar uno roto). Si falló por nuestra
    // llave, el dominio, el límite de Resend o la red, se reintenta en la siguiente vuelta.
    if (mark) await admin.from("landing_leads").update({ sent_welcome_at: new Date().toISOString() }).eq("email", lead.email);
  }

  return new Response(JSON.stringify({
    ok: true, dry_run: dryRun, pending: list.length, sent, failed,
    note: dryRun ? "Sin RESEND_API_KEY: no se envió nada, solo simulación." : undefined,
  }), { headers: { "Content-Type": "application/json" } });
});
