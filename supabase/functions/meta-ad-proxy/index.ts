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

    // Hasta aquí todo salió de la caché: dato público, se sirve a cualquiera.
    // Un anuncio SIN caché cuesta un scrape de Firecrawl, y antes cualquiera
    // pedía ?id=1…N y cada uno gastaba un crédito. Eso ahora solo se hace para
    // un usuario real con acceso, y con tope de uso.
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const { data: who } = token ? await admin.auth.getUser(token) : { data: null };
    const userId = who?.user?.id;
    if (!userId) return json({ success: false, id, reason: "auth_required" }, 401);
    const { data: g, error: gErr } = await admin.rpc("edge_guard", {
      p_user_id: userId, p_fn: "meta-ad-proxy", p_max_hour: 200, p_max_day: 1500,
    });
    if (gErr || g?.ok !== true) {
      return json({ success: false, id, reason: g?.reason ?? "guard_error" }, g?.reason === "rate_limited" ? 429 : 403);
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

    // El mismo HTML trae a dónde lleva el anuncio. Se guarda para que
    // offer-intel lo lea de la caché en vez de pagar otro scrape.
    const link = extractLink(html, links);

    // 2) Persist (no esperar al usuario). Solo se escriben las columnas de
    // enlace si se encontró algo: no se pisa lo que ya guardó offer-intel.
    admin.from("ad_media_cache").upsert({
      ad_id: id,
      image_url: imageUrl || null,
      video_url: cleanVideo,
      failed,
      updated_at: new Date().toISOString(),
      ...(link.linkUrl ? { link_url: link.linkUrl } : {}),
      ...(link.caption ? { link_caption: link.caption } : {}),
      ...(link.cta ? { cta_text: link.cta } : {}),
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

// Misma lógica que parseSnapshot() de offer-intel (enlace, dominio y CTA);
// si cambia una, cambiar la otra.
const TRACKING = /^(utm_[a-z_]+|fbclid|gclid|gbraid|wbraid|ttclid|msclkid|sck|xcod|src|bid|hsa_[a-z_]+|campaign_id|adset_id|ad_id|placement|site_source_name|h|__tn__|c\[\d+\])$/i;
const META_HOSTS = /(^|\.)(facebook\.com|fb\.com|fb\.me|instagram\.com|messenger\.com|fbcdn\.net|meta\.com|fbsbx\.com)$/i;

function extractLink(html: string, links: string[]): { linkUrl: string | null; caption: string | null; cta: string | null } {
  const candidates = [
    ...matchAll(html, /"link_url"\s*:\s*"([^"]+)"/g).map(unescapeUrl),
    ...matchAll(html, /l\.facebook\.com\\?\/l\.php\?u=([^"&\\]+)/g).map((u) => { try { return decodeURIComponent(u); } catch { return ""; } }),
    ...links.filter((l) => /l\.facebook\.com\/l\.php\?u=/.test(l)).map((l) => { try { return new URL(l).searchParams.get("u") ?? ""; } catch { return ""; } }),
  ];
  let linkUrl: string | null = null;
  for (const c of candidates) {
    try {
      const u = new URL(c);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      if (META_HOSTS.test(u.hostname.replace(/^www\./, ""))) continue;
      for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
      u.hash = "";
      linkUrl = u.toString().slice(0, 1500);
      break;
    } catch { /* candidato no es URL */ }
  }
  const caption = matchAll(html, /"caption"\s*:\s*"([^"]{3,80})"/g).map(unescapeUrl).find((c) => /\./.test(c) && !/\s/.test(c)) ?? null;
  const cta = matchAll(html, /"cta_text"\s*:\s*"([^"]{2,40})"/g)[0] ?? null;
  return { linkUrl, caption: caption?.toLowerCase() ?? null, cta };
}

function json(body: unknown, status = 200) {
  // Caché larga solo para un resultado bueno: un 401/429/fallo guardado un día
  // en el navegador dejaría esa tarjeta sin preview aunque ya se pueda resolver.
  const cacheable = status === 200 && (body as { success?: boolean } | null)?.success === true;
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": cacheable ? "public, max-age=86400" : "no-store",
    },
  });
}
