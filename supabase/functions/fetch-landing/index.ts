// SUPERNOVA — Fetch landing page HTML and extract relevant metadata server-side.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

function pick(html: string, re: RegExp): string {
  const m = html.match(re);
  return (m?.[1] ?? "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { url } = await req.json().catch(() => ({ url: "" }));
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ success: false, error: "url requerida" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: URL;
    try { parsed = new URL(url); } catch {
      return new Response(JSON.stringify({ success: false, error: "URL inválida" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const domain = parsed.hostname.replace(/^www\./, "");

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15000);

    let html = "";
    let status = 0;
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        },
      });
      status = res.status;
      html = await res.text();
    } finally {
      clearTimeout(t);
    }

    if (!html || status >= 400) {
      return new Response(JSON.stringify({
        success: false, domain, status,
        error: `No se pudo acceder (${status || "sin respuesta"})`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const title = pick(html, /<title[^>]*>([^<]+)<\/title>/i);
    const metaDescription = pick(html, /<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["']/i);
    const ogTitle = pick(html, /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    const ogDescription = pick(html, /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    const ogImage = pick(html, /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
    const siteName = pick(html, /<meta[^>]+property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i);

    const bodyText = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 5000);

    // Best-guess brand name
    const brandName = (siteName || ogTitle || title)
      .replace(/[|\-–—].*$/, "")
      .trim()
      .slice(0, 80) || domain;

    return new Response(JSON.stringify({
      success: true, domain, brandName,
      title, metaDescription, ogTitle, ogDescription, ogImage, bodyText, status,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
