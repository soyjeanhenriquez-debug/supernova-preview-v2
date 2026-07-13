// SUPERNOVA — analyze-ad: análisis estratégico de un anuncio de Meta
// Llama a Lovable AI y devuelve JSON con los 6 campos solicitados.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface Body { copy?: string; title?: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = (Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { copy = "", title = "" }: Body = await req.json().catch(() => ({}));
    const fullCopy = `${title}\n\n${copy}`.trim();
    if (!fullCopy) {
      return new Response(JSON.stringify({ error: "copy is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const system = `Eres un analista experto en direct response marketing. Analiza este anuncio de Facebook Ads y devuelve SOLO un JSON válido con esta estructura exacta:
{
  "angulo": "descripción del ángulo emocional en máximo 8 palabras",
  "formula_hook": "estructura del hook en formato A → B → C",
  "big_idea": "la idea central en máximo 12 palabras",
  "sofisticacion": número del 1 al 5,
  "sofisticacion_label": "descripción del nivel de sofisticación del mercado según escala Schwartz",
  "dias_fatiga": número estimado de días antes de que el creativo se fatigue,
  "brecha": "oportunidad competitiva detectada en máximo 15 palabras"
}
No incluyas explicaciones, solo el JSON.`;

    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Anuncio: ${fullCopy}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (r.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit. Intenta en un momento." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (r.status === 402) {
      return new Response(JSON.stringify({ error: "Créditos IA agotados. Recarga el workspace." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed;
    try { parsed = JSON.parse(content); }
    catch { parsed = { raw: content }; }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
