// SUPERNOVA — Meta Ad Snapshot (Firecrawl screenshot)
// Meta bloquea iframes y server-fetches del render_ad. Firecrawl renderiza
// la Ad Library pública con browser real y devuelve un screenshot que SÍ
// podemos mostrar como <img>.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id || !/^\d+$/.test(id)) {
      return json({ error: "Missing or invalid id" }, 400);
    }

    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) return json({ error: "FIRECRAWL_API_KEY not configured" }, 500);

    const target = `https://www.facebook.com/ads/library/?id=${id}`;

    const fcRes = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: target,
        formats: ["screenshot", "links"],
        onlyMainContent: false,
        waitFor: 3500,
        location: { country: "US", languages: ["en"] },
      }),
    });

    const data = await fcRes.json().catch(() => ({}));
    if (!fcRes.ok) {
      console.error("Firecrawl error:", data);
      return json({ error: "Firecrawl failed", detail: data }, fcRes.status);
    }

    // Soporta ambos shapes (v2 SDK / REST)
    const screenshot =
      data?.screenshot ||
      data?.data?.screenshot ||
      data?.data?.[0]?.screenshot ||
      null;

    // Buscar URL de video si existe entre los links
    const links: string[] =
      data?.links || data?.data?.links || data?.data?.[0]?.links || [];
    const videoUrl = links.find((l) =>
      /\.(mp4|m3u8|webm)(\?|$)/i.test(l) || /video.*\.fbcdn/i.test(l),
    ) || null;

    return json({
      success: true,
      id,
      screenshot,
      videoUrl,
      libraryUrl: target,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
