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
// eslint-disable @typescript-eslint/no-explicit-any

const APP_URL = "https://supernova-six-eta.vercel.app";
const FROM = "SUPERNOVA <noreply@supernova.app>"; // ajustar al dominio verificado en Resend

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

// deno-lint-ignore no-explicit-any
function digestHtml(name: string, ad: any, unsubToken: string): string {
  const body = String(ad.ad_body ?? ad.ad_title ?? "").slice(0, 240);
  return `<!doctype html><html><body style="margin:0;background:#0B0B0C;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#F5F5F7">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <p style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#C5A880;margin:0 0 8px">🏆 Ganador del Día</p>
    <h1 style="font-size:22px;margin:0 0 6px;font-family:Georgia,serif">Hola ${esc(name)}, esto está vendiendo hoy</h1>
    <div style="border:1px solid #ffffff15;border-radius:14px;padding:20px;margin:20px 0;background:#141416">
      <p style="font-size:12px;color:#86868B;margin:0 0 4px">${esc(ad.market ?? "")} · ${esc(ad.days_active ?? "?")} días activo · ${esc(ad.duplicate_count ?? 1)} anuncios corriendo</p>
      <p style="font-size:17px;font-weight:600;margin:0 0 8px">${esc(ad.ad_title ?? "Anuncio ganador")}</p>
      <p style="font-size:14px;color:#c9c9cf;font-style:italic;margin:0">"${esc(body)}${body.length >= 240 ? "…" : ""}"</p>
    </div>
    <a href="${APP_URL}/?utm_source=digest&utm_medium=email" style="display:block;text-align:center;background:#C5A880;color:#000;text-decoration:none;font-weight:600;padding:14px;border-radius:10px;font-size:14px">🧬 Crear mi versión de esto →</a>
    <p style="font-size:12px;color:#86868B;text-align:center;margin:16px 0 0">Tu racha te espera. No la rompas 🔥</p>
    <p style="font-size:11px;color:#86868B;text-align:center;margin:24px 0 0">
      <a href="${APP_URL}/unsub?t=${encodeURIComponent(unsubToken)}" style="color:#86868B">Dejar de recibir estos correos</a>
    </p>
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

  // 1) Ganador del día (mismo para todos)
  const { data: winnerRows } = await admin.rpc("get_daily_winner");
  const winner = Array.isArray(winnerRows) ? winnerRows[0] : winnerRows;
  if (!winner) {
    return new Response(JSON.stringify({ error: "no daily winner" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  // 2) Destinatarios opt-in que aún no recibieron hoy. Solo cuentas con el correo CONFIRMADO y
  //    acceso vigente (RPC digest_recipients): antes bastaba registrarse con un correo ajeno, sin
  //    confirmarlo, para que le llegara este correo cada día desde nuestro dominio.
  const { data: recipients } = await admin.rpc("digest_recipients", { p_today: today, p_limit: 500 });

  const list = recipients ?? [];
  const dryRun = !RESEND_API_KEY;
  let sent = 0, failed = 0;

  for (const r of list) {
    const name = r.email.split("@")[0];
    if (dryRun) { sent++; continue; }
    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM,
          to: r.email,
          subject: `🏆 El ganador de hoy: ${String(winner.ad_title ?? "míralo ahora").replace(/[\r\n]+/g, " ").slice(0, 40)}`,
          html: digestHtml(name, winner, r.unsub_token),
        }),
      });
      if (resp.ok) {
        sent++;
        await admin.from("notification_prefs").update({ last_digest_sent: today }).eq("user_id", r.user_id);
      } else { failed++; }
    } catch { failed++; }
  }

  return new Response(JSON.stringify({
    ok: true, dry_run: dryRun, winner: winner.ad_title,
    recipients: list.length, sent, failed,
    note: dryRun ? "Sin RESEND_API_KEY: no se envió nada, solo simulación." : undefined,
  }), { headers: { "Content-Type": "application/json" } });
});
