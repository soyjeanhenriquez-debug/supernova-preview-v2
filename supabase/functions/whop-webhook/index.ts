import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Webhook de Whop → sincroniza public.subscriptions.
 *
 * Configuración:
 *  - Secret: WHOP_WEBHOOK_SECRET (Supabase → Edge Functions → Secrets).
 *    Copia el "Webhook Secret" que Whop muestra al crear el webhook
 *    (formato Standard Webhooks, normalmente prefijo `whsec_`).
 *  - En Whop (dashboard → Developers → Webhooks) apunta a:
 *    https://krfdoofwhtcxbyhkjoik.supabase.co/functions/v1/whop-webhook
 *    Eventos: membership_activated, membership_deactivated, invoice_paid,
 *    invoice_past_due, membership_trial_ending_soon.
 *
 * Whop sigue el spec Standard Webhooks:
 *   headers: webhook-id, webhook-timestamp, webhook-signature
 *   signed_content = "{id}.{timestamp}.{body}"
 *   signature = base64(HMAC_SHA256(secret, signed_content)), en header como "v1,<sig>"
 * Se mantiene un fallback legacy (x-whop-signature, hex sobre el body) por si
 * llega un webhook del esquema antiguo.
 */

const enc = new TextEncoder();

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * Candidatos de clave HMAC derivados del secret. Whop puede entregar el secret
 * en varios formatos (`whsec_<base64>` estándar, `ws_<hex>` propio, o crudo);
 * probamos todas las interpretaciones deterministas. Sin el secret real ninguna
 * coincide, así que probar varias no debilita la seguridad — solo resuelve la
 * ambigüedad de formato.
 */
function candidateKeys(secret: string): Uint8Array[] {
  const keys: Uint8Array[] = [enc.encode(secret)]; // string completo como UTF-8
  if (secret.startsWith("whsec_")) {
    try { keys.push(b64ToBytes(secret.slice(6))); } catch { /* no base64 */ }
  }
  if (secret.startsWith("ws_")) {
    const rest = secret.slice(3);
    keys.push(enc.encode(rest));           // hex como string UTF-8
    const hb = hexToBytes(rest);
    if (hb) keys.push(hb);                  // hex decodificado a bytes
  }
  return keys;
}

