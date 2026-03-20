import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { type, url, query } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let prompt = "";
    if (type === "url") {
      prompt = `Analiza esta URL de landing page/anuncio de un competidor: ${url}

Devuelve un análisis completo en formato JSON con esta estructura:
{
  "url": "${url}",
  "title": "título de la página",
  "description": "descripción breve de qué se trata",
  "landing_analysis": "análisis detallado de la estrategia de la landing page, estructura, oferta, urgencia, prueba social, etc.",
  "copy_hooks": ["hook 1 que usan", "hook 2", "hook 3", "hook 4", "hook 5"],
  "cta_text": "texto del CTA principal que detectas",
  "audience_signals": ["señal de audiencia 1", "señal 2", "señal 3"],
  "ads_found": ["descripción de anuncio encontrado 1"]
}

Sé específico y práctico. Los hooks deben ser textos que el usuario pueda adaptar para sus propios anuncios.`;
    } else {
      prompt = `Busca y analiza el nicho "${query}" para encontrar estrategias de anuncios exitosos.

Devuelve un array JSON de resultados simulados basados en tu conocimiento del mercado:
[
  {
    "title": "nombre/título del anuncio o página encontrada",
    "url": "URL ejemplo relevante",
    "description": "descripción del anuncio/estrategia encontrada, qué lo hace exitoso",
    "platform": "Meta/Google/TikTok"
  }
]

Devuelve al menos 6 resultados relevantes y realistas para el nicho "${query}".`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: "Eres un experto en análisis competitivo de publicidad digital. Responde SOLO con JSON válido, sin markdown ni explicaciones adicionales."
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("Error en análisis de IA");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No se pudo parsear la respuesta de IA");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const result = type === "url"
      ? { result: parsed }
      : { results: Array.isArray(parsed) ? parsed : [parsed] };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("spy error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
