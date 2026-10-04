// SUPERNOVA — Generador de creativo de anuncio (imagen estática). Principal: APIMart (GPT Image 2,
// asíncrono, se consulta hasta que termina). Respaldo: Gemini "Nano Banana" directo con el mismo
// GEMINI_API_KEY/LOVABLE_API_KEY del texto. La imagen vuelve en la misma respuesta.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient as createGuardClient } from "npm:@supabase/supabase-js@2";

interface Body {
  prompt: string;
  aspectRatio?: "1:1" | "4:5" | "9:16" | "16:9"; // feed Meta / feed vertical Meta / Stories-Reels-TikTok / miniatura YouTube
}

const ASPECT_HINT: Record<string, string> = {
  "1:1": "square 1:1 format, Instagram/Facebook feed ad",
  "4:5": "vertical 4:5 format, Instagram/Facebook feed ad",
  "9:16": "vertical 9:16 full-screen format, Instagram/TikTok Stories and Reels ad",
  // Miniaturas (Estudio de imágenes): portada horizontal de YouTube.
  "16:9": "horizontal 16:9 format, YouTube video thumbnail, bold and readable at small size",
};

// ── APIMart (03-oct-2026): proveedor principal de imágenes, GPT Image 2 a ~US$0,0081 por imagen
// (Gemini directo cuesta ~US$0,039). Es asíncrono: se crea la tarea y se consulta hasta que termina.
// Si no hay llave o algo falla, se usa Gemini como respaldo (el cobro ya hecho no cambia).
const APIMART = "https://api.apimart.ai/v1";
const APIMART_MODEL = "gpt-image-2";

// Base64 sin dependencias (los imports jsr:@std han fallado al arrancar workers en Supabase).
function encodeBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function apimartImage(prompt: string, aspect: string): Promise<{ b64: string; mime: string } | null> {
  const key = Deno.env.get("APIMART_API_KEY");
  if (!key) return null;
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  try {
    // El texto va entero (ahí están las reglas: sin dinero, sin marcas); si APIMart lo rechaza por
    // largo, se reintenta recortado a 1.000 caracteres.
    const create = (p: string) => fetch(`${APIMART}/images/generations`, {
      method: "POST", headers,
      body: JSON.stringify({ model: APIMART_MODEL, prompt: p, size: aspect, resolution: "1k", n: 1 }),
    });
    let r = await create(prompt.slice(0, 2000));
    if (r.status === 400 && prompt.length > 1000) { await r.text(); r = await create(prompt.slice(0, 1000)); }
    if (!r.ok) { console.error("apimart crear:", r.status, (await r.text()).slice(0, 300)); return null; }
    const created = await r.json();
    const taskId = created?.data?.[0]?.task_id ?? created?.data?.task_id;
    if (!taskId) { console.error("apimart sin task_id:", JSON.stringify(created).slice(0, 300)); return null; }
    // Hasta ~90 s: GPT Image 2 suele tardar 15-40 s.
    for (let i = 0; i < 36; i++) {
      await new Promise(res => setTimeout(res, 2500));
      const t = await fetch(`${APIMART}/tasks/${encodeURIComponent(taskId)}`, { headers });
      if (!t.ok) continue;
      const d = (await t.json())?.data;
      if (d?.status === "failed" || d?.status === "cancelled") { console.error("apimart tarea:", d?.status); return null; }
      if (d?.status !== "completed") continue;
      const first = d?.result?.images?.[0]?.url;
      const url = Array.isArray(first) ? first[0] : first;
      if (typeof url !== "string" || !url.startsWith("https://")) return null;
      const img = await fetch(url);
      if (!img.ok) return null;
      const mime = img.headers.get("content-type")?.split(";")[0] || "image/png";
      return { b64: encodeBase64(new Uint8Array(await img.arrayBuffer())), mime };
    }
    console.error("apimart: tiempo agotado");
    return null;
  } catch (e) {
    console.error("apimart:", e instanceof Error ? e.message : e);
    return null;
  }
}

