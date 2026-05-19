// SUPERNOVA — Meta Ad Media Extractor
// Scrape el Ad Library con Firecrawl (browser real) y extrae directamente
// la URL del video (fbcdn) o imagen del creativo, para mostrarla nativa.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id || !/^\d+$/.test(id)) return json({ error: "Missing or invalid id" }, 400);

    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) return json({ error: "FIRECRAWL_API_KEY not configured" }, 500);

    const target = `https://www.facebook.com/ads/library/?id=${id}`;

    const fcRes = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: target,
        formats: ["rawHtml", "links"],
        onlyMainContent: false,
        waitFor: 4500,
        location: { country: "US", languages: ["en"] },
      }),
    });

    const data = await fcRes.json().catch(() => ({}));
    if (!fcRes.ok) {
      console.error("Firecrawl error:", data);
      return json({ error: "Firecrawl failed", detail: data }, fcRes.status);
    }

    const html: string =
      data?.rawHtml || data?.html || data?.data?.rawHtml || data?.data?.html || "";
    const links: string[] = data?.links || data?.data?.links || [];

    // --- Extraer URLs de media de fbcdn ---
    const videoUrl = pickFirst([
      ...matchAll(html, /"(?:browser_native_hd_url|browser_native_sd_url|playable_url_quality_hd|playable_url)"\s*:\s*"([^"]+\.mp4[^"]*)"/g),
      ...matchAll(html, /<video[^>]+src=["']([^"']+)["']/g),
      ...matchAll(html, /["'](https?:\\?\/\\?\/[^"']*\.mp4[^"']*)["']/g),
      ...links.filter((l) => /\.mp4(\?|$)/i.test(l)),
    ]);

    // Imagen del creativo (no avatar/logo). Buscar imágenes scontent.* > 400px ideal.
    const imageCandidates = [
      ...matchAll(html, /"(?:original_image_url|resized_image_url|image_url)"\s*:\s*"([^"]+)"/g),
      ...matchAll(html, /["'](https?:\\?\/\\?\/scontent[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/g),
      ...links.filter((l) => /scontent.*\.(jpg|jpeg|png|webp)/i.test(l)),
    ]
      .map(unescapeUrl)
      .filter((u) => !/static\.|emoji|spacer|safe_image/i.test(u));

    const imageUrl = pickFirst(imageCandidates);
    const cleanVideo = videoUrl ? unescapeUrl(videoUrl) : null;

    if (!cleanVideo && !imageUrl) {
      return json({ success: false, id, libraryUrl: target, reason: "no_media_found" }, 200);
    }

    return json({
      success: true,
      id,
      videoUrl: cleanVideo,
      imageUrl: imageUrl || null,
      libraryUrl: target,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

function matchAll(html: string, re: RegExp): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}
function pickFirst(arr: (string | undefined | null)[]): string | null {
  for (const v of arr) if (v && typeof v === "string") return v;
  return null;
}
function unescapeUrl(u: string): string {
  return u
    .replace(/\\u0026/g, "&")
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&");
}

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
