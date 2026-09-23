// SUPERNOVA — Correo diario de alertas para el admin (8:00 hora RD).
// Lee el informe admin_health_report (pantallazos de clientes, tareas automáticas
// fallidas, videos fallidos, radar parado, clientes en prueba sin usar la app) y,
// si hay algo, lo manda por correo. Si no hay alertas no manda nada: un correo
// diario de "todo bien" se deja de leer a la semana.
//
// Dry-run automático sin RESEND_API_KEY (mismo patrón que landing-lead-welcome):
// responde con las alertas que habría mandado. El panel Admin → Salud muestra lo
// mismo en vivo (src/components/admin/HealthAlerts.tsx: si cambias las reglas de
// alerta aquí, cámbialas también allí).
//
// verify_jwt = false (lo invoca pg_cron). Compuerta: secreto de cron o admin.
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_URL = "https://supernova-six-eta.vercel.app";
const FROM = "SUPERNOVA <noreply@supernova.app>"; // ajustar al dominio verificado en Resend
const DEFAULT_TO = "soyjeanhenriquez@gmail.com";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

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

type Report = {
  client_errors: { count: number; users: number; top: { message: string; n: number; who: string }[] };
  cron_failures: { job: string; fails: number; runs: number; sample: string }[];
  media_failures: { count: number; sample: string | null };
  radar: { last_scraped: string | null; new_24h: number };
  customers: { email: string; status: string; hours_left: number; ai_actions: number; mandala_ads: number; has_business: boolean }[];
  signups_24h: number;
};
type Alert = { level: "bad" | "warn"; title: string; detail: string };

function reportAlerts(r: Report): Alert[] {
  const out: Alert[] = [];
  if (r.client_errors.count > 0) {
    const top = r.client_errors.top[0];
    out.push({ level: "bad", title: `${r.client_errors.count} pantallazos de clientes (${r.client_errors.users} personas)`,
      detail: top ? `El más repetido (${top.n}×, ${top.who}): ${top.message}` : "" });
  }
  for (const c of r.cron_failures) {
    out.push({ level: c.fails >= c.runs / 2 ? "bad" : "warn", title: `Tarea automática "${c.job}" falló ${c.fails} de ${c.runs} veces`,
      detail: c.sample.split("\n")[0] });
  }
  if (r.media_failures.count > 0) {
    out.push({ level: "warn", title: `${r.media_failures.count} videos de Media Studio fallaron`, detail: r.media_failures.sample ?? "" });
  }
  const radarHours = r.radar.last_scraped ? (Date.now() - new Date(r.radar.last_scraped).getTime()) / 36e5 : Infinity;
  if (radarHours > 6) {
    out.push({ level: "bad", title: "El radar lleva más de 6 horas sin anuncios nuevos", detail: `Último: ${r.radar.last_scraped ?? "más de 3 días"}` });
  }
  for (const c of r.customers) {
    if (c.status === "trialing" && c.ai_actions === 0 && c.mandala_ads === 0 && !c.has_business) {
      out.push({ level: c.hours_left <= 36 ? "bad" : "warn", title: `${c.email} está en prueba y no ha usado nada`,
        detail: `Le quedan ${c.hours_left} h de prueba. Escríbele hoy: quien no usa la app en la prueba casi nunca paga.` });
    }
  }
  return out;
}

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (!(await authorizeInternal(req, admin))) return json(401, { error: "No autorizado" });

  const { data, error } = await admin.rpc("admin_health_report");
  if (error || !data) {
    console.error("health-alert: informe", error?.message);
    return json(500, { error: "No se pudo leer el informe" });
  }
  const report = data as Report;
  const alerts = reportAlerts(report);
  if (alerts.length === 0) return json(200, { ok: true, alerts: 0, sent: false });

  const bad = alerts.filter((a) => a.level === "bad").length;
  const subject = `SUPERNOVA · ${alerts.length} alerta${alerts.length === 1 ? "" : "s"}${bad ? ` (${bad} urgente${bad === 1 ? "" : "s"})` : ""}`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#111">
    <h2 style="margin:0 0 4px">Alertas de las últimas 24 horas</h2>
    <p style="color:#666;margin:0 0 16px">Registros nuevos: ${report.signups_24h} · Anuncios nuevos en el radar: ${report.radar.new_24h}</p>
    ${alerts.map((a) => `<div style="border-left:4px solid ${a.level === "bad" ? "#dc2626" : "#f59e0b"};padding:8px 12px;margin:0 0 10px;background:#fafafa">
      <b>${esc(a.title)}</b>${a.detail ? `<div style="color:#555;font-size:13px;margin-top:4px">${esc(a.detail)}</div>` : ""}</div>`).join("")}
    <p style="margin-top:18px"><a href="${APP_URL}/admin/salud">Abrir Admin → Salud</a></p></div>`;

  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return json(200, { ok: true, dry_run: true, alerts: alerts.length, subject, note: "Sin RESEND_API_KEY: no se envió nada." });

  const to = Deno.env.get("ADMIN_ALERT_EMAIL") || DEFAULT_TO;
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!resp.ok) {
    console.error("health-alert: resend", resp.status, (await resp.text()).slice(0, 200));
    return json(502, { error: "No se pudo enviar el correo" });
  }
  return json(200, { ok: true, alerts: alerts.length, sent: true });
});
