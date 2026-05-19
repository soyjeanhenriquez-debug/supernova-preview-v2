import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const authedClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await authedClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);
    const callerId = claimsData.claims.sub as string;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Verify admin role
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    if (action === "list") {
      const page = body.page ?? 1;
      const perPage = body.perPage ?? 100;
      const { data: list, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) throw error;

      const ids = list.users.map((u) => u.id);
      const [{ data: roles }, { data: profiles }, { data: txs }, { data: history }] =
        await Promise.all([
          admin.from("user_roles").select("user_id, role").in("user_id", ids),
          admin.from("profiles").select("user_id, display_name, avatar_url, company_name").in("user_id", ids),
          admin.from("credit_transactions").select("user_id, cost, created_at").in("user_id", ids),
          admin.from("ad_history").select("user_id, visited_at").in("user_id", ids),
        ]);

      const rolesMap = new Map<string, string[]>();
      roles?.forEach((r: any) => {
        const arr = rolesMap.get(r.user_id) || [];
        arr.push(r.role);
        rolesMap.set(r.user_id, arr);
      });

      const profMap = new Map(profiles?.map((p: any) => [p.user_id, p]) || []);

      const spendMap = new Map<string, number>();
      const lastActMap = new Map<string, string>();
      txs?.forEach((t: any) => {
        spendMap.set(t.user_id, (spendMap.get(t.user_id) || 0) + (t.cost || 0));
        const cur = lastActMap.get(t.user_id);
        if (!cur || t.created_at > cur) lastActMap.set(t.user_id, t.created_at);
      });
      history?.forEach((h: any) => {
        const cur = lastActMap.get(h.user_id);
        if (!cur || h.visited_at > cur) lastActMap.set(h.user_id, h.visited_at);
      });

      const users = list.users.map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        banned_until: (u as any).banned_until,
        confirmed_at: u.confirmed_at,
        roles: rolesMap.get(u.id) || ["user"],
        profile: profMap.get(u.id) || null,
        total_credits_spent: spendMap.get(u.id) || 0,
        last_activity_at: lastActMap.get(u.id) || u.last_sign_in_at || u.created_at,
      }));

      return json({ users, total: (list as any).total ?? users.length });
    }

    if (action === "detail") {
      const userId = body.userId as string;
      const { data: u, error } = await admin.auth.admin.getUserById(userId);
      if (error) throw error;
      const [{ data: roles }, { data: profile }, { data: txs }, { data: history }, { data: analyses }] =
        await Promise.all([
          admin.from("user_roles").select("role").eq("user_id", userId),
          admin.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
          admin.from("credit_transactions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
          admin.from("ad_history").select("*").eq("user_id", userId).order("visited_at", { ascending: false }).limit(50),
          admin.from("landing_analyses").select("id, url, domain, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
        ]);
      return json({
        user: u.user,
        roles: roles?.map((r: any) => r.role) || [],
        profile,
        transactions: txs || [],
        history: history || [],
        analyses: analyses || [],
      });
    }

    if (action === "set_role") {
      const userId = body.userId as string;
      const role = body.role as "admin" | "moderator" | "user";
      // Remove existing roles, set new one as the single role
      await admin.from("user_roles").delete().eq("user_id", userId);
      const { error } = await admin.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "adjust_credits") {
      // Positive amount = refill (negative cost), Negative amount = deduct
      const userId = body.userId as string;
      const amount = Number(body.amount); // credits to add (positive) or remove (negative)
      const note = body.note || "Ajuste admin";
      const { error } = await admin.from("credit_transactions").insert({
        user_id: userId,
        action: "admin_adjust",
        label: note,
        cost: -amount, // refill = negative cost
        meta: { admin_id: callerId, amount },
      });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "suspend") {
      const userId = body.userId as string;
      const hours = Number(body.hours ?? 8760); // default 1 year
      const { error } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: `${hours}h`,
      } as any);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "unsuspend") {
      const userId = body.userId as string;
      const { error } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: "none",
      } as any);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "delete") {
      const userId = body.userId as string;
      if (userId === callerId) return json({ error: "No puedes eliminarte a ti mismo" }, 400);
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e: any) {
    console.error("admin-users error", e);
    return json({ error: e.message || String(e) }, 500);
  }
});
