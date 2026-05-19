// SUPERNOVA — Meta Ad Snapshot Proxy
// Meta sirve el `render_ad` con X-Frame-Options: DENY, lo que impide
// embeberlo directamente en un iframe. Esta función actúa como proxy:
// hace fetch server-side del snapshot y reenvía el HTML sin esos headers,
// permitiendo embeberlo (estilo Adheart).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let target = url.searchParams.get("url");
    let id = url.searchParams.get("id");
    const token = Deno.env.get("FACEBOOK_ACCESS_TOKEN");

    // Si llega url, extraer el id para reinyectar SIEMPRE nuestro token válido
    if (target && !id) {
      try {
        const tu = new URL(target);
        id = tu.searchParams.get("id");
      } catch { /* ignore */ }
    }

    if (id && token) {
      target = `https://www.facebook.com/ads/archive/render_ad/?id=${encodeURIComponent(id)}&access_token=${token}`;
    } else if (!target) {
      return new Response("Missing url or id", {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }

    // Whitelist: solo facebook.com
    try {
      const u = new URL(target);
      if (!/(^|\.)facebook\.com$/i.test(u.hostname)) {
        return new Response("Only facebook.com URLs are allowed", {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "text/plain" },
        });
      }
    } catch {
      return new Response("Invalid URL", {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }

    const upstream = await fetch(target, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
      },
      redirect: "follow",
    });

    const contentType = upstream.headers.get("content-type") || "text/html; charset=utf-8";
    const body = await upstream.text();

    // Inyectar <base> para resolver assets relativos hacia facebook.com
    let html = body;
    if (contentType.includes("text/html") && !/<base\s/i.test(html)) {
      html = html.replace(
        /<head([^>]*)>/i,
        `<head$1><base href="https://www.facebook.com/">`,
      );
    }

    return new Response(html, {
      status: upstream.status,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        // Sin X-Frame-Options / frame-ancestors → embebible
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    return new Response(`Proxy error: ${e instanceof Error ? e.message : "unknown"}`, {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  }
});
