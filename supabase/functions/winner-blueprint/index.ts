import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient as createGuardClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

// ── Costo real (tabla ai_usage) ─────────────────────────────────────────
// Deja pasar el stream tal cual hacia el cliente y, de paso, lee el último bloque de
// Gemini, que trae el conteo de tokens (stream_options.include_usage). Al terminar lo
// registra con log_ai_usage. Salida = total − entrada, para contar también el
// razonamiento, que Google cobra como salida. Si algo falla aquí, el usuario no se entera.
function meteredStream(body: ReadableStream<Uint8Array>, userId: string, fn: string, model: string): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let buf = "";
  let usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null = null;
  const scan = (line: string) => {
    if (!line.startsWith("data: ") || !line.includes("\"usage\"")) return;
    try { const u = JSON.parse(line.slice(6)).usage; if (u) usage = u; } catch { /* bloque incompleto */ }
  };
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk);
      buf += decoder.decode(chunk, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) { scan(buf.slice(0, nl).trim()); buf = buf.slice(nl + 1); }
    },
    async flush() {
      scan(buf.trim());
      if (!usage) return;
      const input = Number(usage.prompt_tokens) || 0;
      const output = Math.max(Number(usage.completion_tokens) || 0, (Number(usage.total_tokens) || 0) - input);
      try {
        const { error } = await guardClient().rpc("log_ai_usage", { p_user_id: userId, p_fn: fn, p_model: model, p_input: input, p_output: output, p_images: 0 });
        if (error) console.error("log_ai_usage:", error.message);
      } catch (e) { console.error("log_ai_usage:", e instanceof Error ? e.message : e); }
    },
  }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let gate: Gate | null = null;
  try {
    const { ad, receipt } = await readJson(req, 30000);
    if (!ad || typeof ad !== "object") {
      return new Response(JSON.stringify({ error: "ad requerido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // "Mi App": un cobro cubre el blueprint, el mega-prompt y el guion de venta.
    // El recibo de un intento anterior evita cobrar de nuevo al reintentar.
    const g = await requireUser(req, "winner-blueprint", 40, 200, {
      action: "gen_master_prompt", kind: "blueprint", receipt,
      label: `Mi App · ${String(ad.ad_title ?? ad.page_name ?? "").slice(0, 60)}`,
    });
    if (g instanceof Response) return g;
    gate = g;
    const LOVABLE_API_KEY = (Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = `Eres el mejor analista de direct response marketing del mundo.
Analiza este anuncio ganador y crea un Blueprint de Clonación completo.

ANUNCIO ORIGINAL:
Texto: ${ad.ad_body || ad.ad_description || ""}
Titular: ${ad.ad_title || ""}
Anunciante: ${ad.page_name || ad.advertiser || ""}
Días activo: ${ad.days_active ?? "?"}
Repeticiones: ${ad.duplicate_count ?? "?"}
Impresiones estimadas: ${ad.impressions_lower ?? "?"}
Mercado de origen: ${ad.market || "?"}

ENTREGA EXACTAMENTE ESTO EN ESTE ORDEN (usa markdown):

## 🎯 POR QUÉ ESTÁ GANANDO
(2-3 razones específicas basadas en el copy)

## 🧠 EL MECANISMO
(la promesa central, el ángulo único, el hook que usa)

## 👤 EL AVATAR
(quién está comprando esto, descripción específica)

## 💰 ESTRUCTURA DE LA OFERTA
(qué están vendiendo exactamente, precio estimado, modelo)

## 🔥 LOS 3 ELEMENTOS QUE DEBES ROBAR
(las ideas específicas que puedes adaptar legalmente)

## ❌ LO QUE NO COPIES
(lo que es específico de ellos y no funcionaría para ti)

## 🚀 TU VERSIÓN: CÓMO CLONARLO
(instrucciones específicas para crear tu propia versión)

## ✍️ HOOK ALTERNATIVO PARA TI
(un hook similar pero diferente para tu versión)

## 📊 NICHOS RELACIONADOS DONDE FUNCIONA
(3 nichos donde el mismo mecanismo podría aplicar)

Sé específico, directo y accionable. Sin relleno. Todo en español latinoamericano.`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
        stream: true,
        stream_options: { include_usage: true },
      }),
    });

    if (!response.ok) {
      const txt = await response.text();
      await refundCharge(gate, `IA ${response.status}`);
      console.error("winner-blueprint IA:", response.status, txt.slice(0, 300));
      return new Response(JSON.stringify({ error: "La IA no respondió. No se te cobró: inténtalo de nuevo." }), {
        status: response.status === 429 ? 429 : 502, // nunca el 402 del proveedor: el cliente lo leería como "sin créditos"
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = response.body
      ? meteredStream(response.body, gate.userId, "winner-blueprint", "gemini-3-flash-preview")
      : response.body;
    return new Response(body, {
      headers: { ...corsHeaders, ...billingHeaders(gate), "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    await refundCharge(gate, "excepción");
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
