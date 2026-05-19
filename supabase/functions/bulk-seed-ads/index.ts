// SUPERNOVA — Bulk seeder for winning_ads using Facebook Ad Library API.
// Recorre N keywords maestras × M países, llama a /ads_archive con limit alto y
// guarda todo en winning_ads. Pensado para inflar el catálogo a miles de anuncios.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FB_FIELDS = [
  "id", "ad_creation_time", "ad_delivery_start_time", "ad_delivery_stop_time",
  "ad_creative_bodies", "ad_creative_link_titles", "ad_creative_link_descriptions",
  "ad_creative_link_captions", "ad_snapshot_url", "page_id", "page_name",
  "publisher_platforms", "impressions", "spend", "currency", "languages",
].join(",");

// Universo DR masivo. Mezcla inglés/español/portugués + verticales high-spend.
const SEED_KEYWORDS = [
  // Disclaimers FB-required (caza casi todo infoproducto)
  "results not typical", "individual results may vary", "this is an advertisement",
  "paid partnership", "sponsored", "aviso de afiliado", "los resultados pueden variar",
  "resultados no típicos", "isto é um anúncio", "resultados podem variar",
  // Plataformas / pasarelas
  "hotmart", "kiwify", "clickbank", "digistore24", "shopify", "stripe checkout",
  "thrivecart", "samcart", "kajabi", "teachable", "systeme.io", "groove funnels",
  // CTAs universales
  "learn more", "shop now", "get started", "claim your", "sign up free", "try it now",
  "free shipping", "free + shipping", "risk free", "money back guarantee",
  "más información", "comprar ahora", "envío gratis", "garantía devolución",
  "saiba mais", "compre agora", "frete grátis", "garantia 30 dias",
  // Hooks clásicos
  "the secret", "el secreto", "o segredo", "weird trick", "one weird trick",
  "doctors hate", "doctors don't want", "scientists discovered", "they don't want you to know",
  "before and after", "antes y después", "antes e depois",
  "as seen on tv", "as seen on", "bestseller", "número 1", "top rated",
  // Make money / negocios
  "work from home", "trabaja desde casa", "trabalhe de casa",
  "passive income", "ingresos pasivos", "renda passiva",
  "make money online", "ganar dinero online", "ganhar dinheiro online",
  "side hustle", "negocio desde casa", "dinero extra",
  "dropshipping", "affiliate marketing", "amazon fba", "print on demand",
  "high ticket", "closer", "appointment setter", "smma", "agency owner",
  // Trading / cripto
  "forex", "day trading", "swing trading", "options trading", "trading view",
  "crypto", "bitcoin", "ethereum", "altcoin", "memecoin",
  "trading signals", "señales de trading", "sinais de trading",
  // Salud / pérdida de peso
  "lose weight", "perder peso", "emagrecer", "emagrecer rápido",
  "keto", "keto diet", "ayuno intermitente", "intermittent fasting", "jejum intermitente",
  "fat burner", "quema grasa", "queima gordura",
  "metabolism boost", "smoothie diet", "flat belly",
  // Salud condiciones
  "diabetes", "blood sugar", "type 2 diabetes",
  "joint pain", "back pain", "neuropathy", "tinnitus",
  "prostate", "menopause", "ed pills", "testosterone booster",
  "hair loss", "caída del cabello", "queda de cabelo",
  "anti aging", "wrinkle cream", "skin care", "skincare routine",
  // Real estate / finanzas
  "real estate", "bienes raíces", "imóveis", "real estate investing",
  "rental property", "airbnb arbitrage", "tax deed", "credit repair",
  "credit score", "debt free", "stock market", "dividend investing",
  // Educación / cursos
  "webinar gratuito", "free webinar", "masterclass", "free training",
  "curso gratis", "treinamento gratuito", "online course",
  "limited spots", "cupo limitado", "vagas limitadas",
  "certificación", "certification", "bootcamp",
  // Funnels / DR lingo
  "vsl", "video sales letter", "landing page", "lead magnet", "tripwire",
  "challenge funnel", "webinar funnel", "evergreen webinar",
  // Urgencia / escasez
  "limited time", "last chance", "última oportunidad", "ends today",
  "today only", "solo hoy", "só hoje", "ending soon", "ofertaflash",
  "black friday", "cyber monday", "flash sale", "doorbusters",
  // Tech / SaaS / AI
  "ai tool", "ai app", "chatgpt", "chat gpt", "ai automation",
  "try free", "free trial", "prueba gratis", "teste grátis",
  "saas", "crm", "automation tool", "no code", "low code",
  "ai agent", "ai chatbot", "ai writer", "ai video", "ai voice",
  "ai image generator", "deepfake", "midjourney", "claude ai",
  // Ecom verticals
  "pet supplies", "dog training", "cat toys",
  "kitchen gadget", "viral product", "tiktok made me buy it",
  "skincare", "makeup", "lash serum", "lip plumper",
  "shapewear", "leggings", "athleisure",
  "smart watch", "wireless earbuds", "phone accessories",
  "home decor", "led lights", "indoor plants",
  "kids toys", "baby products", "stroller",
  // Marketing / agencias
  "agency", "agencia digital", "lead generation", "leads qualificados",
  "google ads", "facebook ads", "tiktok ads", "meta ads",
  "marketing automation", "email marketing", "funnel builder",
  // Religión / coaching / desarrollo personal
  "manifestation", "law of attraction", "ley de atracción",
  "spiritual awakening", "soulmate", "twin flame",
  "mindset coach", "life coach", "high performance",
  "abundance", "abundancia", "prosperidade",
  // Apuestas / juegos
  "casino online", "betting app", "fantasy sports",
  "mobile game", "rpg game", "strategy game",
  // Apps / dating
  "dating app", "find love", "soulmates", "encuentra pareja",
  // Servicios B2B
  "outsource", "virtual assistant", "asistente virtual",
  "white label", "saas reseller",
];


