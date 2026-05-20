// supabase/functions/tiktok-search/index.ts
// Busca anuncios en la TikTok Ads Library usando Firecrawl (scraping público).
// No requiere API oficial de TikTok.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface ScrapedAd {
  advertiserName?: string;
  adText?: string;
  thumbnailUrl?: string;
  videoDuration?: number;
  daysRunning?: number;
  region?: string;
  impressionsRange?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ data: [], error: "FIRECRAWL_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const keyword = (body.keyword ?? body.search_terms ?? "").toString().trim();
    const region = (body.region ?? "US,MX,CO,AR,ES,BR").toString();

    if (!keyword) {
      return new Response(
        JSON.stringify({ data: [], error: "keyword is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tiktokUrl =
      `https://library.tiktok.com/ads?` +
      `keyword=${encodeURIComponent(keyword)}` +
      `&region=${encodeURIComponent(region)}` +
      `&period=180&sort_type=last_shown_date`;

    const firecrawlResp = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: tiktokUrl,
        formats: [
          {
            type: "json",
            prompt:
              "Extract all visible ads from this TikTok Ads Library page. " +
              "Return JSON {\"ads\": [...]}. For each ad: advertiserName (string), " +
              "adText (string|null), thumbnailUrl (string|null), videoDuration (number|null), " +
              "daysRunning (number|null), region (string|null), impressionsRange (string|null). " +
              "If no ads found return {\"ads\": []}.",
          },
        ],
        onlyMainContent: true,
        waitFor: 3000,
      }),
    });

    if (!firecrawlResp.ok) {
      const errText = await firecrawlResp.text().catch(() => "");
      return new Response(
        JSON.stringify({ data: [], error: `Firecrawl ${firecrawlResp.status}`, detail: errText.slice(0, 500) }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const scraped = await firecrawlResp.json();
    // El payload v2 puede venir como { json: { ads: [...] } } o anidado en data
    const rawAds: ScrapedAd[] =
      scraped?.json?.ads ??
      scraped?.data?.json?.ads ??
      scraped?.data?.extract?.ads ??
      [];

    const mappedAds = rawAds.map((ad, index) => ({
      id: `tiktok_${Date.now()}_${index}`,
      source: "tiktok",
      page_name: ad.advertiserName || "Anunciante TikTok",
      ad_creative_bodies: ad.adText ? [ad.adText] : [],
      ad_delivery_start_time: ad.daysRunning
        ? new Date(Date.now() - ad.daysRunning * 86400000).toISOString()
        : null,
      days_active: ad.daysRunning ?? 0,
      ad_snapshot_url: ad.thumbnailUrl ?? null,
      impressions: {
        lower_bound:
          ad.impressionsRange?.split("-")[0]?.replace(/[^0-9]/g, "") || "0",
      },
      publisher_platforms: ["tiktok"],
      duplicate_count: 1,
      unique_pages_count: 1,
    }));

    return new Response(
      JSON.stringify({ data: mappedAds, source: "tiktok", keyword, region }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ data: [], error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
