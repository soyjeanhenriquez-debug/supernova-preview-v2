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
      // Trigger scraper for a specific keyword
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

    return json({ error: "Unknown action" }, 400);
  } catch (e: any) {
    console.error(e);
    return json({ error: e.message || String(e) }, 500);
  }
});
