// SUPERNOVA — Admin → Mensajes: el dueño escribe y envía correos desde la app (Resend).
//
// Compuerta: usuario real con rol admin (verify_jwt no protege; ver chequeo-seguridad).
// Acciones:
//   count   { segment }                         → cuántos recibirían (sin enviar) + 3 ejemplos
//   send    { segment | to, subject, body, test } → envía; test = solo al correo del admin
//   history {}                                  → últimos envíos
// Los destinatarios los arma el servidor (admin_email_recipients: nunca incluye bajas). Los envíos a
// grupos llevan enlace de baja de un clic (/unsub?t= o ?tl=). {{nombre}} se reemplaza por persona.
// Resend: lotes de 100 (API batch), tope 500 por envío para no quemar el plan ni la reputación.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_URL = "https://supernova-six-eta.vercel.app";
const FROM = "SUPERNOVA <hola@supernova.jeanhenriquez.com>";
const SEGMENTS = new Set(["todos", "prueba", "pagando", "comunidad", "vencen", "sin_plan", "avisame", "leads"]);
const MAX_RECIPIENTS = 500;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** {{nombre}} → " Carolina" o nada (sin nombre no queda "Hola ,"). */
const withName = (s: string, name: string | null) => s.replace(/\s*\{\{\s*nombre\s*\}\}/gi, name ? ` ${name}` : "").replace(/^\s+/, "");

/** Texto plano → HTML sencillo: párrafos, saltos de línea, **negrita** y enlaces https automáticos. */
function toHtml(body: string, name: string | null, unsub: string | null) {
  const text = withName(body, name);
  const paras = esc(text).split(/\n{2,}/).map(p => p
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" style="color:#b45309">$1</a>')
    .replace(/\n/g, "<br>"));
  return `<div style="font-family:-apple-system,system-ui,sans-serif;max-width:560px;margin:auto;color:#111;font-size:15px;line-height:1.6">
    ${paras.map(p => `<p style="margin:0 0 14px">${p}</p>`).join("")}
    <p style="margin:24px 0 0;color:#888;font-size:12px">SUPERNOVA · <a href="${APP_URL}/app" style="color:#888">Entrar a la app</a>${unsub ? ` · <a href="${APP_URL}/unsub?${unsub}" style="color:#888">Dejar de recibir estos correos</a>` : ""}</p>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = admin();
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const { data: u } = token ? await db.auth.getUser(token) : { data: null };
    const me = u?.user;
    if (!me) return json({ error: "Inicia sesión." }, 401);
    const { data: role } = await db.from("user_roles").select("role").eq("user_id", me.id).eq("role", "admin").maybeSingle();
    if (!role) return json({ error: "Solo administradores." }, 403);

    const raw = await req.text();
    if (raw.length > 60_000) return json({ error: "El mensaje es demasiado largo." }, 413);
    const body = raw ? JSON.parse(raw) : {};

    if (body.action === "history") {
      const { data } = await db.from("admin_email_log").select("segment,subject,recipients,sent,failed,test,created_at").order("created_at", { ascending: false }).limit(20);
      return json({ history: data ?? [] });
    }

    // Destinatarios: un correo suelto o un grupo (armado por el servidor, sin bajas).
    const single = typeof body.to === "string" ? body.to.trim().toLowerCase() : "";
    const segment = typeof body.segment === "string" ? body.segment : "";
    if (!single && !SEGMENTS.has(segment)) return json({ error: "Elige a quién enviar." }, 400);
    if (single && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(single)) return json({ error: "Ese correo no es válido." }, 400);

    let list: { email: string; name: string | null; unsub: string | null }[] = [];
    if (single) list = [{ email: single, name: null, unsub: null }];
    else {
      const { data, error } = await db.rpc("admin_email_recipients", { p_segment: segment });
      if (error) return json({ error: "No se pudo armar la lista." }, 500);
      list = (data ?? []) as typeof list;
    }

    if (body.action === "count") {
      return json({ count: list.length, sample: list.slice(0, 3).map(r => r.email), capped: list.length > MAX_RECIPIENTS });
    }

    // send
    const subject = String(body.subject ?? "").trim().slice(0, 150);
    const text = String(body.body ?? "").trim().slice(0, 20_000);
    if (!subject || !text) return json({ error: "Escribe el asunto y el mensaje." }, 400);
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return json({ error: "Falta RESEND_API_KEY en Supabase." }, 503);

    const test = body.test === true;
    // Prueba: solo al admin, con el primer destinatario como ejemplo para ver {{nombre}} y la baja.
    const targets = test
      ? [{ email: (me.email ?? "").toLowerCase(), name: list[0]?.name ?? "Jean", unsub: single ? null : (list[0]?.unsub ?? null) }]
      : list.slice(0, MAX_RECIPIENTS);
    if (!targets.length || !targets[0].email) return json({ error: "No hay destinatarios en ese grupo." }, 400);

    let sent = 0, failed = 0;
    for (let i = 0; i < targets.length; i += 100) {
      const batch = targets.slice(i, i + 100).map(r => ({
        from: FROM, to: r.email, reply_to: me.email ?? undefined, // el dominio de envío no recibe: las respuestas van al admin
        subject: (test ? "[Prueba] " : "") + withName(subject, r.name),
        html: toHtml(text, r.name, single && !test ? null : r.unsub),
        ...(r.unsub ? { headers: { "List-Unsubscribe": `<${APP_URL}/unsub?${r.unsub}>` } } : {}),
      }));
      const resp = await fetch("https://api.resend.com/emails/batch", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(batch),
      });
      if (resp.ok) sent += batch.length;
      else { failed += batch.length; console.error("resend:", resp.status, (await resp.text()).slice(0, 300)); }
      if (i + 100 < targets.length) await new Promise(r => setTimeout(r, 1100)); // límite de Resend: ~2 por segundo
    }

    await db.from("admin_email_log").insert({
      sent_by: me.id, segment: single ? `correo: ${single}` : segment, subject, recipients: targets.length, sent, failed, test,
    });
    if (!sent) return json({ error: "Resend no aceptó el envío. Revisa el dominio y el plan en resend.com." }, 502);
    return json({ ok: true, sent, failed, capped: !test && list.length > MAX_RECIPIENTS });
  } catch (e) {
    console.error("admin-email:", e);
    return json({ error: "No se pudo enviar." }, 500);
  }
});
