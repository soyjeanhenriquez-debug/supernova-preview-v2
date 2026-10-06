// SUPERNOVA — Generador de creativo de anuncio (imagen estática). Principal: APIMart (GPT Image 2,
// asíncrono, se consulta hasta que termina). Respaldo: Gemini "Nano Banana" directo con el mismo
// GEMINI_API_KEY/LOVABLE_API_KEY del texto. La imagen vuelve en la misma respuesta.
import { corsHeaders } from "npm:@supabase/supabase-js@2.117.1/cors";
import { createClient as createGuardClient } from "npm:@supabase/supabase-js@2.117.1";
import { apimartImage, IMAGE_MODELS, isImageModel, type ImageModelId } from "../_shared/apimart.ts";
import { checkReferencePaths } from "./refs.ts";
import { safeRefund } from "../_shared/refund.ts";

interface Body {
  prompt: string;
  aspectRatio?: "1:1" | "4:5" | "9:16" | "16:9"; // feed Meta / feed vertical Meta / Stories-Reels-TikTok / miniatura YouTube
  /** Rutas en el bucket "creativos" del propio usuario (<uid>/...), máx. 3. Nunca URLs. */
  reference_paths?: string[];
  /** IA de imagen elegida por la persona (lista blanca IMAGE_MODELS; por defecto GPT Image 2). */
  model?: string;
}

const ASPECT_HINT: Record<string, string> = {
  "1:1": "square 1:1 format, Instagram/Facebook feed ad",
  "4:5": "vertical 4:5 format, Instagram/Facebook feed ad",
  "9:16": "vertical 9:16 full-screen format, Instagram/TikTok Stories and Reels ad",
  // Miniaturas (Estudio de imágenes): portada horizontal de YouTube.
  "16:9": "horizontal 16:9 format, YouTube video thumbnail, bold and readable at small size",
};

// ── APIMart (03-oct-2026): proveedor principal de imágenes, GPT Image 2 a ~US$0,0081 por imagen
// (Gemini directo cuesta ~US$0,039). El cliente vive en _shared/apimart.ts (asíncrono: crea la tarea
// y consulta hasta que termina). Si no hay llave o algo falla, se usa Gemini como respaldo (el cobro
// ya hecho no cambia), salvo con fotos de referencia: Gemini no las usaría, así que se reembolsa.
//
// Fotos de referencia (04-oct-2026, LUMEN): `reference_paths` = rutas del bucket privado
// "creativos" del PROPIO usuario (máx. 3, ver refs.ts). Se validan y se firman URLs de 10 minutos
// ANTES de cobrar; nunca se aceptan URLs del cliente. gpt-image-2 cobra por resolución (1k), la doc
// no indica recargo por referencias: se mantiene gen_ad_image (6 créditos).

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

function deny(status: number, error: string, extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ error, ...extra }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/** Usuario REAL a partir del token (auth.getUser). La llave anon sola no pasa. */
async function authUser(req: Request): Promise<string | Response> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return deny(401, "Inicia sesión para usar esta función.");
  const { data } = await guardClient().auth.getUser(token);
  const userId = data?.user?.id;
  if (!userId) return deny(401, "Sesión inválida o expirada. Vuelve a iniciar sesión.");
  return userId;
}

