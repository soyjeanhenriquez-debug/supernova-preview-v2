// SUPERNOVA — Facebook Ad Library proxy
// Usa FACEBOOK_ACCESS_TOKEN (server-side) para consultar la Ad Library API.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = Deno.env.get("FACEBOOK_ACCESS_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing FACEBOOK_ACCESS_TOKEN" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const url = new URL(req.url);
    const q = (body.search_terms ?? url.searchParams.get("search_terms") ?? "").toString().trim();
    const country = (body.country ?? url.searchParams.get("country") ?? "US").toString();
    const limit = Number(body.limit ?? url.searchParams.get("limit") ?? 25);
    const adType = (body.ad_type ?? url.searchParams.get("ad_type") ?? "ALL").toString();
    const adActiveStatus = (body.ad_active_status ?? url.searchParams.get("ad_active_status") ?? "ACTIVE").toString();

    if (!q) {
      return new Response(JSON.stringify({ error: "search_terms is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseFields = [
      "id", "ad_creation_time", "ad_delivery_start_time", "ad_delivery_stop_time",
      "ad_creative_bodies", "ad_creative_link_titles", "ad_creative_link_descriptions",
      "ad_creative_link_captions", "ad_snapshot_url", "page_id", "page_name",
      "publisher_platforms", "impressions", "spend", "currency", "languages",
    ];
    // Pedimos también total_count (algunos endpoints lo soportan); si la API
    // rechaza el campo, reintentamos sin él.
    const fieldsWithTotal = [...baseFields, "total_count"].join(",");
    const fieldsBase = baseFields.join(",");

    const buildUrl = (fields: string) => {
      const u = new URL("https://graph.facebook.com/v21.0/ads_archive");
      u.searchParams.set("access_token", token);
      u.searchParams.set("search_terms", q);
      u.searchParams.set("ad_reached_countries", JSON.stringify([country]));
      u.searchParams.set("ad_type", adType);
      u.searchParams.set("ad_active_status", adActiveStatus);
      u.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 100)));
      u.searchParams.set("fields", fields);
      return u;
    };

    let r = await fetch(buildUrl(fieldsWithTotal).toString());
    let data = await r.json();
    if (!r.ok) {
      // Fallback: reintentar sin total_count si la API lo rechaza
      r = await fetch(buildUrl(fieldsBase).toString());
      data = await r.json();
    }

    if (!r.ok) {
      console.error("FB error:", data);
      return new Response(JSON.stringify({ error: "Facebook API error", detail: data }), {
        status: r.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
