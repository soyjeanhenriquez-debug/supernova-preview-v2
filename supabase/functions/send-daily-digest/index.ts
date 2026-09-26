// SUPERNOVA — Digest diario "Ganador del Día" por email.
// Motor de retención: cada mañana un email con el ganador del día → click →
// vuelta a la plataforma (patrón Duolingo). Canal-agnóstico: hoy email vía
// Resend, mañana WhatsApp con la misma estructura de destinatarios.
//
// Se dispara por cron (supernova-daily-digest). Modo dry-run automático si no
// hay RESEND_API_KEY: no envía, solo reporta a quién enviaría.
// verify_jwt false (la invoca pg_cron) + compuerta interna: secreto de cron o
// admin con sesión.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { htmlToText } from "../_shared/mailtext.ts";
// eslint-disable @typescript-eslint/no-explicit-any

const APP_URL = "https://supernova-six-eta.vercel.app";
const FROM = "SUPERNOVA <hola@supernova.jeanhenriquez.com>"; // dominio verificado en Resend (25-sep-2026)

// ── Compuerta interna ───────────────────────────────────────────────────
// Esta función corre sin JWT porque la invoca pg_cron. Solo pasa quien trae el
// secreto de cron (vive en Vault y se compara DENTRO de la base: aquí nunca se
// conoce) o un admin con sesión. Sin esto, cualquiera con la URL la ejecutaba.
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

// El título y el cuerpo vienen de anuncios de terceros (scrapeados). Sin
// escapar, un anunciante podía meter HTML/enlaces propios en un correo que
// sale desde nuestro dominio hacia toda la lista.
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const N: Record<string, string> = {
  salud_fitness: "salud y bienestar", dinero_negocios: "dinero y negocios", marketing_ventas: "marketing y ventas",
  desarrollo_personal: "desarrollo personal", relaciones: "relaciones", educacion_idiomas: "educación e idiomas",
  tecnologia_ia: "tecnología e IA", belleza_moda: "belleza", hogar_mascotas: "hogar y mascotas", espiritualidad: "espiritualidad",
  infantil_familia: "familia", gastronomia_recetas: "recetas", finanzas_trading: "finanzas",
};

/**
 * "El negocio de hoy": UNA oferta ganadora (digital, curada, la primera del día de landing_teasers) y
 * un solo paso: clonarla en Mi negocio. Voz de Jean, sin rachas (se quitaron el 23-sep) ni promesas.
 */
// deno-lint-ignore no-explicit-any
function digestHtml(name: string, o: any, unsubToken: string): string {
  const p = (t: string) => `<p style="margin:0 0 14px">${t}</p>`;
  const nicho = N[o.niche] ?? "su nicho";
  return `<!doctype html><html><body style="margin:0;background:#ffffff">
  <div style="max-width:560px;margin:0 auto;padding:28px 22px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1c1917;font-size:16px;line-height:1.6">
    ${p(`Hola${name ? ` ${esc(name)}` : ""}.`)}
    ${p(`Hoy te traigo uno de ${esc(nicho)} que lleva <b>${esc(o.days)} días pagando anuncios</b>${o.ads > 1 ? ` y tiene <b>${esc(o.ads)} anuncios corriendo a la vez</b>` : ""}.`)}
    <div style="border:1px solid #e7e5e4;border-radius:12px;padding:16px 18px;margin:0 0 16px;background:#fafaf9">
      <p style="font-size:16px;font-weight:600;margin:0 0 6px;color:#1c1917">${esc(o.name)}</p>
      <p style="font-size:14px;color:#44403c;margin:0">${esc(o.why)}</p>
    </div>
    ${o.ads > 1 ? p("Fíjate en ese número. Quien pone varios anuncios del mismo producto no está probando. Está escalando. Y nadie escala algo que le hace perder dinero.") : p("Un anuncio que aguanta tantos días arriba no es suerte. Es un producto que se vende.")}
    ${p("La pregunta no es si funciona. Eso ya lo sabemos.")}
    ${p("La pregunta es si tú lo harías tuyo.")}
    ${p("En <b>Mi negocio</b> lo clonas en 3 toques: mismo producto, misma estructura, tu idioma y el precio en tu moneda. Gratis.")}
    <p style="margin:22px 0"><a href="${APP_URL}/app?utm_source=digest&utm_medium=email" style="display:inline-block;background:#1c1917;color:#ffffff;text-decoration:none;font-weight:600;padding:13px 22px;border-radius:10px">Ver el negocio de hoy</a></p>
    ${p("Jean")}
    <p style="margin:18px 0 0;color:#44403c;font-size:15px"><b>P.D.</b> ¿Te da pena grabarte? En <b>Vende sin mostrar tu cara</b> un personaje creado con IA da la cara por ti. Tú solo publicas.</p>
    <p style="font-size:12px;color:#a8a29e;margin:28px 0 0">Te llega un negocio así cada mañana. <a href="${APP_URL}/unsub?t=${encodeURIComponent(unsubToken)}" style="color:#a8a29e">Dejar de recibir estos correos</a></p>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  if (!(await authorizeInternal(req, admin))) {
    return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const today = new Date().toISOString().slice(0, 10);

  // 1) El negocio de hoy (mismo para todos): la primera oferta ganadora del día, ya calculada en
  //    landing_teasers (caché, 1 ms). Antes salía de winning_ads (cualquier idioma y consulta pesada).
  const { data: teasers } = await admin.rpc("landing_teasers");
  const winner = Array.isArray(teasers?.deck) ? teasers.deck[0] : null;
  if (!winner) {
    return new Response(JSON.stringify({ error: "sin negocio del día" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  // 2) Destinatarios opt-in que aún no recibieron hoy. Solo cuentas con el correo CONFIRMADO y
  //    acceso vigente (RPC digest_recipients): antes bastaba registrarse con un correo ajeno, sin
  //    confirmarlo, para que le llegara este correo cada día desde nuestro dominio.
  const { data: recipients } = await admin.rpc("digest_recipients", { p_today: today, p_limit: 500 });

  const list = recipients ?? [];
  const dryRun = !RESEND_API_KEY;
  // Nombre de cada persona (perfil), no lo que va antes de la @ del correo.
  const ids = list.map((r: { user_id: string }) => r.user_id).filter(Boolean);
  const { data: profs } = ids.length ? await admin.from("profiles").select("user_id, display_name").in("user_id", ids) : { data: [] };
  const names = new Map((profs ?? []).map((x: { user_id: string; display_name: string | null }) => [x.user_id, (x.display_name ?? "").trim().split(/\s+/)[0]]));
  let sent = 0, failed = 0;

  for (const r of list) {
    const name = names.get(r.user_id) || "";
    if (dryRun) { sent++; continue; }
    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM,
          to: r.email,
          subject: `${winner.days} días vendiendo. ¿Lo harías tuyo?`,
          html: digestHtml(name, winner, r.unsub_token),
          text: htmlToText(digestHtml(name, winner, r.unsub_token)),
        }),
      });
      if (resp.ok) {
        sent++;
        await admin.from("notification_prefs").update({ last_digest_sent: today }).eq("user_id", r.user_id);
      } else { failed++; }
    } catch { failed++; }
  }

  return new Response(JSON.stringify({
    ok: true, dry_run: dryRun, winner: winner.name,
    recipients: list.length, sent, failed,
    note: dryRun ? "Sin RESEND_API_KEY: no se envió nada, solo simulación." : undefined,
  }), { headers: { "Content-Type": "application/json" } });
});