/** Acceso vigente + tope de uso + cobro ANTES de gastar (precio de credit_prices, nunca del cliente). */
async function chargeUser(userId: string, fn: string, maxHour: number, maxDay: number, billing?: Billing): Promise<Gate | Response> {
  const guard = guardClient();
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

/** Firma URLs de 10 min para las fotos de referencia del usuario. null = alguna no existe. */
async function signReferences(paths: string[]): Promise<string[] | null> {
  if (!paths.length) return [];
  const { data, error } = await guardClient().storage.from("creativos").createSignedUrls(paths, 600);
  if (error || !data || data.length !== paths.length) return null;
  const urls = data.map(d => d.signedUrl).filter((u): u is string => typeof u === "string" && u.startsWith("https://"));
  return urls.length === paths.length ? urls : null;
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
  await safeRefund(guardClient(), gate.txId, reason, "generate-ad-creative");
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

    const uid = await authUser(req);
    if (uid instanceof Response) return uid;

    // Fotos de referencia: se validan y se firman ANTES de cobrar (si fallan, no se cobra nada).
    const refCheck = checkReferencePaths(body.reference_paths, uid);
    if (!refCheck.ok) return deny(400, refCheck.error);
    let refUrls: string[] = [];
    if (refCheck.paths.length) {
      if (!Deno.env.get("APIMART_API_KEY")) return deny(503, "Las fotos de referencia no están disponibles por ahora. Crea la imagen sin ellas.");
      const signed = await signReferences(refCheck.paths);
      if (!signed) return deny(400, "No encontramos una de tus fotos de referencia. Vuelve a subirla.");
      refUrls = signed;
    }

    // Modelo: solo los de la lista blanca; un id desconocido se rechaza (no se cobra al precio de otro).
    if (body.model !== undefined && !isImageModel(body.model)) return deny(400, "Esa IA de imagen no está disponible.");
    const model: ImageModelId = isImageModel(body.model) ? body.model : "gpt-image-2";
    const mdl = IMAGE_MODELS[model];
    if (model !== "gpt-image-2" && !Deno.env.get("APIMART_API_KEY")) return deny(503, "Esa IA de imagen no está disponible ahora. Prueba con GPT Image 2.");

    const g = await chargeUser(uid, "generate-ad-creative", 20, 60, {
      action: mdl.action, label: `${refUrls.length ? "Creativo con tu foto" : "Creativo"}${model !== "gpt-image-2" ? ` · ${mdl.label}` : ""} · ${prompt.slice(0, 60)}`,
    });
    if (g instanceof Response) return g;
    gate = g;

    const aspect = ASPECT_HINT[body.aspectRatio ?? "1:1"] ? (body.aspectRatio ?? "1:1") : "1:1";
    const aspectHint = ASPECT_HINT[aspect];
    const fullPrompt = `${prompt}\n\nFormato: ${aspectHint}. Estilo publicitario profesional, alta calidad, listo para usar como creativo de anuncio en redes sociales.`;

    // 1) APIMart (principal y más barato).
    const am = await apimartImage(fullPrompt, aspect, refUrls, model);
    if (am) {
      // Costo real que informa APIMart (para confirmar si las referencias cuestan más; ver admin_margin).
      if (am.cost !== null) console.log(`apimart ${mdl.apimart} costo=${am.cost} refs=${refUrls.length}`);
      const { error: logErr } = await guardClient().rpc("log_ai_usage", { p_user_id: gate.userId, p_fn: "generate-ad-creative", p_model: `apimart/${mdl.apimart}`, p_input: 0, p_output: 0, p_images: 1 });
      if (logErr) console.error("log_ai_usage:", logErr.message);
      return new Response(JSON.stringify({
        image: `data:${am.mime};base64,${am.b64}`,
        provider: "apimart",
        billing: { charged: gate.charged, balance: gate.balance, receipt: gate.receipt },
      }), {
        headers: { ...corsHeaders, ...billingHeaders(gate), "Content-Type": "application/json" },
      });
    }

    // Con fotos de referencia o con un modelo elegido no hay respaldo: saldría otra cosa (u otro
    // modelo más barato que el que pagó). Se devuelve el crédito.
    if (model !== "gpt-image-2") {
      await refundCharge(gate, `apimart ${mdl.apimart} falló`);
      return deny(502, `No se pudo crear la imagen con ${mdl.label}. No se te cobró: inténtalo de nuevo o prueba otra IA.`);
    }
    if (refUrls.length) {
      await refundCharge(gate, "apimart con referencias falló");
      return deny(502, "No se pudo crear la imagen con tu foto. No se te cobró: inténtalo de nuevo.");
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