// Tope de tamaño del cuerpo: este texto acaba en un modelo que cobra por token.
// deno-lint-ignore no-explicit-any
async function readJson(req: Request, maxChars: number): Promise<any> {
  const raw = await req.text();
  if (raw.length > maxChars) throw new Error("La solicitud es demasiado grande.");
  return raw ? JSON.parse(raw) : {};
}

// ── Compuerta de usuario + cobro en el servidor ─────────────────────────
// verify_jwt del gateway NO basta: la llave pública (anon) que viaja en el
// bundle de la web también es un JWT válido. Aquí se exige un USUARIO real con
// acceso vigente, se aplica el tope de uso y —si la acción tiene precio— se
// cobra ANTES de gastar dinero real (RPC edge_guard_charge; el precio lo decide
// la tabla credit_prices, nunca el cliente). Si después la IA falla,
// refundCharge() devuelve el crédito.
interface Gate { userId: string; txId: string | null; charged: number; balance: number | null; receipt: string | null }
interface Billing { action: string; label?: string; kind?: string; receipt?: unknown }

function guardClient() {
  return createGuardClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requireUser(req: Request, fn: string, maxHour: number, maxDay: number, billing?: Billing): Promise<Gate | Response> {
  const deny = (status: number, error: string, extra: Record<string, unknown> = {}) =>
    new Response(JSON.stringify({ error, ...extra }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return deny(401, "Inicia sesión para usar esta función.");
  const guard = guardClient();
  const { data } = await guard.auth.getUser(token);
  const userId = data?.user?.id;
  if (!userId) return deny(401, "Sesión inválida o expirada. Vuelve a iniciar sesión.");
  const receipt = typeof billing?.receipt === "string" && /^[0-9a-f-]{36}$/i.test(billing.receipt) ? billing.receipt : null;
  const { data: g, error } = await guard.rpc("edge_guard_charge", {
    p_user_id: userId, p_fn: fn, p_max_hour: maxHour, p_max_day: maxDay,
    p_action: billing?.action ?? null, p_label: billing?.label?.slice(0, 120) ?? null,
    p_kind: billing?.kind ?? null, p_receipt: receipt,
  });
  if (error) return deny(503, "No se pudo verificar el acceso. Intenta de nuevo.");
  if (g?.ok !== true) {
    switch (g?.reason) {
      case "rate_limited": return deny(429, "Alcanzaste el límite de uso de esta función. Intenta más tarde.");
      case "insufficient_credits":
        return deny(402, "No tienes créditos suficientes para esta acción.", { code: "insufficient_credits", balance: g.balance, cost: g.cost });
      case "disabled": return deny(503, "Esta función no está disponible por ahora.");
      case "unknown_action": return deny(500, "Acción sin precio configurado.");
      default: return deny(403, "Tu cuenta no tiene acceso activo.");
    }
  }
  return {
    userId, txId: g.tx_id ?? null, charged: Number(g.charged) || 0,
    balance: typeof g.balance === "number" ? g.balance : null, receipt: g.receipt ?? null,
  };
}

// Cabeceras para que la app actualice el saldo sin otra consulta (también en streams).
function billingHeaders(gate: Gate): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Expose-Headers": "x-credits-charged, x-credits-balance, x-credit-receipt",
    "x-credits-charged": String(gate.charged),
  };
  if (gate.balance !== null) h["x-credits-balance"] = String(gate.balance);
  if (gate.receipt) h["x-credit-receipt"] = gate.receipt;
  return h;
}

// La IA falló después de cobrar: se devuelve el crédito (idempotente en la base).
async function refundCharge(gate: Gate | null, reason: string): Promise<void> {
  if (!gate?.txId) return;
  try { await guardClient().rpc("refund_charge", { p_tx_id: gate.txId, p_reason: reason.slice(0, 200) }); }
  catch (e) { console.error("refund_charge falló:", e); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let gate: Gate | null = null;
  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing GEMINI_API_KEY" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await readJson(req, 10000).catch(() => ({}))) as Partial<Body>;
    const prompt = String(body.prompt ?? "").trim().slice(0, 2_000);
    if (!prompt) {
      return new Response(JSON.stringify({ error: "prompt requerido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const g = await requireUser(req, "generate-ad-creative", 20, 60, {
      action: "gen_ad_image", label: `Creativo · ${prompt.slice(0, 60)}`,
    });
    if (g instanceof Response) return g;
    gate = g;

    const aspect = ASPECT_HINT[body.aspectRatio ?? "1:1"] ? (body.aspectRatio ?? "1:1") : "1:1";
    const aspectHint = ASPECT_HINT[aspect];
    const fullPrompt = `${prompt}\n\nFormato: ${aspectHint}. Estilo publicitario profesional, alta calidad, listo para usar como creativo de anuncio en redes sociales.`;

    // 1) APIMart (principal y más barato).
    const am = await apimartImage(fullPrompt, aspect);
    if (am) {
      const { error: logErr } = await guardClient().rpc("log_ai_usage", { p_user_id: gate.userId, p_fn: "generate-ad-creative", p_model: `apimart/${APIMART_MODEL}`, p_input: 0, p_output: 0, p_images: 1 });
      if (logErr) console.error("log_ai_usage:", logErr.message);
      return new Response(JSON.stringify({
        image: `data:${am.mime};base64,${am.b64}`,
        provider: "apimart",
        billing: { charged: gate.charged, balance: gate.balance, receipt: gate.receipt },
      }), {
        headers: { ...corsHeaders, ...billingHeaders(gate), "Content-Type": "application/json" },
      });
    }

    // 2) Respaldo: Gemini directo.

    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-2.5-flash-image",
        prompt: fullPrompt,
        response_format: "b64_json",
        n: 1,
      }),
    });

    if (!r.ok) await refundCharge(gate, `IA ${r.status}`);
    if (r.status === 429) {
      const t = await r.text();
      console.error("generate-ad-creative 429:", t.slice(0, 300));
      return new Response(JSON.stringify({ error: "El generador de imágenes está saturado. No se te cobró: intenta en un momento." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!r.ok) {
      const t = await r.text();
      console.error("generate-ad-creative IA:", r.status, t.slice(0, 300));
      return new Response(JSON.stringify({ error: "No se pudo generar la imagen. No se te cobró: inténtalo de nuevo." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await r.json();
    // Costo real (tabla ai_usage): imágenes generadas + tokens si Gemini los manda.
    // Salida = total − entrada, para contar también el razonamiento, que se cobra.
    try {
      const u = data?.usage;
      const input = Number(u?.prompt_tokens ?? u?.input_tokens) || 0;
      const output = Math.max(Number(u?.completion_tokens ?? u?.output_tokens) || 0, (Number(u?.total_tokens) || 0) - input);
      const images = Array.isArray(data?.data) ? data.data.filter((d: { b64_json?: unknown }) => d?.b64_json).length : 0;
      const { error: logErr } = await guardClient().rpc("log_ai_usage", { p_user_id: gate.userId, p_fn: "generate-ad-creative", p_model: "gemini-2.5-flash-image", p_input: input, p_output: output, p_images: images });
      if (logErr) console.error("log_ai_usage:", logErr.message);
    } catch (e) { console.error("log_ai_usage:", e instanceof Error ? e.message : e); }
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      await refundCharge(gate, "sin imagen");
      return new Response(JSON.stringify({ error: "La IA no devolvió una imagen. No se te cobró: inténtalo de nuevo." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      image: `data:image/png;base64,${b64}`,
      billing: { charged: gate.charged, balance: gate.balance, receipt: gate.receipt },
    }), {
      headers: { ...corsHeaders, ...billingHeaders(gate), "Content-Type": "application/json" },
    });
  } catch (e) {
    await refundCharge(gate, "excepción");
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
