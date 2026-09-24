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

// Packs de recarga: productos de pago único en whop.com/digitalizados/<ruta>. Se reconocen por
// la ruta o el título del producto dentro del payload (no dependen de un id que cambie).
const PACKS: Array<{ id: string; name: string; credits: number; plan: string; re?: RegExp; media?: boolean }> = [
  { id: "boost", name: "Boost 500", credits: 500, plan: "plan_ogd3Tq3dhAPU0", re: /boost[\s-]*500/i },
  { id: "power", name: "Power 2,000", credits: 2000, plan: "plan_MmMIIQFDwfLFg", re: /power[\s-]*2[\s.,-]*000/i },
  { id: "nuclear", name: "Nuclear 4,500", credits: 4500, plan: "plan_iLopCOOcLRFGb", re: /nuclear[\s-]*4[\s.,-]*500/i },
  // Media Credits (video con avatar): saldo aparte. Solo por id de plan: "Starter"/"Pro" son
  // nombres demasiado genéricos para reconocerlos por título (chocarían con los planes).
  { id: "media-starter", name: "Media Starter 50", credits: 50, plan: "plan_Om5ryuOj3N6ny", media: true },
  { id: "media-pro", name: "Media Pro 150", credits: 150, plan: "plan_LUqedwz8eidhm", media: true },
  { id: "media-scale", name: "Media Scale 400", credits: 400, plan: "plan_8TEzDcA67omY8", media: true },
];
function detectPack(data: Record<string, unknown>) {
  const hay = JSON.stringify([data.product, data.plan, data.access_pass, data.membership, data.product_title, data.plan_title, data.title, data.name, data.route, data.metadata]);
  const planId = String((data.plan as Record<string, unknown>)?.id ?? data.plan_id ?? "");
  return PACKS.find((p) => p.plan === planId) ?? PACKS.find((p) => p.re?.test(hay)) ?? null;
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
  // ── Packs de créditos (productos de pago único en Whop) ──────────────────
  // Van ANTES que la lógica de membresías: si un pack se tratara como membresía pisaría la
  // suscripción del comprador y, al "expirar" el pack, le quitaría el acceso.
  const pack = detectPack(data);
  // Rastro sin datos personales: qué producto/plan trae cada evento (para diagnosticar packs).
  console.log(`evento ${eventType} · product=${String((data.product as Record<string, unknown>)?.id ?? data.product_id ?? "?")} · plan=${String((data.plan as Record<string, unknown>)?.id ?? data.plan_id ?? "?")} · pack=${pack?.id ?? "no"}`);
  if (pack) {
    // Se acredita al ACTIVARSE el acceso al pack (membership.activated / went_valid): ese
    // evento llega tanto en compras pagadas como con cupón del 100 % (visto en producción:
    // con cupón no hay evento de pago). Los eventos de pago del pack se ignoran para no
    // acreditar dos veces; el resto (expiración, cancelación) no toca nada.
    const t = eventType.toLowerCase().replace(/[._-]/g, " ");
    const activated = t.includes("membership") && (t.includes("activat") || t.includes("valid")) && !t.includes("invalid") && !t.includes("deactivat");
    if (!activated) {
      return new Response(JSON.stringify({ ok: true, skipped: `pack:${eventType}` }), { headers: { "Content-Type": "application/json" } });
    }
    const packEmail = extractEmail(data);
    // Una acreditación por membresía y día: cubre los reintentos de Whop sin bloquear una recompra posterior.
    const paymentId = data.id ? `${String(data.id)}:${new Date().toISOString().slice(0, 10)}` : "";
    if (!packEmail || !paymentId) {
      console.error(`Pack ${pack.id}: pago sin email o sin id`);
      return new Response(JSON.stringify({ error: "Pack payment without email/id" }), { status: 422, headers: { "Content-Type": "application/json" } });
    }
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: buyerId } = await db.rpc("get_user_id_by_email", { p_email: packEmail });
    if (!buyerId) {
      // Pagó con un correo que no tiene cuenta: 409 para que Whop reintente (puede registrarse luego).
      console.error(`Pack ${pack.id}: no hay cuenta con el correo del pago`);
      return new Response(JSON.stringify({ error: "No account for this email yet" }), { status: 409, headers: { "Content-Type": "application/json" } });
    }
    // Idempotencia por pago (Whop reintenta entregas): misma tabla que Stripe, con prefijo.
    const key = `whop:${paymentId}`;
    const { error: dup } = await db.from("stripe_events").insert({ id: key, type: `whop_pack:${pack.id}` });
    if (dup) {
      return new Response(JSON.stringify({ ok: true, duplicate: true }), { headers: { "Content-Type": "application/json" } });
    }
    const { error: grantErr } = pack.media
      ? await db.rpc("grant_media_credits", { p_user_id: buyerId, p_amount: pack.credits, p_reason: `Recarga ${pack.name} (Whop)` })
      : await db.rpc("grant_purchased_credits", { p_user_id: buyerId, p_amount: pack.credits, p_label: `Recarga ${pack.name} (Whop)` });
    if (grantErr) {
      await db.from("stripe_events").delete().eq("id", key); // que el reintento pueda acreditar
      console.error("grant_purchased_credits:", grantErr.message);
      return new Response(JSON.stringify({ error: "DB error" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
    console.log(`OK pack ${pack.id} → +${pack.credits} créditos`);
    return new Response(JSON.stringify({ ok: true, pack: pack.id, credits: pack.credits }), { headers: { "Content-Type": "application/json" } });
  }

  // ── Aportes "Apoya SUPERNOVA" (pago único) ──────────────────────────────
  // Los planes viven en la tabla support_plans (Jean pega ahí el plan_id de Whop, sin redesplegar).
  // Mismo criterio que los packs: se acredita al activarse, una vez por membresía y día.
  // grant_support registra al impulsor y le da sus créditos de regalo como recarga, lo que
  // desbloquea "Crear producto".
  const evPlanId = String((data.plan as Record<string, unknown>)?.id ?? data.plan_id ?? "");
  if (/^plan_[A-Za-z0-9]{6,40}$/.test(evPlanId)) {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: sp } = await db.from("support_plans").select("plan_id,label").eq("plan_id", evPlanId).maybeSingle();
    if (sp) {
      const t = eventType.toLowerCase().replace(/[._-]/g, " ");
      const activated = t.includes("membership") && (t.includes("activat") || t.includes("valid")) && !t.includes("invalid") && !t.includes("deactivat");
      if (!activated) {
        return new Response(JSON.stringify({ ok: true, skipped: `support:${eventType}` }), { headers: { "Content-Type": "application/json" } });
      }
      const email = extractEmail(data);
      const paymentId = data.id ? `${String(data.id)}:${new Date().toISOString().slice(0, 10)}` : "";
      if (!email || !paymentId) {
        console.error(`Aporte ${sp.plan_id}: sin email o sin id`);
        return new Response(JSON.stringify({ error: "Support payment without email/id" }), { status: 422, headers: { "Content-Type": "application/json" } });
      }
      const { data: uid } = await db.rpc("get_user_id_by_email", { p_email: email });
      if (!uid) {
        console.error(`Aporte ${sp.plan_id}: no hay cuenta con el correo del pago`);
        return new Response(JSON.stringify({ error: "No account for this email yet" }), { status: 409, headers: { "Content-Type": "application/json" } });
      }
      const key = `whop:${paymentId}`;
      const { error: dup } = await db.from("stripe_events").insert({ id: key, type: `whop_support:${sp.plan_id}` });
      if (dup) return new Response(JSON.stringify({ ok: true, duplicate: true }), { headers: { "Content-Type": "application/json" } });
      const { data: g, error: gErr } = await db.rpc("grant_support", { p_user_id: uid, p_plan_id: sp.plan_id });
      if (gErr || g?.success !== true) {
        await db.from("stripe_events").delete().eq("id", key);
        console.error("grant_support:", gErr?.message ?? g?.error);
        return new Response(JSON.stringify({ error: "DB error" }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
      console.log(`OK aporte ${sp.label} → +${g.credits} créditos`);
      return new Response(JSON.stringify({ ok: true, support: sp.plan_id, credits: g.credits }), { headers: { "Content-Type": "application/json" } });
    }
  }

  // ── Otros productos de Jean en la misma cuenta de Whop (tabla whop_other_plans) ──
  // Sus ventas se anotan en whop_product_sales para el agente de ventas y NUNCA dan acceso a
  // SUPERNOVA (antes cualquier membresía se volvía suscripción de la app).
  if (/^plan_[A-Za-z0-9]{6,40}$/.test(evPlanId)) {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: other } = await db.from("whop_other_plans").select("plan_id,product").eq("plan_id", evPlanId).maybeSingle();
    if (other) {
      const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)) ? Number(v) : null);
      const { error: saleErr } = await db.from("whop_product_sales").insert({
        plan_id: other.plan_id, product: other.product, event: eventType.slice(0, 80),
        status: mapEvent(eventType, data), email: extractEmail(data) || null,
        membership_id: data.id ? String(data.id).slice(0, 80) : null,
        amount: num(data.final_amount ?? data.amount ?? data.subtotal ?? data.total),
        currency: typeof data.currency === "string" ? data.currency.slice(0, 8) : null,
      });
      if (saleErr) console.error("whop_product_sales:", saleErr.message);
      console.log(`Otro producto ${other.product}: ${eventType}`);
      return new Response(JSON.stringify({ ok: true, other_product: other.product }), { headers: { "Content-Type": "application/json" } });
    }
  }

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
