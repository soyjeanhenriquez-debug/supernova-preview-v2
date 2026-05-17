// SUPERNOVA — Sofisticar / Adaptar / Blueprint via Lovable AI Gateway (streaming)
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload = await req.json() as Payload;
    if (!payload?.action || !payload?.ad) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { system, user } = buildPrompts(payload);

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        stream: true,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text();
      return new Response(JSON.stringify({ error: "Gateway error", detail: text }), {
        status: upstream.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(upstream.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
