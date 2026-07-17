// SUPERNOVA — Historial + favoritos de anuncios del Oráculo.
// Persistencia en Supabase (sincroniza entre preview/publicada/dispositivos).
// Fallback a sessionStorage/localStorage si el usuario no está autenticado.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface AdHistoryItem {
  key: string;
  id?: string;
  page_id?: string;
  page_name?: string;
  title?: string;
  body?: string;
  href: string;
  visitedAt: string;
}

const HIST_KEY = "supernova_ad_history_v1";
const FAV_KEY = "supernova_ad_favorites_v1";
const HIST_MAX = 50;
const EVT = "supernova_ad_history_changed";

function readLS(key: string, storage: Storage): AdHistoryItem[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(storage.getItem(key) || "[]"); } catch { return []; }
}

export function adKey(a: { id?: string; page_id?: string; title?: string }) {
  return a.id
    ? `ad:${a.id}`
    : a.page_id
    ? `pg:${a.page_id}:${(a.title ?? "").slice(0, 40)}`
    : `t:${(a.title ?? "").slice(0, 80)}`;
}

type Row = {
  ad_key: string; ad_id: string | null; page_id: string | null;
  page_name: string | null; title: string | null; body: string | null;
  href: string; visited_at?: string; created_at?: string;
};

function rowToItem(r: Row, ts: string): AdHistoryItem {
  return {
    key: r.ad_key,
    id: r.ad_id ?? undefined,
    page_id: r.page_id ?? undefined,
    page_name: r.page_name ?? undefined,
    title: r.title ?? undefined,
    body: r.body ?? undefined,
    href: r.href,
    visitedAt: ts,
  };
}

function itemToRow(item: Omit<AdHistoryItem, "visitedAt">, userId: string) {
  return {
    user_id: userId,
    ad_key: item.key,
    ad_id: item.id ?? null,
    page_id: item.page_id ?? null,
    page_name: item.page_name ?? null,
    title: item.title ?? null,
    body: item.body ?? null,
    href: item.href,
  };
}

export function useAdHistory() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [history, setHistory] = useState<AdHistoryItem[]>(() =>
    typeof window !== "undefined" ? readLS(HIST_KEY, sessionStorage) : []
  );
  const [favorites, setFavorites] = useState<AdHistoryItem[]>(() =>
    typeof window !== "undefined" ? readLS(FAV_KEY, localStorage) : []
  );

  // Cargar desde Supabase cuando hay sesión
  const refresh = useCallback(async () => {
    if (!userId) {
      setHistory(readLS(HIST_KEY, sessionStorage));
      setFavorites(readLS(FAV_KEY, localStorage));
      return;
    }
    const [{ data: hist }, { data: favs }] = await Promise.all([
      supabase.from("ad_history").select("*").eq("user_id", userId)
        .order("visited_at", { ascending: false }).limit(HIST_MAX),
      supabase.from("ad_favorites").select("*").eq("user_id", userId)
        .order("created_at", { ascending: false }),
    ]);
    setHistory((hist ?? []).map((r: unknown) => rowToItem(r, r.visited_at)));
    setFavorites((favs ?? []).map((r: unknown) => rowToItem(r, r.created_at)));
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const sync = () => refresh();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [refresh]);

  const markVisited = useCallback(async (item: Omit<AdHistoryItem, "visitedAt">) => {
    if (userId) {
      await supabase.from("ad_history").upsert(
        { ...itemToRow(item, userId), visited_at: new Date().toISOString() },
        { onConflict: "user_id,ad_key" }
      );
      refresh();
    } else {
      const cur = readLS(HIST_KEY, sessionStorage).filter((x) => x.key !== item.key);
      const next = [{ ...item, visitedAt: new Date().toISOString() }, ...cur].slice(0, HIST_MAX);
      sessionStorage.setItem(HIST_KEY, JSON.stringify(next));
      setHistory(next);
      window.dispatchEvent(new Event(EVT));
    }
  }, [userId, refresh]);

  const isFavorite = useCallback((key: string) => favorites.some((x) => x.key === key), [favorites]);

  const toggleFavorite = useCallback(async (item: Omit<AdHistoryItem, "visitedAt">) => {
    const exists = favorites.some((x) => x.key === item.key);
    if (userId) {
      if (exists) {
        await supabase.from("ad_favorites").delete().eq("user_id", userId).eq("ad_key", item.key);
      } else {
        await supabase.from("ad_favorites").upsert(itemToRow(item, userId), { onConflict: "user_id,ad_key" });
      }
      refresh();
    } else {
      const curF = readLS(FAV_KEY, localStorage);
      const nextF = exists
        ? curF.filter((x) => x.key !== item.key)
        : [{ ...item, visitedAt: new Date().toISOString() }, ...curF];
      localStorage.setItem(FAV_KEY, JSON.stringify(nextF));
      setFavorites(nextF);
      window.dispatchEvent(new Event(EVT));
    }
    return !exists;
  }, [favorites, userId, refresh]);

  const clearHistory = useCallback(async () => {
    if (userId) {
      await supabase.from("ad_history").delete().eq("user_id", userId);
      refresh();
    } else {
      sessionStorage.setItem(HIST_KEY, "[]");
      setHistory([]);
      window.dispatchEvent(new Event(EVT));
    }
  }, [userId, refresh]);

  return { history, favorites, markVisited, isFavorite, toggleFavorite, clearHistory };
}
