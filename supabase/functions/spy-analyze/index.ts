import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function scrapeUrl(url: string, apiKey: string) {
  let formattedUrl = url.trim();
  if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
    formattedUrl = `https://${formattedUrl}`;
  }

  const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: formattedUrl,
      formats: ["markdown", "links"],
      onlyMainContent: true,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("Firecrawl scrape error:", data);
    throw new Error(data.error || `Firecrawl error ${response.status}`);
  }

  return {
    markdown: data.data?.markdown || data.markdown || "",
    links: data.data?.links || data.links || [],
    metadata: data.data?.metadata || data.metadata || {},
  };
}

async function searchWeb(query: string, apiKey: string) {
  const response = await fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `${query} ads landing page marketing`,
      limit: 8,
      scrapeOptions: { formats: ["markdown"] },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("Firecrawl search error:", data);
    throw new Error(data.error || `Firecrawl error ${response.status}`);
  }

  return data.data || [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { type, url, query } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY is not configured");

    if (type === "url") {
      // Step 1: Scrape the actual page with Firecrawl
      console.log("Scraping URL:", url);
      const scraped = await scrapeUrl(url, FIRECRAWL_API_KEY);
      
      // Step 2: Analyze scraped content with AI
      const pageContent = scraped.markdown.slice(0, 8000); // Limit context
      const prompt = `Analiza el contenido REAL de esta landing page/anuncio de competidor.

URL: ${url}
Título: ${scraped.metadata.title || "No disponible"}
Descripción: ${scraped.metadata.description || "No disponible"}

CONTENIDO REAL DE LA PÁGINA:
${pageContent}

LINKS ENCONTRADOS: ${scraped.links.slice(0, 20).join(", ")}

Basándote en el contenido REAL de la página, devuelve un análisis en formato JSON:
{
  "url": "${url}",
  "title": "título real de la página",
  "description": "descripción de qué se trata basada en el contenido real",
  "landing_analysis": "análisis detallado de la estrategia: estructura, oferta, urgencia, prueba social, elementos de conversión, etc.",
  "copy_hooks": ["hook exacto 1 que usan en la página", "hook 2", "hook 3", "hook 4", "hook 5"],
  "cta_text": "texto del CTA principal que detectas en el contenido",
  "audience_signals": ["señal de audiencia 1", "señal 2", "señal 3"],
  "ads_found": ["tipo de anuncio/oferta detectada"]
}

Extrae los hooks y CTAs REALES del contenido. Sé específico basándote en lo que realmente dice la página.`;

      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: "Eres un experto en análisis competitivo de publicidad digital. Responde SOLO con JSON válido, sin markdown ni explicaciones." },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (!aiResp.ok) {
        const t = await aiResp.text();
        console.error("AI error:", aiResp.status, t);
        throw new Error("Error en análisis de IA");
      }

      const aiData = await aiResp.json();
      const content = aiData.choices?.[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No se pudo parsear la respuesta de IA");

      return new Response(JSON.stringify({ result: JSON.parse(jsonMatch[0]) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else {
      // Step 1: Search with Firecrawl for real results
      console.log("Searching niche:", query);
      const searchResults = await searchWeb(query, FIRECRAWL_API_KEY);

      // Step 2: Enrich with AI analysis
      const resultsForAI = searchResults.map((r: any) => ({
        url: r.url,
        title: r.title,
        description: r.description,
        content_preview: (r.markdown || "").slice(0, 500),
      }));

      const prompt = `Analiza estos resultados REALES de búsqueda para el nicho "${query}".

RESULTADOS REALES:
${JSON.stringify(resultsForAI, null, 2)}

Para cada resultado, devuelve un array JSON enriquecido:
[
  {
    "title": "título real del resultado",
    "url": "URL real",
    "description": "análisis breve de por qué este resultado es relevante para espiar competidores, qué estrategia usan",
    "platform": "Meta/Google/TikTok/Web"
  }
]

Mantén las URLs reales. Agrega tu análisis de la estrategia detectada.`;

      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: "Eres un experto en análisis competitivo de publicidad digital. Responde SOLO con JSON válido." },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (!aiResp.ok) {
        const t = await aiResp.text();
        console.error("AI error:", aiResp.status, t);
        throw new Error("Error en análisis de IA");
      }

      const aiData = await aiResp.json();
      const content = aiData.choices?.[0]?.message?.content || "";
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      
      const results = jsonMatch ? JSON.parse(jsonMatch[0]) : searchResults.map((r: any) => ({
        title: r.title || "Sin título",
        url: r.url,
        description: r.description || "",
        platform: "Web",
      }));

      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("spy error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    const status = msg.includes("402") ? 402 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
