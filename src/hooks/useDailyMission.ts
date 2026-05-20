import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { todayMissionSet } from "@/lib/gamification";
import type { CreditAction } from "@/hooks/useCredits";

interface MissionProgress {
  date: string;
  setId: string;
  counts: Record<string, number>; // key = action
  claimed: boolean;
}

function keyFor(date = new Date()) {
  return `mission_${date.toISOString().slice(0, 10)}`;
}

function read(): MissionProgress | null {
  try {
    const raw = localStorage.getItem(keyFor());
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function write(p: MissionProgress) {
  localStorage.setItem(keyFor(), JSON.stringify(p));
  window.dispatchEvent(new Event("supernova_mission_changed"));
}

export function useDailyMission() {
  const set = todayMissionSet();
  const [progress, setProgress] = useState<MissionProgress>(() => {
    const cur = read();
    if (cur && cur.setId === set.id) return cur;
    const fresh: MissionProgress = {
      date: new Date().toISOString().slice(0, 10),
      setId: set.id,
      counts: {},
      claimed: false,
    };
    return fresh;
  });

  useEffect(() => {
    const sync = () => { const cur = read(); if (cur) setProgress(cur); };
    window.addEventListener("supernova_mission_changed", sync);
    return () => window.removeEventListener("supernova_mission_changed", sync);
  }, []);

  // listen to credit events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action: CreditAction };
      setProgress(prev => {
        const next: MissionProgress = {
          ...prev,
          counts: { ...prev.counts, [detail.action]: (prev.counts[detail.action] ?? 0) + 1 },
        };
        write(next);
        return next;
      });
    };
    window.addEventListener("supernova_credit_spent", handler);
    return () => window.removeEventListener("supernova_credit_spent", handler);
  }, []);

  const completedTasks = set.tasks.filter(t => (progress.counts[t.action] ?? 0) >= t.count).length;
  const allDone = completedTasks === set.tasks.length;

  const claim = useCallback(async () => {
    if (!allDone || progress.claimed) return;
    const { data } = await supabase.rpc("award_mission_bonus", {
      p_mission_date: new Date().toISOString().slice(0, 10),
      p_amount: 50,
    });
    const result = data as any;
    if (result?.success) {
      const next = { ...progress, claimed: true };
      write(next);
      setProgress(next);
      toast("⚡ Misión completada", { description: "+50 créditos bonus", duration: 5000 });
      // celebrate
      import("canvas-confetti").then(({ default: confetti }) => {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.7 } });
      });
    } else if (result?.error === "already_claimed") {
      const next = { ...progress, claimed: true };
      write(next);
      setProgress(next);
    } else {
      toast.error(result?.error || "No se pudo reclamar la misión");
    }
  }, [allDone, progress]);

  // auto-claim once all done
  useEffect(() => {
    if (allDone && !progress.claimed) claim();
  }, [allDone, progress.claimed, claim]);

  return { set, progress, completedTasks, totalTasks: set.tasks.length, allDone, claim };
}
