// SUPERNOVA — Intelligence Analyzer
// Genera el Informe de Inteligencia completo a partir de la landing + ads activos.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient as createGuardClient } from "npm:@supabase/supabase-js@2";

interface AdInput {
  page_name?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_delivery_start_time?: string;
  publisher_platforms?: string[];
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
    const body = await readJson(req, 200000);
    const landingUrl: string = body.landingUrl ?? "";
    const landingContent: string = (body.landingContent ?? "").toString().slice(0, 6000);
    const activeAds: AdInput[] = Array.isArray(body.activeAds) ? body.activeAds.slice(0, 8) : [];
    const domain: string = body.domain ?? "";
    const brandName: string = body.brandName ?? domain;

    if (!landingUrl || !landingContent) {
      return new Response(JSON.stringify({ error: "landingUrl y landingContent requeridos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = (Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY no configurado" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Se cobra aquí, no al empezar el flujo: leer la landing y buscar sus anuncios
    // es gratis, así que si esos pasos fallan el usuario no pierde nada.
    const g = await requireUser(req, "analyze-landing", 30, 120, {
      action: "landing_intelligence", label: `Oráculo · ${String(domain || landingUrl).slice(0, 70)}`,
    });
    if (g instanceof Response) return g;
    gate = g;

    const adsContext = activeAds.length > 0
      ? `ANUNCIOS ACTIVOS ENCONTRADOS (${activeAds.length} muestras):
${activeAds.map((ad, i) => {
  const start = ad.ad_delivery_start_time ? new Date(ad.ad_delivery_start_time) : null;
  const days = start ? Math.max(1, Math.floor((Date.now() - start.getTime()) / 86400000)) : "?";
  return `
Anuncio ${i+1}:
- Anunciante: ${ad.page_name ?? "—"}
- Días activo: ${days}
- Plataformas: ${(ad.publisher_platforms ?? []).join(", ") || "—"}
- Titular: ${(ad.ad_creative_link_titles?.[0] ?? "").slice(0, 200)}
- Copy: ${(ad.ad_creative_bodies?.[0] ?? "").slice(0, 400)}`;
}).join("\n")}`
      : "No se encontraron anuncios activos para este anunciante en Facebook Ads Library.";

    const systemPrompt = `Eres el mejor analista de inteligencia competitiva en direct response marketing del mundo hispanohablante. Analizas landing pages y anuncios de competidores para ayudar a marketers a crear ofertas superiores. Responde SIEMPRE en español. Sé específico, directo y accionable. Sin relleno. Sin disclaimers. Usa exactamente el formato Markdown solicitado.`;

    const userPrompt = `Analiza esta landing page y sus anuncios activos. Entrega el informe completo en este formato EXACTO.

URL ANALIZADA: ${landingUrl}
DOMINIO: ${domain}
MARCA DETECTADA: ${brandName}

CONTENIDO DE LA LANDING:
${landingContent}

${adsContext}

---

ENTREGA EXACTAMENTE ESTO (mantén títulos y numeración):

# 🎯 INFORME DE INTELIGENCIA — ${domain}

## 1. QUIÉN ES ESTE ANUNCIANTE
- Nombre de la marca/empresa
- Qué producto/servicio vende exactamente
- Precio estimado (basado en el copy)
- Modelo de negocio (venta directa, lead magnet, suscripción, etc.)
- Plataforma de checkout detectada (Hotmart/Clickbank/Shopify/Stripe/otra)

## 2. LA OFERTA
- La promesa principal en una línea
- El mecanismo único (por qué su solución es diferente)
- Los bonos o elementos adicionales detectados
- La garantía (si existe)
- El ángulo emocional principal

## 3. A QUIÉN LE VENDEN (el avatar)
- Demografía probable (edad, género, situación)
- El dolor principal que resuelve
- El deseo profundo que promete
- Nivel de sofisticación del mercado (1-5, escala Schwartz)

## 4. SUS ANUNCIOS ACTIVOS
- Cuántos anuncios activos encontramos
- Cuánto tiempo llevan corriendo
- Formato dominante (video, imagen, carrusel)
- El hook más usado
- Estimado de inversión mensual en ads

## 5. POR QUÉ ESTÁ FUNCIONANDO
- Las 3 razones específicas por las que esta oferta convierte
- Qué hace mejor que la competencia
- Su ventaja competitiva real

## 6. SUS PUNTOS DÉBILES
- Las 3 debilidades principales
- Objeciones que no maneja bien
- Ángulos que está ignorando

## 7. TU OPORTUNIDAD — CÓMO SUPERARLOS
- El ángulo diferenciador que debes usar
- Cómo posicionarte en contra de esta oferta
- El gap del mercado que puedes capturar
- Tu promesa superior en una línea

## 8. BLUEPRINT DE ACCIÓN — 30 DÍAS
- **Semana 1:** acción específica
- **Semana 2:** acción específica
- **Semana 3:** acción específica
- **Semana 4:** acción específica con primera venta

## 9. HOOK LISTO PARA TU PRIMER ANUNCIO
Un hook completo de 3-4 líneas listo para publicar como anuncio.`;

    const aiRes = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gemini-3-pro-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiRes.ok) await refundCharge(gate, `IA ${aiRes.status}`);
    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: "La IA está saturada. No se te cobró: intenta en unos segundos." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiRes.status === 402) {
      console.error("analyze-landing: el proveedor de IA respondió 402 (saldo prepago agotado)");
      return new Response(JSON.stringify({ error: "La IA no está disponible en este momento. No se te cobró: inténtalo más tarde." }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.error("analyze-landing IA:", aiRes.status, txt.slice(0, 300));
      return new Response(JSON.stringify({ error: "La IA no respondió. No se te cobró: inténtalo de nuevo." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    const analysis: string = data.choices?.[0]?.message?.content ?? "";
    if (!analysis.trim()) {
      await refundCharge(gate, "respuesta vacía");
      return new Response(JSON.stringify({ error: "La IA devolvió un análisis vacío. No se te cobró: inténtalo de nuevo." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      analysis,
      billing: { charged: gate.charged, balance: gate.balance, receipt: gate.receipt },
    }), {
      headers: { ...corsHeaders, ...billingHeaders(gate), "Content-Type": "application/json" },
    });
  } catch (e) {
    await refundCharge(gate, "excepción");
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
