import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { ad } = await req.json();
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
      }),
    });

    if (!response.ok) {
      const txt = await response.text();
      return new Response(JSON.stringify({ error: txt }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
