import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DailyBucket { date: string; count: number; }

export function useActivitySeries(actions?: string[], days = 7) {
  const [series, setSeries] = useState<DailyBucket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { setLoading(false); return; }
      const since = new Date(Date.now() - days * 86400000).toISOString();
      let q = supabase.from("credit_transactions")
        .select("created_at, action")
        .eq("user_id", auth.user.id)
        .gte("created_at", since)
        .limit(2000);
      if (actions && actions.length) q = q.in("action", actions);
      const { data } = await q;
      if (cancelled || !data) { setLoading(false); return; }
      const buckets = new Map<string, number>();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        buckets.set(d, 0);
      }
      for (const row of data) {
        const d = (row.created_at as string).slice(0, 10);
        if (buckets.has(d)) buckets.set(d, (buckets.get(d) ?? 0) + 1);
      }
      const arr = Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));
      setSeries(arr);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [JSON.stringify(actions), days]);

  return { series, loading };
}
