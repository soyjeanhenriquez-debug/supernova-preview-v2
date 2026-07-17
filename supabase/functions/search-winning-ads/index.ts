import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// eslint-disable @typescript-eslint/no-explicit-any

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");

    let keywords: string[] = [];
    try {
      const body = await req.json();
      keywords = body.keywords || [];
    } catch {
      /* cron */
    }

    if (keywords.length === 0) {
      const { data: kw } = await supabaseAdmin.from("keywords").select("keyword").eq("is_active", true);
      keywords = (kw || []).map((k: unknown) => k.keyword);
    }

    if (keywords.length === 0) {
      return new Response(JSON.stringify({ found: 0, message: "No keywords" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalFound = 0;

    for (const keyword of keywords.slice(0, 10)) {
      try {
        const adsFound: unknown[] = [];

        if (FIRECRAWL_API_KEY) {
          const searchResponse = await fetch("https://api.firecrawl.dev/v1/search", {
            method: "POST",
            headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              query: `${keyword} anuncio publicidad ads facebook instagram site:facebook.com OR site:instagram.com`,
              limit: 8,
              scrapeOptions: { formats: ["markdown"] },
            }),
          });
          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            const items = searchData.data || [];
            for (const item of items.slice(0, 8)) {
              if (item.title || item.description) {
                const platforms = detectPlatforms(item.url || "");
                const body = item.description || item.markdown?.slice(0, 400) || "";
                // No inventamos datos: si no hay info real de delivery o impresiones, queda null.
                adsFound.push({
                  keyword,
                  advertiser: extractAdvertiser(item.url || ""),
                  page_id: extractAdvertiser(item.url || ""),
                  page_name: extractAdvertiser(item.url || ""),
                  ad_title: item.title || "Sin título",
                  ad_description: body,
                  ad_body: body,
                  ad_url: item.url || "",
                  platform: platforms[0] === "facebook" ? "Meta" : "Web",
                  publisher_platforms: platforms,
                  delivery_start_time: null,
                  delivery_stop_time: null,
                  impressions_lower: null,
                  impressions_upper: null,
                  market: detectMarket(item.url || ""),
                  scraped_at: new Date().toISOString(),
                });
              }
            }
          }
        }

        if (adsFound.length > 0) {
          // Dedupe within the batch and upsert against (keyword, ad_url)
          // so re-running the same keyword never creates duplicates.
          const seen = new Set<string>();
          const unique = adsFound.filter((ad) => {
            const key = `${ad.keyword}|${ad.ad_url}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          const { error } = await supabaseAdmin
            .from("winning_ads")
            .upsert(unique, { onConflict: "keyword,ad_url" });
          if (!error) totalFound += unique.length;
          else console.error("Upsert error:", error);
        }

        await supabaseAdmin
          .from("keywords")
          .update({ last_searched_at: new Date().toISOString() })
          .eq("keyword", keyword);
      } catch (err) {
        console.error(`Error keyword "${keyword}":`, err);
      }
    }

    return new Response(JSON.stringify({ found: totalFound }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function extractAdvertiser(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "").split(".")[0];
  } catch {
    return "Desconocido";
  }
}

function detectPlatforms(url: string): string[] {
  const platforms: string[] = [];
  if (url.includes("facebook")) platforms.push("facebook");
  if (url.includes("instagram")) platforms.push("instagram");
  if (platforms.length === 0) platforms.push("facebook");
  return platforms;
}

function detectMarket(url: string): string {
  if (/\.br|brasil|portugu/i.test(url)) return "BR";
  if (/\.mx|mexico/i.test(url)) return "MX";
  if (/\.es|spain|españa/i.test(url)) return "ES";
  if (/\.de|\.at|\.ch(\/|$)|deutsch|german/i.test(url)) return "DE";
  if (/\.ru|\.kz|\.by|russi|русск/i.test(url)) return "RU";
  if (/\.com|usa/i.test(url)) return "US";
  return "LATAM";
}

