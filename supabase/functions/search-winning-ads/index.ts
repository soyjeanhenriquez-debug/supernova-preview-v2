import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
      keywords = (kw || []).map((k: any) => k.keyword);
    }

    if (keywords.length === 0) {
      return new Response(JSON.stringify({ found: 0, message: "No keywords" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalFound = 0;

    for (const keyword of keywords.slice(0, 10)) {
      try {
        let adsFound: any[] = [];

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
        } else {
          adsFound = generateDemoWinnerGroups(keyword);
        }

        if (adsFound.length > 0) {
          const { error } = await supabaseAdmin.from("winning_ads").insert(adsFound);
          if (!error) totalFound += adsFound.length;
          else console.error("Insert error:", error);
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
  if (/\.com|usa/i.test(url)) return "US";
  return "LATAM";
}

// ============================================================
// DEMO: grupos realistas con 3-5 variantes por anunciante
// ============================================================
function generateDemoWinnerGroups(keyword: string): any[] {
  const now = Date.now();
  const day = 86400000;

  const groups = [
    // Grupo 1: MEGA WINNER infoproducto BR — 5 variantes, 52 días
    {
      page_id: `demo_${keyword}_saudebr`,
      page_name: "Saúde & Bem-Estar BR",
      market: "BR",
      platform: "Meta",
      platforms: ["facebook", "instagram"],
      start: now - 52 * day,
      imp: 2800000,
      variants: [
        { title: "Descubra o Método Natural", body: `O segredo que os médicos não querem que você saiba para emagrecer 10kg em 30 dias sem dieta e sem academia. Mais de 47.000 pessoas já transformaram seus corpos com este método natural ${keyword}. Garantia de 60 dias ou seu dinheiro de volta.` },
        { title: "Método Natural Comprovado", body: `O segredo dos médicos para emagrecer 10kg em 30 dias sem dieta. 47.000 pessoas já transformaram seus corpos. Método natural ${keyword}, garantia de 60 dias.` },
        { title: "Emagreça 10kg em 30 dias", body: `Médicos escondem este segredo natural para emagrecer 10kg em 30 dias. Sem dieta, sem academia. Mais de 47.000 transformações ${keyword}. Garantia total.` },
        { title: "O Segredo dos Médicos", body: `${keyword}: o método natural que os médicos não querem que você saiba. Emagreça 10kg em 30 dias sem dieta. 47.000 alunos satisfeitos. Garantia de 60 dias.` },
        { title: "Transforme Seu Corpo", body: `Método natural ${keyword} comprovado: emagrecimento de 10kg em 30 dias sem dieta nem academia. Segredo médico revelado. Garantia 60 dias.` },
      ],
    },
    // Grupo 2: RISING ecommerce México — 3 variantes, 18 días
    {
      page_id: `demo_${keyword}_envioshop`,
      page_name: "EnvíoShop México",
      market: "MX",
      platform: "Meta",
      platforms: ["facebook", "instagram"],
      start: now - 18 * day,
      imp: 650000,
      variants: [
        { title: "Envío Gratis Hoy", body: `Última oportunidad: ${keyword} con 50% OFF y envío gratis a todo México. Solo hoy. Más de 12.000 clientes felices este mes. Garantía de devolución.` },
        { title: "50% OFF + Envío Gratis", body: `${keyword} con descuento del 50% y envío gratis. Solo hoy. 12.000 clientes felices. Garantía total de devolución.` },
        { title: "Última Oportunidad", body: `Hoy: ${keyword} 50% OFF + envío gratis México. 12.000 clientes este mes. Garantía de devolución sin preguntas.` },
      ],
    },
    // Grupo 3: MEGA ecommerce US — 4 variantes, 75 días
    {
      page_id: `demo_${keyword}_skinglow`,
      page_name: "SkinGlow Official",
      market: "US",
      platform: "Meta",
      platforms: ["facebook", "instagram"],
      start: now - 75 * day,
      imp: 6200000,
      variants: [
        { title: "Dermatologist Approved", body: `The ${keyword} routine that dermatologists are talking about. 92% of users saw visible results in 14 days. Free shipping worldwide, 90-day money back guarantee. Join 200K+ happy customers.` },
        { title: "92% See Results in 14 Days", body: `${keyword} routine recommended by dermatologists. 92% visible results in 14 days. 200K+ customers. Free shipping, 90-day guarantee.` },
        { title: "Join 200K+ Customers", body: `Dermatologist-recommended ${keyword}. 92% see results in 14 days. 200K customers. Free worldwide shipping. 90-day money back.` },
        { title: "Visible Results in 14 Days", body: `${keyword} approved by dermatologists. 92% users see visible results in 14 days. Free shipping, 90-day guarantee, 200K+ satisfied customers.` },
      ],
    },
    // Grupo 4: SOLID curso España — 2 variantes, 9 días
    {
      page_id: `demo_${keyword}_academia`,
      page_name: "Academia Pro ES",
      market: "ES",
      platform: "Meta",
      platforms: ["facebook"],
      start: now - 9 * day,
      imp: 180000,
      variants: [
        { title: "Curso Intensivo Online", body: `Aprende ${keyword} desde cero con nuestro curso intensivo. 30 horas de contenido + certificado. Más de 5.000 alumnos. Acceso de por vida.` },
        { title: "Domina en 30 Días", body: `Curso de ${keyword} con certificado oficial. 30 horas de contenido, 5.000 alumnos satisfechos. Acceso de por vida garantizado.` },
      ],
    },
  ];

  const all: any[] = [];
  for (const g of groups) {
    g.variants.forEach((v, i) => {
      all.push({
        keyword,
        advertiser: g.page_name,
        page_id: g.page_id,
        page_name: g.page_name,
        ad_title: v.title,
        ad_description: v.body,
        ad_body: v.body,
        ad_url: `https://facebook.com/ads/library/?id=demo_${g.page_id}_${i}`,
        platform: g.platform,
        publisher_platforms: g.platforms,
        delivery_start_time: new Date(g.start - i * 2 * day).toISOString(),
        delivery_stop_time: null,
        impressions_lower: g.imp,
        impressions_upper: Math.round(g.imp * 1.2),
        market: g.market,
        scraped_at: new Date().toISOString(),
      });
    });
  }
  return all;
}
