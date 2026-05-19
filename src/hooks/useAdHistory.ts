// SUPERNOVA — Historial + favoritos de anuncios revisados en el Oráculo.
// History: sessionStorage (vida = sesión del navegador).
// Favorites: localStorage (persistente entre sesiones).
import { useCallback, useEffect, useState } from "react";

export interface AdHistoryItem {
  key: string;             // id o page_id|title hash
  id?: string;             // facebook ad_archive_id
  page_id?: string;
  page_name?: string;
  title?: string;
  body?: string;
  href: string;            // Ads Library URL
  visitedAt: string;       // ISO
}

const HIST_KEY = "supernova_ad_history_v1";   // session
const FAV_KEY  = "supernova_ad_favorites_v1"; // persistent
const HIST_MAX = 50;
const EVT = "supernova_ad_history_changed";

function readHist(): AdHistoryItem[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(sessionStorage.getItem(HIST_KEY) || "[]"); } catch { return []; }
}
function readFav(): AdHistoryItem[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); } catch { return []; }
}

export function adKey(a: { id?: string; page_id?: string; title?: string }) {
  return a.id ? `ad:${a.id}` : a.page_id ? `pg:${a.page_id}:${(a.title ?? "").slice(0, 40)}` : `t:${(a.title ?? "").slice(0, 80)}`;
}

export function useAdHistory() {
  const [history, setHistory] = useState<AdHistoryItem[]>(readHist);
  const [favorites, setFavorites] = useState<AdHistoryItem[]>(readFav);

  useEffect(() => {
    const sync = () => { setHistory(readHist()); setFavorites(readFav()); };
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const persist = (nextH: AdHistoryItem[], nextF: AdHistoryItem[]) => {
    sessionStorage.setItem(HIST_KEY, JSON.stringify(nextH.slice(0, HIST_MAX)));
    localStorage.setItem(FAV_KEY, JSON.stringify(nextF));
    setHistory(nextH); setFavorites(nextF);
    window.dispatchEvent(new Event(EVT));
  };

  const markVisited = useCallback((item: Omit<AdHistoryItem, "visitedAt">) => {
    const cur = readHist();
    const without = cur.filter((x) => x.key !== item.key);
    const next: AdHistoryItem[] = [{ ...item, visitedAt: new Date().toISOString() }, ...without];
    persist(next, readFav());
  }, []);

  const isFavorite = useCallback((key: string) => readFav().some((x) => x.key === key), []);

  const toggleFavorite = useCallback((item: Omit<AdHistoryItem, "visitedAt">) => {
    const curF = readFav();
    const exists = curF.some((x) => x.key === item.key);
    const nextF = exists
      ? curF.filter((x) => x.key !== item.key)
      : [{ ...item, visitedAt: new Date().toISOString() }, ...curF];
    persist(readHist(), nextF);
    return !exists;
  }, []);

  const clearHistory = useCallback(() => persist([], readFav()), []);

  return { history, favorites, markVisited, isFavorite, toggleFavorite, clearHistory };
}
