import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const authed = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: ud, error: ue } = await authed.auth.getUser();
    if (ue || !ud?.user) return json({ error: "Unauthorized" }, 401);
    const callerId = ud.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", callerId).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    if (action === "list") {
      const [{ data: kws }, { data: ads }] = await Promise.all([
        admin.from("keywords").select("id, keyword, is_active, last_searched_at, created_at, user_id").order("created_at", { ascending: false }),
        admin.from("winning_ads").select("keyword, winner_score, scraped_at"),
      ]);
      const adMap = new Map<string, { count: number; winners: number; lastScraped: string | null }>();
      ads?.forEach((a: any) => {
        const k = (a.keyword || "").toLowerCase();
        const cur = adMap.get(k) || { count: 0, winners: 0, lastScraped: null };
        cur.count++;
        if ((a.winner_score ?? 0) >= 70) cur.winners++;
        if (!cur.lastScraped || a.scraped_at > cur.lastScraped) cur.lastScraped = a.scraped_at;
        adMap.set(k, cur);
      });
      const enriched = (kws || []).map((k: any) => {
        const m = adMap.get(k.keyword.toLowerCase()) || { count: 0, winners: 0, lastScraped: null };
        return { ...k, ads_count: m.count, winners_count: m.winners, last_scraped_at: m.lastScraped };
      });
      return json({ keywords: enriched });
    }

    if (action === "add") {
      const keyword = String(body.keyword || "").trim();
      if (!keyword) return json({ error: "Empty" }, 400);
      const { error } = await admin.from("keywords").insert({ user_id: callerId, keyword, is_active: true });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "add_many") {
      const keywords = (body.keywords as string[]).map((k) => k.trim()).filter(Boolean);
      if (!keywords.length) return json({ ok: true, added: 0 });
      const rows = keywords.map((k) => ({ user_id: callerId, keyword: k, is_active: true }));
      const { error } = await admin.from("keywords").insert(rows);
      if (error) throw error;
      return json({ ok: true, added: rows.length });
    }

    if (action === "toggle") {
      const { error } = await admin.from("keywords").update({ is_active: !!body.is_active }).eq("id", body.id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "delete") {
      const { error } = await admin.from("keywords").delete().eq("id", body.id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "test_now") {
      const keyword = String(body.keyword || "");
      if (!keyword) return json({ error: "Empty" }, 400);
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/search-winning-ads`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
        body: JSON.stringify({ keywords: [keyword] }),
      });
      const data = await resp.json().catch(() => ({}));
      return json({ ok: true, result: data });
    }

    if (action === "user_top") {
      // Aggregate keywords across ALL users to see what's trending in the app
      const { data: kws } = await admin
        .from("keywords")
        .select("keyword, user_id, is_active, last_searched_at, created_at");
      const map = new Map<string, { keyword: string; users: Set<string>; total: number; active: number; lastUsed: string | null; firstSeen: string }>();
      (kws || []).forEach((k: any) => {
        const key = (k.keyword || "").trim().toLowerCase();
        if (!key) return;
        const cur = map.get(key) || { keyword: k.keyword, users: new Set(), total: 0, active: 0, lastUsed: null, firstSeen: k.created_at };
        cur.users.add(k.user_id);
        cur.total++;
        if (k.is_active) cur.active++;
        if (k.last_searched_at && (!cur.lastUsed || k.last_searched_at > cur.lastUsed)) cur.lastUsed = k.last_searched_at;
        if (k.created_at < cur.firstSeen) cur.firstSeen = k.created_at;
        map.set(key, cur);
      });
      const rows = Array.from(map.values())
        .map((r) => ({
          keyword: r.keyword,
          user_count: r.users.size,
          total_uses: r.total,
          active_count: r.active,
          last_used_at: r.lastUsed,
          first_seen_at: r.firstSeen,
        }))
        .sort((a, b) => b.user_count - a.user_count || b.total_uses - a.total_uses);
      return json({ top: rows });
    }

    if (action === "elite_suggestions") {
      const lang = (body.lang as string) || "es";
      const niche = (body.niche as string) || "";
      const apiKey = Deno.env.get("LOVABLE_API_KEY");
      if (!apiKey) return json({ error: "LOVABLE_API_KEY missing" }, 500);
      const langName = { en: "English", es: "Spanish", pt: "Brazilian Portuguese" }[lang] || "English";
      const sys = `You are an elite Direct Response Marketing strategist who has personally scaled $100M+ in Facebook Ads and TikTok Ads spend for offers in weight loss, men's health, finance, dating, biz-opp, supplements, ED, diabetes, manifestation, AI tools, and survival niches. You think like a 9-figure media buyer: you know the EXACT angles, pattern interrupts, curiosity loops, and compliance-edge phrases that PRINT money in 2026. You know what's banned, what passes the algo sniff test, and what no normal copywriter would think of.`;
      const usr = `Generate 25 ELITE keyword/phrase suggestions in ${langName} for the Facebook Ads Library to discover WINNING ads (ads currently spending massive budgets). ${niche ? `Niche focus: ${niche}. ` : ""}Rules:
- NO obvious words like "weight loss" or "make money". Think like an A-player media buyer.
- Mix: (a) emotional pain-point trigger phrases real winners use in primary text, (b) hooks/openers from proven winning ads, (c) compliance-edge phrases that scale, (d) micro-niche advertiser lingo, (e) format/funnel signals like VSL/quiz/ASMR/UGC tells, (f) underground angles trending RIGHT NOW.
- Each item is a SHORT searchable phrase (2-6 words), in ${langName}, lowercase, no quotes, no numbering.
- Surprise me. Give me phrases a normal person would never think to search but that millionaires use to spy on competitors.

Return JSON ONLY in this exact shape:
{"suggestions":[{"keyword":"...","reason":"one short line explaining why this prints money","category":"hook|pain|compliance|funnel|niche|trend"}]}`;

      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [{ role: "system", content: sys }, { role: "user", content: usr }],
          response_format: { type: "json_object" },
        }),
      });
      if (!aiResp.ok) {
        const t = await aiResp.text();
        return json({ error: `AI ${aiResp.status}: ${t}` }, aiResp.status === 429 || aiResp.status === 402 ? aiResp.status : 500);
      }
      const aiData = await aiResp.json();
      let parsed: any = {};
      try { parsed = JSON.parse(aiData.choices?.[0]?.message?.content || "{}"); } catch {}
      return json({ suggestions: parsed.suggestions || [], lang });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e: any) {
    console.error(e);
    return json({ error: e.message || String(e) }, 500);
  }
});
