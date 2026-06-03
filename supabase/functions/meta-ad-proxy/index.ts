// SUPERNOVA — Meta Ad Media Extractor (cached)
// Estrategia:
//   1) Cache compartido en `ad_media_cache` → si ya está resuelto, respuesta < 100ms.
//   2) Si no, scrape con Firecrawl (waitFor reducido) y persiste en la tabla.
// Resultado: el primer usuario que ve un ad lo "calienta", los siguientes
// reciben el preview instantáneo.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// TTL: 14 días para hits, 6h para fallos (los reintentamos por si el ad ya apareció)
const TTL_OK_MS = 14 * 24 * 60 * 60_000;
const TTL_FAIL_MS = 6 * 60 * 60_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id || !/^\d+$/.test(id)) return json({ error: "Missing or invalid id" }, 400);

    // 1) Lookup cache
    const { data: cached } = await admin
      .from("ad_media_cache")
      .select("image_url,video_url,failed,updated_at")
      .eq("ad_id", id)
      .maybeSingle();

    if (cached) {
      const age = Date.now() - new Date(cached.updated_at).getTime();
      const ttl = cached.failed ? TTL_FAIL_MS : TTL_OK_MS;
      if (age < ttl) {
        if (cached.failed) {
          return json({ success: false, id, reason: "cached_no_media" });
        }
        return json({
          success: true,
          id,
          videoUrl: cached.video_url,
          imageUrl: cached.image_url,
          cached: true,
        });
      }
    }

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
        waitFor: 2500,
        timeout: 25000,
        location: { country: "US", languages: ["en"] },
      }),
    });

    const data = await fcRes.json().catch(() => ({}));
    if (!fcRes.ok) {
      console.error("Firecrawl error:", data);
      // Cachear fallo corto para no martillar — devolver 200 con success:false
      // para que el cliente lo trate como "sin preview" sin disparar error.
      await admin.from("ad_media_cache").upsert({
        ad_id: id, image_url: null, video_url: null, failed: true, updated_at: new Date().toISOString(),
      });
      return json({ success: false, id, reason: "scrape_failed", libraryUrl: target });
    }

    const html: string =
      data?.rawHtml || data?.html || data?.data?.rawHtml || data?.data?.html || "";
    const links: string[] = data?.links || data?.data?.links || [];

    const videoUrl = pickFirst([
      ...matchAll(html, /"(?:browser_native_hd_url|browser_native_sd_url|playable_url_quality_hd|playable_url)"\s*:\s*"([^"]+\.mp4[^"]*)"/g),
      ...matchAll(html, /<video[^>]+src=["']([^"']+)["']/g),
      ...matchAll(html, /["'](https?:\\?\/\\?\/[^"']*\.mp4[^"']*)["']/g),
      ...links.filter((l) => /\.mp4(\?|$)/i.test(l)),
    ]);

    const imageCandidates = [
      ...matchAll(html, /"(?:original_image_url|resized_image_url|image_url)"\s*:\s*"([^"]+)"/g),
      ...matchAll(html, /["'](https?:\\?\/\\?\/scontent[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/g),
      ...links.filter((l) => /scontent.*\.(jpg|jpeg|png|webp)/i.test(l)),
    ]
      .map(unescapeUrl)
      .filter((u) => !/static\.|emoji|spacer|safe_image/i.test(u));

    const imageUrl = pickFirst(imageCandidates);
    const cleanVideo = videoUrl ? unescapeUrl(videoUrl) : null;

    const failed = !cleanVideo && !imageUrl;

    // 2) Persist (no esperar al usuario)
    admin.from("ad_media_cache").upsert({
      ad_id: id,
      image_url: imageUrl || null,
      video_url: cleanVideo,
      failed,
      updated_at: new Date().toISOString(),
    }).then(() => {});

    if (failed) {
      return json({ success: false, id, libraryUrl: target, reason: "no_media_found" });
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
