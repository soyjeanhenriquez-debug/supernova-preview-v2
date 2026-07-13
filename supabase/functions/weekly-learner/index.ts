// SUPERNOVA weekly-learner
// Analiza la actividad de la semana y genera entradas en system_learnings
// que el admin debe aprobar o rechazar manualmente.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const LOVABLE_API_KEY = (Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));

  try {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();

    // 1) Keywords con más ads encontrados en la semana
    const { data: weekAds } = await supabase
      .from("winning_ads")
      .select("keyword, offer_type, market, duplicate_count, days_active, page_name")
      .gte("scraped_at", since)
      .limit(5000);

    const ads = weekAds ?? [];
    const kwCounts = new Map<string, number>();
    const nicheCounts = new Map<string, number>();
    for (const a of ads as any[]) {
      kwCounts.set(a.keyword, (kwCounts.get(a.keyword) ?? 0) + 1);
      const k = `${a.offer_type ?? "?"}|${a.market ?? "?"}`;
      nicheCounts.set(k, (nicheCounts.get(k) ?? 0) + 1);
    }
    const topKw = [...kwCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const lowKw = [...kwCounts.entries()].sort((a, b) => a[1] - b[1]).slice(0, 5);
    const topNiches = [...nicheCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    // 2) Carreras del agente master-rotate
    const { data: runs } = await supabase
      .from("master_keyword_runs")
      .select("keywords_used, ads_found, winners_found, success, started_at")
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(100);

    const totalRuns = runs?.length ?? 0;
    const successRuns = (runs ?? []).filter((r: any) => r.success).length;
    const totalFound = (runs ?? []).reduce((s: number, r: any) => s + (r.ads_found ?? 0), 0);
    const totalWinners = (runs ?? []).reduce((s: number, r: any) => s + (r.winners_found ?? 0), 0);

    // 3) Pedir a la IA que sintetice 3–6 insights accionables
    let aiInsights: any[] = [];
    if (LOVABLE_API_KEY) {
      const prompt = `Eres el agente analista de SUPERNOVA. Esta semana:
- Top keywords por volumen: ${topKw.map(([k, n]) => `${k}(${n})`).join(", ")}
- Keywords con bajo retorno: ${lowKw.map(([k, n]) => `${k}(${n})`).join(", ")}
- Nichos calientes (offer|market → count): ${topNiches.map(([k, n]) => `${k}(${n})`).join(", ")}
- Ejecuciones del scraper: ${totalRuns} (éxitos ${successRuns}), ads totales ${totalFound}, winners ${totalWinners}.

Devuelve un JSON array con 3-6 objetos { "insight": string (1 frase clara), "category": una de [keyword_performance,user_behavior,market_trend,feature_usage,scoring_calibration], "source": string corto, "evidence": object }. Sé conciso y accionable.`;
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gemini-3-flash-preview",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        }),
      });
      if (r.ok) {
        const j = await r.json();
        const txt = j?.choices?.[0]?.message?.content ?? "[]";
        try {
          const parsed = JSON.parse(txt);
          aiInsights = Array.isArray(parsed) ? parsed : (parsed.insights ?? []);
        } catch { /* ignore */ }
      }
    }

    // 4) Fallback determinista si la IA no devuelve nada
    if (aiInsights.length === 0) {
      aiInsights = [
        topKw[0] && {
          insight: `La keyword "${topKw[0][0]}" trajo ${topKw[0][1]} ads — vale la pena priorizarla.`,
          category: "keyword_performance", source: "winning_ads (7d)", evidence: { keyword: topKw[0][0], count: topKw[0][1] },
        },
        lowKw[0] && {
          insight: `La keyword "${lowKw[0][0]}" solo trajo ${lowKw[0][1]} ads — considera pausarla.`,
          category: "keyword_performance", source: "winning_ads (7d)", evidence: { keyword: lowKw[0][0], count: lowKw[0][1] },
        },
        topNiches[0] && {
          insight: `Nicho "${topNiches[0][0]}" en alza con ${topNiches[0][1]} ads esta semana.`,
          category: "market_trend", source: "winning_ads (7d)", evidence: { niche: topNiches[0][0], count: topNiches[0][1] },
        },
      ].filter(Boolean);
    }

    // 5) Insertar pendientes
    const rows = aiInsights.slice(0, 8).map((i: any) => ({
      insight: String(i.insight ?? "").slice(0, 500),
      category: ["keyword_performance","user_behavior","market_trend","feature_usage","scoring_calibration"].includes(i.category) ? i.category : "market_trend",
      source: String(i.source ?? "weekly-learner").slice(0, 100),
      data_evidence: i.evidence ?? {},
      status: "pending",
    })).filter((r: any) => r.insight);

    if (rows.length) {
      await supabase.from("system_learnings").insert(rows);
    }

    return new Response(JSON.stringify({ generated: rows.length, sampled_ads: ads.length, runs: totalRuns }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
