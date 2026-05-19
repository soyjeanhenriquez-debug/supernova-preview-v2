// Master keyword rotation engine — called by pg_cron every hour
// Picks N least-recently-run keywords from master_keyword_state, calls search-winning-ads, updates stats.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BATCH_SIZE = 5; // keywords per hourly run

// Master DR keyword library — mirror of src/lib/dr-keywords.ts (server-side copy)
const MASTER: Record<string, string[]> = {
  tier1_disclaimers: [
    "results not typical","individual results may vary","results may vary","this is an advertisement","paid advertisement","sponsored","affiliate disclosure","these statements have not been evaluated","not evaluated by the FDA","results are not guaranteed","income disclaimer","earnings disclaimer","typical results","see income disclosure","los resultados pueden variar","los resultados no son típicos","esto es publicidad pagada","aviso de afiliado","declaración de ingresos","resultados no garantizados",
  ],
  tier2_platforms: [
    "hotmart","kiwify","eduzz","monetizze","braip","ticto","lastlink","greenn","perfectpay","payt","clickbank","digistore24","digistore","warriorplus","warrior plus","jvzoo","paykickstart","thrivecart","samcart","kajabi","teachable","thinkific","gumroad","podia","kartra","shopify","woocommerce","tiendanube","vtex","bigcommerce","wix store","zoom webinar","gotowebinar","demio","webinarjam","easywebinar",
  ],
  tier3_ctas: [
    "learn more","shop now","get started","claim your","get instant access","order now","start today","download now","sign up free","get yours","buy now","act now","limited time","while supplies last","free shipping","free + shipping","just pay shipping","risk free","money back guarantee","30 day guarantee","60 day guarantee","90 day guarantee","más información","comprar ahora","obtén acceso","accede ahora","descárgalo gratis","envío gratis","garantía de devolución","sin riesgo","empieza hoy","únete ahora","saiba mais","compre agora","acesse agora","baixe grátis","frete grátis","garantia de devolução","sem risco","comece hoje",
  ],
  tier4_hooks: [
    "the secret","el secreto","o segredo","what they don't want you to know","lo que no quieren que sepas","o que não querem que você saiba","discovered","descubierto","finally revealed","por fin revelado","nobody talks about this","nadie habla de esto","weird trick","strange method","underground method","banned","exposed","controversial","they lied to you","te mintieron","are you tired of","¿cansado de","struggling with","stop wasting","deja de perder","frustrated with","sick and tired","nothing works","nada funciona","have you tried everything","¿has probado todo","doctors don't want","médicos no quieren","médicos não querem","clinical study","estudio clínico","estudo clínico","scientists discovered","harvard study","ancient remedy","ancient secret","used by celebrities","how i went from","cómo pasé de","como eu saí de","before and after","antes y después","my story","mi historia","changed my life","cambió mi vida","mudou minha vida",
  ],
  tier5_niches: [
    "work from home","trabaja desde casa","trabalhe de casa","passive income","ingresos pasivos","renda passiva","financial freedom","libertad financiera","liberdade financeira","side hustle","six figures","seis cifras","make money online","ganar dinero online","ganhar dinheiro online","dropshipping","affiliate marketing","marketing de afiliados","amazon fba","print on demand","lose weight","perder peso","emagrecer","burn fat","quemar grasa","queimar gordura","keto","intermittent fasting","ayuno intermitente","diabetes","blood sugar","azúcar en sangre","joint pain","dolor de articulaciones","gut health","salud intestinal","forex","trading signals","señales de trading","crypto","bitcoin","binary options","opciones binarias","stock market","bolsa de valores","day trading","swing trading","get your ex back","recupera tu ex","reconquistar","make him obsessed","law of attraction","ley de atracción","manifesting","manifestar","twin flame","soulmate","learn spanish","learn english","aprender inglés","public speaking","hablar en público","survival","shtf","prepper","off grid","food storage","real estate","bienes raíces","imóveis","wholesaling","house flipping","rental income",
  ],
  tier6_funnels: [
    "one time offer","oferta única","oferta especial","upsell","order bump","free webinar","webinar gratuito","masterclass gratuita","free training","entrenamiento gratuito","treinamento gratuito","free challenge","reto gratuito","desafio gratuito","vsl","video sales letter","sales page","página de ventas","landing page","squeeze page","opt in","lead magnet","freebie","cart closes","carrito cierra","offer expires","oferta expira","countdown","cuenta regresiva","registration closes","registro cierra","doors closing","last chance","última oportunidad","as seen on","featured in","award winning","bestseller","número 1","number 1",
  ],
};

