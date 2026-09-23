// SUPERNOVA — Sofisticar / Adaptar / Blueprint via Lovable AI Gateway (streaming)
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient as createGuardClient } from "npm:@supabase/supabase-js@2";

interface Payload {
  action: "sofisticar" | "adaptar" | "blueprint";
  ad: {
    title: string; body: string; market: string; lang: string;
    daysActive: number; duplicates: number; offerType: string; score: number;
  };
  targetMarket?: string;
  hasProduct?: string;
  budget?: string;
  adaptTo?: "es" | "en";
}

function buildPrompts(p: Payload): { system: string; user: string } {
  const adInfo = `
ANUNCIO ORIGINAL:
- Título: ${p.ad.title}
- Body: ${p.ad.body}
- Mercado: ${p.ad.market} (${p.ad.lang})
- Días activo: ${p.ad.daysActive}
- Duplicados: ${p.ad.duplicates}
- Tipo: ${p.ad.offerType}
- Winner Score: ${p.ad.score}/100
`;

  if (p.action === "sofisticar") {
    return {
      system: `Eres un consultor élite de Direct Response Marketing. Hablas español neutro, directo y accionable. Tu output siempre sigue exactamente el formato markdown solicitado, sin agregar secciones extra.`,
      user: `${adInfo}

CONTEXTO DEL USUARIO:
- Mercado objetivo: ${p.targetMarket}
- ¿Producto propio?: ${p.hasProduct}
- Presupuesto: ${p.budget}

Genera el análisis SOFISTICAR siguiendo EXACTAMENTE este formato (incluye los headings con emojis tal cual):

## ⚡ POR QUÉ ESTE ANUNCIO ESTÁ GANANDO
(2-3 razones específicas — no genéricas)

## 🧠 EL MECANISMO QUE VENDE
(La promesa real. El ángulo. El hook.)

## 👤 QUIÉN LO ESTÁ COMPRANDO
(Avatar específico — edad, situación, dolor)

## 💰 ESTIMADO DE LO QUE ESTÁ GENERANDO
(Estimación basada en días activo + duplicados + impresiones)

## ⚡ CÓMO SOFISTICARLO — TU VERSIÓN MEJORADA
(Producto específico que puedes crear. Más simple pero más valioso.)

## 🚀 TU OFERTA SOFISTICADA EN 30 DÍAS
**Nombre del producto:** [nombre específico]
**Formato:** [SaaS / App / Herramienta / Curso intensivo]
**Precio recomendado:** $X
**Por qué es MEJOR que el original:** [razón específica]
**Cómo construirlo:** [3 pasos concretos]

## ✍️ HOOK PARA TU ANUNCIO
(Listo para copiar y pegar)

## ⚠️ NO HAGAS ESTO
(Errores comunes al clonar este tipo de oferta)`,
    };
  }

  if (p.action === "adaptar") {
    const targetLang = p.adaptTo === "en" ? "inglés (USA)" : "español (LATAM/España)";
    return {
      system: `Eres un copywriter experto en Direct Response que adapta culturalmente anuncios entre mercados. NO traduces literal — recreas el ángulo emocional con referencias culturales locales, expresiones nativas y prueba social adecuada al mercado destino.`,
      user: `${adInfo}

Adapta culturalmente este anuncio al ${targetLang}. NO es una traducción literal. Recrea el ángulo emocional con elementos culturales del mercado destino.

Entrega el output con este formato:

## 🌍 ANUNCIO ADAPTADO
**Título:**
(nuevo título adaptado)

**Body:**
(nuevo body adaptado, listo para publicar)

## 🔑 DECISIONES DE ADAPTACIÓN
(3-5 bullets explicando qué cambiaste y por qué — referencias culturales, modismos, prueba social local)

## 💡 VARIANTE ALTERNATIVA
(una segunda versión con un ángulo distinto)`,
    };
  }

  // blueprint
  return {
    system: `Eres un analista senior de ofertas Direct Response. Tu output es siempre estructurado, accionable y específico. Hablas español neutro.`,
    user: `${adInfo}

Genera un BLUEPRINT COMPLETO con este formato exacto:

## 🎯 POR QUÉ GANA
(análisis estratégico — mecanismo psicológico, ángulo, prueba social)

## 👤 AVATAR COMPLETO
- Demográfico
- Estado emocional
- Creencias actuales
- Dolor profundo
- Deseo no expresado
- Objeción principal

## 🧠 ESTRUCTURA DE LA OFERTA
- Promesa central
- Mecanismo único (USP)
- Stack de bonos sugerido
- Garantía
- Precio óptimo

## 📐 CÓMO CLONARLO (PASO A PASO)
1. ...
2. ...
3. ...
4. ...
5. ...

## ✍️ 3 HOOKS ALTERNATIVOS
1.
2.
3.

## 🚀 PLAN DE ACCIÓN 30 DÍAS
- Semana 1: ...
- Semana 2: ...
- Semana 3: ...
- Semana 4: ...

## ⚠️ RIESGOS
(qué puede salir mal y cómo mitigarlo)`,
  };
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
    const payload = await readJson(req, 60000) as Payload;
    if (!payload?.ad || !["sofisticar", "adaptar", "blueprint"].includes(payload?.action)) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // El nombre de la acción ES su clave en la lista de precios (15 / 5 / 25).
    const g = await requireUser(req, "sofisticar-ad", 40, 200, {
      action: payload.action, label: String(payload.ad.title ?? "").slice(0, 80) || undefined,
    });
    if (g instanceof Response) return g;
    gate = g;

    const LOVABLE_API_KEY = (Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { system, user } = buildPrompts(payload);

    const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gemini-3-flash-preview",
        stream: true,
        stream_options: { include_usage: true },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text();
      await refundCharge(gate, `IA ${upstream.status}`);
      console.error("sofisticar-ad IA:", upstream.status, text.slice(0, 300));
      return new Response(JSON.stringify({ error: "La IA no respondió. No se te cobró: inténtalo de nuevo." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(meteredStream(upstream.body, gate.userId, `sofisticar-ad:${payload.action}`, "gemini-3-flash-preview"), {
      headers: {
        ...corsHeaders,
        ...billingHeaders(gate),
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    await refundCharge(gate, "excepción");
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
