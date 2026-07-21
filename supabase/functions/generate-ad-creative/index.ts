// SUPERNOVA — Generador de creativo de anuncio (imagen estática) vía Gemini
// "Nano Banana". Reusa el mismo GEMINI_API_KEY/LOVABLE_API_KEY que ya usamos
// para texto (oraculo-generate, ai-chat) — sin proveedor nuevo, sin cuenta ni
// billing nuevo que configurar. Síncrono: la imagen vuelve en la misma
// respuesta (no hace falta job/webhook como con HeyGen, que sí es async).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface Body {
  prompt: string;
  aspectRatio?: "1:1" | "4:5" | "9:16"; // feed Meta / feed vertical Meta / Stories-Reels-TikTok
}

const ASPECT_HINT: Record<string, string> = {
  "1:1": "square 1:1 format, Instagram/Facebook feed ad",
  "4:5": "vertical 4:5 format, Instagram/Facebook feed ad",
  "9:16": "vertical 9:16 full-screen format, Instagram/TikTok Stories and Reels ad",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing GEMINI_API_KEY" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    const prompt = (body.prompt ?? "").trim();
    if (!prompt) {
      return new Response(JSON.stringify({ error: "prompt requerido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aspectHint = ASPECT_HINT[body.aspectRatio ?? "1:1"];
    const fullPrompt = `${prompt}\n\nFormato: ${aspectHint}. Estilo publicitario profesional, alta calidad, listo para usar como creativo de anuncio en redes sociales.`;

    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-2.5-flash-image",
        prompt: fullPrompt,
        response_format: "b64_json",
        n: 1,
      }),
    });

    if (r.status === 429) {
      const t = await r.text();
      return new Response(JSON.stringify({ error: "Rate limit o cuota agotada", detail: t.slice(0, 500) }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ error: `Error generando imagen (${r.status})`, detail: t.slice(0, 500) }), {
        status: r.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await r.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      return new Response(JSON.stringify({ error: "La API no devolvió una imagen" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ image: `data:image/png;base64,${b64}` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