async function hmacBase64(rawKey: Uint8Array, content: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", rawKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(content));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function hmacHex(rawKey: Uint8Array, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", rawKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/** Verifica Standard Webhooks; si no hay headers nuevos, cae al esquema legacy.
 *  Prueba cada candidato de clave para tolerar el formato del secret de Whop. */
async function verifySignature(req: Request, secret: string, body: string): Promise<boolean> {
  const keys = candidateKeys(secret);

  const swSig = req.headers.get("webhook-signature");
  if (swSig) {
    const id = req.headers.get("webhook-id") ?? "";
    const ts = req.headers.get("webhook-timestamp") ?? "";
    const signedContent = `${id}.${ts}.${body}`;
    // El header es una lista separada por espacios de "v1,<base64>"
    const received = swSig.split(" ").map((p) => (p.includes(",") ? p.split(",")[1] : p)).filter(Boolean);
    for (const key of keys) {
      const expected = await hmacBase64(key, signedContent);
      for (const sig of received) if (timingSafeEqual(sig, expected)) return true;
    }
    return false;
  }

  // Fallback legacy: x-whop-signature = hex(hmac(secret, body)), a veces con "sha256="
  const legacy = req.headers.get("x-whop-signature");
  if (legacy) {
    const received = legacy.replace(/^sha256=/, "").trim().toLowerCase();
    for (const key of keys) {
      if (received && timingSafeEqual(received, await hmacHex(key, body))) return true;
    }
    return false;
  }
  return false;
}

type SubStatus = "active" | "trialing" | "past_due" | "canceled" | "inactive";

/** Mapea el nombre del evento a un estado, tolerante a puntos/guiones y a la
 *  nomenclatura payment.* vs invoice_*. */
function mapEvent(rawType: string, data: Record<string, unknown>): SubStatus | null {
  const t = rawType.toLowerCase().replace(/[._-]/g, " ");
  const status = String((data?.status as string) ?? "").toLowerCase();
  const isTrial = status.includes("trial");

  const has = (...words: string[]) => words.every((w) => t.includes(w));

  // Membresía activada / válida
  if (has("membership") && (t.includes("activat") || t.includes("valid") || t.includes("went valid"))) {
    return isTrial ? "trialing" : "active";
  }
  // Membresía dada de baja / inválida / cancelada / expirada
  if (has("membership") && (t.includes("deactivat") || t.includes("invalid") || t.includes("cancel") || t.includes("expire"))) {
    return "canceled";
  }
  // Pago exitoso (payment.succeeded / invoice_paid)
  if ((t.includes("payment") || t.includes("invoice")) && (t.includes("succeed") || t.includes("paid"))) {
    return "active";
  }
  // Pago fallido / vencido / incobrable
  if ((t.includes("payment") || t.includes("invoice")) && (t.includes("fail") || t.includes("past due") || t.includes("uncollectible"))) {
    return "past_due";
  }
  return null; // evento que no nos interesa
}

/** Busca el email en las rutas conocidas del payload de Whop (User expandido). */
function extractEmail(data: Record<string, unknown>): string {
  const paths: unknown[] = [
    (data.user as Record<string, unknown>)?.email,
    (data.member as Record<string, unknown>)?.email,
    (data.customer as Record<string, unknown>)?.email,
    ((data.membership as Record<string, unknown>)?.user as Record<string, unknown>)?.email,
    data.email,
    data.user_email,
  ];
  for (const p of paths) {
    if (typeof p === "string" && p.includes("@")) return p.toLowerCase().trim();
  }
  return "";
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const secret = Deno.env.get("WHOP_WEBHOOK_SECRET");
  if (!secret) {
    console.error("WHOP_WEBHOOK_SECRET no configurado");
    return new Response(JSON.stringify({ error: "Webhook not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.text();

  const valid = await verifySignature(req, secret, body);
  if (!valid) {
    console.error("Firma inválida");
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload: { type?: string; action?: string; event?: string; data?: Record<string, unknown> };
  try {
    payload = JSON.parse(body);
  } catch (e) {
    console.error("JSON inválido:", e);
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const eventType = payload.type ?? payload.action ?? payload.event ?? "";
  const data = payload.data ?? {};
  const newStatus = mapEvent(eventType, data);
  if (!newStatus) {
    return new Response(JSON.stringify({ ok: true, skipped: eventType }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const email = extractEmail(data);
  if (!email) {
    console.error(`Evento ${eventType} sin email`, JSON.stringify(data).slice(0, 500));
    return new Response(JSON.stringify({ error: "No email in payload" }), {
      status: 422,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Vincular con el usuario de la app si ya existe
  const { data: userId } = await supabaseAdmin.rpc("get_user_id_by_email", {
    p_email: email,
  });

  const membershipId = String(data.id ?? data.membership_id ?? "") || null;
  const planId = String(data.plan_id ?? (data.plan as Record<string, unknown>)?.id ?? "") || null;
  const periodEnd = data.renewal_period_end ?? data.expires_at ?? data.valid_until ?? null;

  const { error } = await supabaseAdmin.from("subscriptions").upsert(
    {
      email,
      user_id: userId,
      whop_membership_id: membershipId,
      plan_id: planId,
      status: newStatus,
      current_period_end: periodEnd ? new Date(periodEnd as string).toISOString() : null,
      raw: { type: eventType, data },
    },
    { onConflict: "email" },
  );

  if (error) {
    console.error("Upsert error:", error);
    return new Response(JSON.stringify({ error: "DB error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Suscriptor pagando = acceso garantizado aunque venga de fuera del funnel
  await supabaseAdmin.from("approved_emails").upsert(
    { email, notes: `Whop ${newStatus} (${eventType})`, is_active: newStatus === "active" || newStatus === "trialing" },
    { onConflict: "email" },
  );

  console.log(`OK ${eventType} → ${email} → ${newStatus}`);
  return new Response(JSON.stringify({ ok: true, email, status: newStatus }), {
    headers: { "Content-Type": "application/json" },
  });
});