const SEED_COUNTRIES = ["US", "ES", "BR", "MX", "AR", "CO", "PT", "GB"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = Deno.env.get("FACEBOOK_ACCESS_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing FACEBOOK_ACCESS_TOKEN" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const keywords: string[] = Array.isArray(body.keywords) && body.keywords.length
      ? body.keywords
      : SEED_KEYWORDS;
    const countries: string[] = Array.isArray(body.countries) && body.countries.length
      ? body.countries
      : SEED_COUNTRIES;
    const limit = Math.min(Number(body.limit ?? 100), 100);
    const maxJobs = Math.min(Number(body.max_jobs ?? 200), 500);

    // Build jobs (keyword × country) shuffled, truncated to maxJobs
    const jobs: { kw: string; country: string }[] = [];
    for (const kw of keywords) {
      for (const c of countries) jobs.push({ kw, country: c });
    }
    jobs.sort(() => Math.random() - 0.5);
    const slice = jobs.slice(0, maxJobs);

    // Existing ad_urls to dedupe (load up to 5000 latest)
    const { data: existing } = await supabase
      .from("winning_ads")
      .select("ad_url")
      .order("scraped_at", { ascending: false })
      .limit(5000);
    const seenUrls = new Set<string>((existing ?? []).map((r) => r.ad_url).filter(Boolean) as string[]);

    let totalInserted = 0;
    let totalFetched = 0;
    let totalErrors = 0;

    // Run in batches of 8 in parallel to be polite with FB API
    const CONCURRENCY = 8;
    for (let i = 0; i < slice.length; i += CONCURRENCY) {
      const batch = slice.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(async ({ kw, country }) => {
        const url = new URL("https://graph.facebook.com/v21.0/ads_archive");
        url.searchParams.set("access_token", token);
        url.searchParams.set("search_terms", kw);
        url.searchParams.set("ad_reached_countries", JSON.stringify([country]));
        url.searchParams.set("ad_type", "ALL");
        url.searchParams.set("ad_active_status", "ACTIVE");
        url.searchParams.set("limit", String(limit));
        url.searchParams.set("fields", FB_FIELDS);
        try {
          const r = await fetch(url.toString());
          const data = await r.json();
          if (!r.ok) return { kw, country, items: [], err: data?.error?.message ?? r.statusText };
          return { kw, country, items: data?.data ?? [] };
        } catch (e) {
          return { kw, country, items: [], err: e instanceof Error ? e.message : "fetch_err" };
        }
      }));

      const rows: any[] = [];
      for (const r of results) {
        if (r.err) { totalErrors++; continue; }
        totalFetched += r.items.length;
        for (const it of r.items) {
          const body = (it.ad_creative_bodies?.[0] ?? "").toString();
          const title = (it.ad_creative_link_titles?.[0] ?? it.page_name ?? "Anuncio").toString();
          const adUrl = it.ad_snapshot_url ?? (it.page_id ? `https://www.facebook.com/ads/library/?id=${it.id}` : "");
          if (!adUrl || seenUrls.has(adUrl)) continue;
          seenUrls.add(adUrl);

          const start = it.ad_delivery_start_time ? new Date(it.ad_delivery_start_time) : null;
          const days = start ? Math.max(1, Math.floor((Date.now() - start.getTime()) / 86400000)) : 1;
          const platforms = it.publisher_platforms ?? ["facebook"];
          const tier = days >= 60 ? "mega" : days >= 14 ? "rising" : "solid";
          const score = Math.min(100, 40 + Math.floor(days / 2));

          rows.push({
            keyword: r.kw,
            advertiser: it.page_name ?? "Desconocido",
            page_id: it.page_id ?? null,
            page_name: it.page_name ?? null,
            ad_title: title,
            ad_description: body,
            ad_body: body,
            ad_url: adUrl,
            platform: "Meta",
            publisher_platforms: platforms,
            delivery_start_time: start?.toISOString() ?? null,
            delivery_stop_time: it.ad_delivery_stop_time ?? null,
            market: r.country,
            days_active: days,
            tier,
            winner_score: score,
            scraped_at: new Date().toISOString(),
          });
        }
      }

      if (rows.length) {
        // Insert in chunks of 200
        for (let j = 0; j < rows.length; j += 200) {
          const chunk = rows.slice(j, j + 200);
          const { error } = await supabase.from("winning_ads").insert(chunk);
          if (error) {
            console.error("insert error:", error.message);
            totalErrors++;
          } else {
            totalInserted += chunk.length;
          }
        }
      }
    }

    return new Response(JSON.stringify({
      jobs_run: slice.length,
      fetched: totalFetched,
      inserted: totalInserted,
      errors: totalErrors,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
