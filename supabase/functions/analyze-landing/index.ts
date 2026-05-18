// SUPERNOVA — Intelligence Analyzer
// Genera el Informe de Inteligencia completo a partir de la landing + ads activos.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface AdInput {
  page_name?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_delivery_start_time?: string;
  publisher_platforms?: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY no configurado" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit. Intenta en unos segundos." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiRes.status === 402) {
      return new Response(JSON.stringify({ error: "Sin créditos de IA en el workspace." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiRes.ok) {
      const txt = await aiRes.text();
      return new Response(JSON.stringify({ error: `AI gateway ${aiRes.status}: ${txt.slice(0, 300)}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    const analysis: string = data.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
