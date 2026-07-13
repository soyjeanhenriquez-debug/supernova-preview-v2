import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// El frontend manda ids estilo gateway ("google/…") y algunos modelos 2.5
// no disponibles para cuentas nuevas de Gemini: se normalizan aquí.
const MODEL_MAP: Record<string, string> = {
  "gemini-2.5-pro": "gemini-3-pro-preview",
  "gemini-2.5-flash": "gemini-3-flash-preview",
  "gemini-2.5-flash-lite": "gemini-flash-lite-latest",
};

function normalizeModel(model?: string): string {
  const m = (model || "gemini-3-flash-preview").replace(/^google\//, "");
  return MODEL_MAP[m] ?? m;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, systemPrompt, model } = await req.json();
    const LOVABLE_API_KEY = (Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: normalizeModel(model),
        messages: [
          {
            role: "system",
            content: systemPrompt || `Eres el asistente IA de SUPERNOVA, una plataforma de gestión de campañas publicitarias. 
Tu rol es ayudar al usuario a:
- Optimizar campañas de Meta Ads, Google Ads, TikTok Ads
- Generar copy persuasivo y hooks de venta
- Analizar métricas (ROAS, CTR, CPA, CPM)
- Sugerir estrategias de targeting y audiencias
- Crear embudos de conversión efectivos
- Dar consejos sobre creatividades que convierten

Responde siempre en español. Sé directo, práctico y orientado a resultados. 
Cuando des copy o hooks, hazlos listos para usar. 
Usa emojis moderadamente para hacer las respuestas más visuales.`
          },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