async function seedIfNeeded(admin: any) {
  const { count } = await admin.from("master_keyword_state").select("*", { count: "exact", head: true });
  if ((count ?? 0) > 0) return 0;
  const rows: any[] = [];
  for (const [tier, list] of Object.entries(MASTER)) {
    for (const kw of list) rows.push({ keyword: kw, source_tier: tier });
  }
  // chunk insert
  for (let i = 0; i < rows.length; i += 100) {
    await admin.from("master_keyword_state").insert(rows.slice(i, i + 100));
  }
  return rows.length;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  let body: any = {};
  try { body = await req.json(); } catch {}
  const batchSize = Math.min(20, Math.max(1, Number(body.batch_size) || BATCH_SIZE));
  const triggeredBy = String(body.triggered_by || "cron");

  const seeded = await seedIfNeeded(admin);

  // pick N least-recently-run, non-paused
  const { data: candidates, error: pickErr } = await admin
    .from("master_keyword_state")
    .select("id, keyword")
    .eq("is_paused", false)
    .order("last_run_at", { ascending: true, nullsFirst: true })
    .limit(batchSize);
  if (pickErr) {
    return new Response(JSON.stringify({ error: pickErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const keywords = (candidates || []).map((c: any) => c.keyword);
  if (keywords.length === 0) {
    return new Response(JSON.stringify({ ok: true, seeded, message: "No keywords to run" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // log run start
  const { data: runRow } = await admin
    .from("master_keyword_runs")
    .insert({ keywords_used: keywords, triggered_by: triggeredBy })
    .select("id")
    .single();
  const runId = runRow?.id;

  // baseline counts BEFORE run (per keyword)
  const before = new Map<string, { ads: number; winners: number }>();
  for (const kw of keywords) {
    const [{ count: ads }, { count: winners }] = await Promise.all([
      admin.from("winning_ads").select("*", { count: "exact", head: true }).eq("keyword", kw),
      admin.from("winning_ads").select("*", { count: "exact", head: true }).eq("keyword", kw).gte("winner_score", 70),
    ]);
    before.set(kw, { ads: ads ?? 0, winners: winners ?? 0 });
  }

  // call scraper
  let scrapeOk = false;
  let scrapeErr: string | null = null;
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/search-winning-ads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({ keywords }),
    });
    scrapeOk = resp.ok;
    if (!resp.ok) scrapeErr = `scraper ${resp.status}: ${await resp.text()}`;
  } catch (e: any) {
    scrapeErr = e.message;
  }

  // compute deltas & update per-keyword stats
  let totalNew = 0;
  let totalNewWinners = 0;
  const now = new Date().toISOString();
  for (const kw of keywords) {
    const [{ count: adsAfter }, { count: winnersAfter }] = await Promise.all([
      admin.from("winning_ads").select("*", { count: "exact", head: true }).eq("keyword", kw),
      admin.from("winning_ads").select("*", { count: "exact", head: true }).eq("keyword", kw).gte("winner_score", 70),
    ]);
    const b = before.get(kw)!;
    const newAds = Math.max(0, (adsAfter ?? 0) - b.ads);
    const newWinners = Math.max(0, (winnersAfter ?? 0) - b.winners);
    totalNew += newAds;
    totalNewWinners += newWinners;
    await admin
      .from("master_keyword_state")
      .update({
        last_run_at: now,
        last_found_count: newAds,
        total_found: (adsAfter ?? 0),
        total_winners: (winnersAfter ?? 0),
        total_runs: (await admin.from("master_keyword_state").select("total_runs").eq("keyword", kw).single()).data?.total_runs + 1 || 1,
      })
      .eq("keyword", kw);
  }

  if (runId) {
    await admin
      .from("master_keyword_runs")
      .update({
        finished_at: now,
        ads_found: totalNew,
        winners_found: totalNewWinners,
        success: scrapeOk,
        error: scrapeErr,
      })
      .eq("id", runId);
  }

  return new Response(JSON.stringify({
    ok: scrapeOk, seeded, keywords, ads_found: totalNew, winners_found: totalNewWinners, error: scrapeErr,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
