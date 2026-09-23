import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient as createGuardClient } from "npm:@supabase/supabase-js@2";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let gate: Gate | null = null;
  try {
    const { keyword, suggestions = [], sources = {} } = await readJson(req, 30000);
    if (!keyword) return new Response(JSON.stringify({ error: "keyword required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const g = await requireUser(req, "pain-discovery", 30, 150, { action: "pain_discovery", label: `Pain Discovery · ${String(keyword).slice(0, 60)}` });
    if (g instanceof Response) return g;
    gate = g;

    const LOVABLE_API_KEY = (Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));
    if (!LOVABLE_API_KEY) return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const sourceList = Object.entries(sources).filter(([_, v]) => v).map(([k]) => k).join(", ") || "google";

    const system = `Eres un experto en research de mercado para infoproductos digitales. Tu tarea es identificar dolores reales con alta intención comercial. Hablas español neutro, eres específico y accionable.`;

    const user = `NICHO: "${keyword}"
Fuentes consultadas: ${sourceList}
Señales de Google Autocomplete: ${suggestions.slice(0, 12).join(" | ")}

Analiza y entrega un informe con este formato exacto:

## DOLORES ENCONTRADOS PARA: "${keyword}"

🔴 **DOLOR #1 (Alta intensidad)**
"[frase exacta del dolor en primera persona]"
- Fuente: [origen]
- Volumen estimado: Alto / Medio / Bajo
- Soluciones existentes: [evalúa calidad]
[→ ¿Crear producto?]

🟠 **DOLOR #2 (Media intensidad)**
...

🟡 **DOLOR #3 (Baja intensidad)**
...

## 🟢 IDEAS DE PRODUCTO (generadas por IA)
1. **[Nombre]** — [una línea descriptiva]
2. **[Nombre]** — [una línea descriptiva]
3. **[Nombre]** — [una línea descriptiva]

## 🎯 RECOMENDACIÓN
[1 párrafo: cuál atacar primero y por qué]`;

    const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "gemini-3-flash-preview",
        stream: true,
        stream_options: { include_usage: true },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text();
      await refundCharge(gate, `IA ${upstream.status}`);
      console.error("pain-discovery IA:", upstream.status, text.slice(0, 300));
      return new Response(JSON.stringify({ error: "La IA no respondió. No se te cobró: inténtalo de nuevo." }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(meteredStream(upstream.body, gate.userId, "pain-discovery", "gemini-3-flash-preview"), { headers: { ...corsHeaders, ...billingHeaders(gate), "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
  } catch (e) {
    await refundCharge(gate, "excepción");
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
