// SUPERNOVA — Generador de creativo de anuncio (imagen estática) vía Gemini
// "Nano Banana". Reusa el mismo GEMINI_API_KEY/LOVABLE_API_KEY que ya usamos
// para texto (oraculo-generate, ai-chat) — sin proveedor nuevo, sin cuenta ni
// billing nuevo que configurar. Síncrono: la imagen vuelve en la misma
// respuesta (no hace falta job/webhook como con HeyGen, que sí es async).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient as createGuardClient } from "npm:@supabase/supabase-js@2";

interface Body {
  prompt: string;
  aspectRatio?: "1:1" | "4:5" | "9:16"; // feed Meta / feed vertical Meta / Stories-Reels-TikTok
}

const ASPECT_HINT: Record<string, string> = {
  "1:1": "square 1:1 format, Instagram/Facebook feed ad",
  "4:5": "vertical 4:5 format, Instagram/Facebook feed ad",
  "9:16": "vertical 9:16 full-screen format, Instagram/TikTok Stories and Reels ad",
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

    const aspectHint = ASPECT_HINT[body.aspectRatio ?? "1:1"] ?? ASPECT_HINT["1:1"];
    const fullPrompt = `${prompt}\n\nFormato: ${aspectHint}. Estilo publicitario profesional, alta calidad, listo para usar como creativo de anuncio en redes sociales.`;

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
