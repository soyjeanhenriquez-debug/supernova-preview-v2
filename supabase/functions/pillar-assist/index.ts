// SUPERNOVA — Asistente IA por Pilar (streaming SSE)
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient as createGuardClient } from "npm:@supabase/supabase-js@2";
// eslint-disable @typescript-eslint/no-explicit-any

interface Payload {
  projectName: string;
  projectMode: "sofisticar" | "crear" | "blueprint";
  pillarId: number;
  pillarName: string;
  pillarDesc: string;
  notes?: string;
  context?: unknown;
  previousNotes?: Record<number, string>;
}

const PILLAR_PROMPTS: Record<number, string> = {
  1: `PILAR 1 — DETECTAR (Encontrar el anuncio ganador)
Devuelve un plan ULTRA accionable para que el usuario detecte el anuncio winner correcto para SU proyecto. Incluye:
## 🎯 Criterios de un ganador para tu nicho
## 🔎 Dónde buscar (con queries exactas en Meta Ad Library, TikTok Creative Center, Foreplay)
## 🧪 Filtros mínimos (días activos, duplicados, score)
## ✅ Tu shortlist sugerida (3-5 ejemplos del tipo de anuncio a buscar)
## 📌 Siguiente paso concreto`,

  2: `PILAR 2 — ANALIZAR (Entender por qué vende)
Analiza el anuncio/contexto del proyecto y entrega:
## 🧠 Mecanismo de la oferta (la promesa real)
## 🎣 El hook (qué frase engancha)
## 👤 Avatar específico que está comprando
## 💔 Dolor que resuelve (no genérico)
## 🪜 Escalera de valor implícita
## ⚠️ Lo que NO está vendiendo (oportunidad)`,

  3: `PILAR 3 — DISEÑAR (Crear tu versión superior)
Diseña una versión MEJOR que el original. Entrega:
## 🚀 Nombre del producto sofisticado
## 💎 Por qué es MEJOR (3 razones específicas)
## 📦 Formato y entregables (qué incluye)
## 💰 Precio sugerido + justificación
## 🪜 Stack de oferta (bonus, garantía, urgencia)
## 🎨 Tu ángulo único (positioning statement en 1 frase)`,

  4: `PILAR 4 — PRODUCIR (Construir los assets)
Da la lista exhaustiva de assets a producir, con tiempos y herramientas:
## 🛠️ Stack de herramientas recomendado
## 📋 Checklist de assets (landing, VSL, creativos, email, checkout)
## 📅 Cronograma de producción (día a día, máx 7 días)
## ✍️ Briefs listos para copiar (1 por asset)
## 🤖 Qué delegar a IA y qué no
## ⚠️ Trampas comunes`,

  5: `PILAR 5 — LANZAR (Primera venta en 7 días)
Plan de lanzamiento orgánico + paid mínimo para primera venta:
## 🎬 Plan día 1-7 (qué hacer cada día)
## 📣 3 ángulos de comunicación para testear
## 🧲 Lead magnet / oferta de entrada
## 📊 Métricas que importan (no vanidad)
## 🆘 Plan B si no hay venta el día 5
## ✅ Definición de "lanzado con éxito"`,

  6: `PILAR 6 — ESCALAR (Paid media con ROI probado)
Plan de escalado con paid media:
## 🎯 Estructura de campaña recomendada (CBO/ABO, audiencias)
## 💵 Presupuesto inicial y reglas de escalado
## 🧪 Matriz de testeo (creativos × audiencias × hooks)
## 📈 KPIs por etapa (CPM, CTR, CPC, CPA objetivo)
## 🔁 Cuándo duplicar, cuándo matar, cuándo bajar
## 🛡️ Cómo proteger ROAS al escalar`,
};

function buildPrompts(p: Payload): { system: string; user: string } {
  const prior = Object.entries(p.previousNotes || {})
    .filter(([_, v]) => v && v.trim())
    .map(([k, v]) => `- Pilar ${k}: ${v}`)
    .join("\n");

  const ctx = p.context ? `\nCONTEXTO DEL PROYECTO:\n${JSON.stringify(p.context).slice(0, 2500)}\n` : "";

  const userNotes = p.notes?.trim() ? `\nNOTAS ACTUALES DEL USUARIO EN ESTE PILAR:\n${p.notes}\n` : "";

  return {
    system: `Eres un consultor élite de Direct Response Marketing y operador del sistema SUPERNOVA (6 pilares secuenciales).
Hablas español neutro, directo, sin relleno. Output siempre en markdown siguiendo EXACTAMENTE el formato pedido.
Tu objetivo: que el usuario salga del pilar con tareas concretas, no teoría.`,
    user: `PROYECTO: ${p.projectName}
MODO: ${p.projectMode}
${ctx}
${prior ? `AVANCES PREVIOS:\n${prior}\n` : ""}
${userNotes}

${PILLAR_PROMPTS[p.pillarId] || `Genera guía accionable para el pilar "${p.pillarName}" (${p.pillarDesc}).`}

Sé específico al proyecto. No des consejos genéricos. Máx 450 palabras.`,
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let gate: Gate | null = null;
  try {
    const payload = await readJson(req, 100000) as Payload;
    if (!payload?.pillarId || !payload?.projectName) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const g = await requireUser(req, "pillar-assist", 60, 300, {
      action: "pillar_assist", label: `Pilar ${Number(payload.pillarId) || "?"} · ${String(payload.projectName).slice(0, 60)}`,
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
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "gemini-3-flash-preview",
        stream: true,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text();
      await refundCharge(gate, `IA ${upstream.status}`);
      console.error("pillar-assist IA:", upstream.status, text.slice(0, 300));
      return new Response(JSON.stringify({ error: "La IA no respondió. No se te cobró: inténtalo de nuevo." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(upstream.body, {
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
