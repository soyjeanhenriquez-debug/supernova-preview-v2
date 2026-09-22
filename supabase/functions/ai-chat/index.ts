import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient as createGuardClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// El frontend manda ids estilo gateway ("google/…") y algunos modelos 2.5
// no disponibles para cuentas nuevas de Gemini: se normalizan aquí.
const MODEL_MAP: Record<string, string> = {
  "gemini-2.5-pro": "gemini-3-pro-preview",
  "gemini-2.5-flash": "gemini-3-flash-preview",
  "gemini-2.5-flash-lite": "gemini-flash-lite-latest",
};

// Lista blanca: el modelo lo pedía el cliente sin filtro, así que cualquiera
// podía elegir el más caro (pro ≈ 20× el costo de flash). La app solo usa flash.
const ALLOWED_MODELS = new Set(["gemini-3-flash-preview", "gemini-flash-lite-latest"]);
const DEFAULT_MODEL = "gemini-3-flash-preview";

function normalizeModel(model?: string): string {
  const m = String(model || DEFAULT_MODEL).replace(/^google\//, "");
  const mapped = MODEL_MAP[m] ?? m;
  return ALLOWED_MODELS.has(mapped) ? mapped : DEFAULT_MODEL;
}

// Dos modos, y lo decide el SERVIDOR:
//  · Generador (de pago): llega generator_id → se cobra según su nivel. Mismas
//    listas que generatorCost() en src/hooks/useCredits.ts; un id desconocido
//    paga como "ligero", igual que en el cliente.
//  · Asistente de ayuda (gratis): sin generator_id. Respuesta corta y con una
//    instrucción del servidor al final, para que no sirva de generador gratis.
const GEN_MEDIUM_IDS = new Set(["landing-copy", "email-launch", "email-sequence", "yt-script", "funnel-strategy", "audience-research", "product-desc", "offer-stack", "yapping-script", "ecosystem", "ascension-offer", "meta-campaign", "creative-brief", "mandala-sequence", "mandala-iterate"]);
const GEN_HEAVY_IDS = new Set(["vsl-downsell", "vsl-upsell-1", "vsl-upsell-2", "vsl-main"]);
function generatorAction(id: string): string {
  if (GEN_HEAVY_IDS.has(id)) return "gen_heavy";
  if (GEN_MEDIUM_IDS.has(id)) return "gen_medium";
  return "gen_light";
}
const DEFAULT_SYSTEM = `Eres el asistente IA de SUPERNOVA, una plataforma de gestión de campañas publicitarias. 
Tu rol es ayudar al usuario a:
- Optimizar campañas de Meta Ads, Google Ads, TikTok Ads
- Generar copy persuasivo y hooks de venta
- Analizar métricas (ROAS, CTR, CPA, CPM)
- Sugerir estrategias de targeting y audiencias
- Crear embudos de conversión efectivos
- Dar consejos sobre creatividades que convierten

Responde siempre en español. Sé directo, práctico y orientado a resultados. 
Cuando des copy o hooks, hazlos listos para usar. 
Usa emojis moderadamente para hacer las respuestas más visuales.`;
// Para generadores: el entregable va directo (sin "¡Hola! Soy tu asistente…") y con las reglas
// de publicidad honesta que piden Meta/TikTok, sea cual sea el generador.
const GENERATOR_GUARD = "\n\nREGLAS DEL SISTEMA PARA ESTE ENTREGABLE: empieza directamente con el primer título del entregable, sin saludos, sin presentarte y sin frases como 'aquí tienes'. Publicidad honesta: nunca garantices resultados (empleo, ingresos, salud, físico); si el entregable menciona una garantía (solo cuando lo pida el usuario o la oferta ya la tenga), que sea de reembolso y con esas palabras, nunca 'garantizado' junto a un resultado; no añadas garantías por tu cuenta. No inventes testimonios, cifras ni plazos.";
const HELP_MAX_TOKENS = 900;
const HELP_GUARD = "\n\nREGLA DEL SISTEMA: eres el asistente de AYUDA de la app. Responde dudas sobre cómo usar SUPERNOVA en pocas líneas. Si te piden redactar copys, guiones, landings, secuencias de email u otro entregable, no lo escribas: indica qué sección de la app lo genera (Generadores, Oráculo, Mi App, Mini Apps).";

// Solo turnos user/assistant con texto acotado: el rol "system" lo pone el
// servidor, y el historial no crece sin límite.
function cleanMessages(input: unknown): Array<{ role: "user" | "assistant"; content: string }> {
  if (!Array.isArray(input)) return [];
  return input
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-40)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 12_000) }));
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let gate: Gate | null = null;
  try {
    const { messages: rawMessages, systemPrompt: rawSystem, model, generator_id, generator_title } = await readJson(req, 150000);
    const messages = cleanMessages(rawMessages);
    if (messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages requerido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const generatorId = typeof generator_id === "string" && /^[a-z0-9-]{2,40}$/.test(generator_id) ? generator_id : null;
    const g = generatorId
      ? await requireUser(req, "ai-chat", 60, 300, {
          action: generatorAction(generatorId),
          label: `Generador: ${String(generator_title ?? generatorId).slice(0, 70)}`,
        })
      : await requireUser(req, "ai-chat-help", 40, 150);
    if (g instanceof Response) return g;
    gate = g;
    const clientSystem = typeof rawSystem === "string" ? rawSystem.trim().slice(0, 12_000) : "";
    const systemPrompt = (clientSystem || DEFAULT_SYSTEM) + (generatorId ? GENERATOR_GUARD : HELP_GUARD);
    const LOVABLE_API_KEY = (Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: normalizeModel(model),
        ...(generatorId ? {} : { max_tokens: HELP_MAX_TOKENS }),
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t.slice(0, 300));
      await refundCharge(gate, `IA ${response.status}`);
      // 402 del proveedor = NUESTRO saldo de Gemini agotado, no los créditos del usuario.
      const saturated = response.status === 429;
      return new Response(JSON.stringify({
        error: saturated
          ? "La IA está saturada. No se te cobró: intenta en un momento."
          : "La IA no está disponible en este momento. No se te cobró: inténtalo más tarde.",
      }), {
        status: saturated ? 429 : 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, ...billingHeaders(gate), "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    await refundCharge(gate, "excepción");
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
