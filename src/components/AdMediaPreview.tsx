import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, ImageOff } from "lucide-react";

interface AdMediaPreviewProps {
  snapshotUrl?: string;
  adUrl?: string;
  pageId?: string;
  pageName: string;
  title?: string;
}

// ============================================================
// CACHE DE PREVIEWS — 2 niveles:
//   1) Map en memoria (instantáneo, vida = sesión)
//   2) localStorage (persistente entre recargas, TTL 7 días)
// Así cada vez que el usuario vuelve a la app las previews
// que ya hemos resuelto cargan sin volver a pegarle al proxy.
// ============================================================
type CacheEntry = { imageUrl?: string | null; videoUrl?: string | null; failed?: boolean; ts: number };
const PREVIEW_TTL = 7 * 24 * 60 * 60_000;
const PREVIEW_KEY = (id: string) => `sn:ad-prev:${id}`;
const memCache = new Map<string, CacheEntry>();

function readPreviewCache(id: string): CacheEntry | null {
  const mem = memCache.get(id);
  if (mem && Date.now() - mem.ts < PREVIEW_TTL) return mem;
  try {
    const raw = localStorage.getItem(PREVIEW_KEY(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (Date.now() - parsed.ts > PREVIEW_TTL) {
      localStorage.removeItem(PREVIEW_KEY(id));
      return null;
    }
    memCache.set(id, parsed);
    return parsed;
  } catch { return null; }
}

function writePreviewCache(id: string, entry: Omit<CacheEntry, "ts">) {
  const full: CacheEntry = { ...entry, ts: Date.now() };
  memCache.set(id, full);
  try { localStorage.setItem(PREVIEW_KEY(id), JSON.stringify(full)); }
  catch {
    // Quota: limpiar previews viejas y reintentar
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith("sn:ad-prev:"));
      keys.slice(0, Math.ceil(keys.length / 2)).forEach((k) => localStorage.removeItem(k));
      localStorage.setItem(PREVIEW_KEY(id), JSON.stringify(full));
    } catch { /* dar up */ }
  }
}

function extractAdId(url?: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const id = u.searchParams.get("id");
    if (id && /^\d+$/.test(id)) return id;
  } catch { /* */ }
  const m = url.match(/[?&]id=(\d{6,})/);
  return m ? m[1] : null;
}

export function AdMediaPreview({ snapshotUrl, adUrl, pageId, pageName, title }: AdMediaPreviewProps) {
  const adId = extractAdId(snapshotUrl) || extractAdId(adUrl);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  // Lazy: solo dispara cuando entra al viewport
  useEffect(() => {
    if (!containerRef.current || visible) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setVisible(true)),
      { rootMargin: "200px" },
    );
    io.observe(containerRef.current);
    return () => io.disconnect();
  }, [visible]);

  // Hidratar SINCRÓNICAMENTE desde cache antes de pintar — 0ms flicker
  useEffect(() => {
    if (!adId) return;
    const cached = readPreviewCache(adId);
    if (!cached) return;
    if (cached.failed) { setState("failed"); return; }
    setImageUrl(cached.imageUrl || null);
    setVideoUrl(cached.videoUrl || null);
    setState("ready");
  }, [adId]);

  useEffect(() => {
    if (!visible || !adId || state !== "idle") return;
    setState("loading");
    const projectId = (import.meta.env.VITE_SUPABASE_PROJECT_ID as string) || "krfdoofwhtcxbyhkjoik";
    fetch(`https://${projectId}.supabase.co/functions/v1/meta-ad-proxy?id=${adId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data?.success || (!data.imageUrl && !data.videoUrl)) {
          writePreviewCache(adId, { failed: true });
          setState("failed");
          return;
        }
        writePreviewCache(adId, { imageUrl: data.imageUrl, videoUrl: data.videoUrl });
        setImageUrl(data.imageUrl || null);
        setVideoUrl(data.videoUrl || null);
        setState("ready");
      })
      .catch(() => {
        writePreviewCache(adId, { failed: true });
        setState("failed");
      });
  }, [visible, adId, state]);

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-lg overflow-hidden border border-border/60 bg-secondary/40 aspect-[4/5] group"
    >
      {/* Poster fallback siempre detrás */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center bg-gradient-to-br from-secondary/80 via-secondary/40 to-secondary/80">
        {pageId ? (
          <img
            src={`https://graph.facebook.com/${pageId}/picture?type=large`}
            alt={pageName}
            className="w-14 h-14 rounded-full border-2 border-border shadow-lg"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-primary/20 border-2 border-primary/40 flex items-center justify-center text-lg font-bold text-primary">
            {pageName.charAt(0)}
          </div>
        )}
        <div className="text-xs font-semibold text-foreground/90 line-clamp-2 max-w-[80%]">
          {title || pageName}
        </div>
        {state === "loading" && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" /> Cargando creativo…
          </div>
        )}
        {state === "failed" && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <ImageOff className="w-3 h-3" /> Sin preview · abrir en Meta
          </div>
        )}
      </div>

      {/* Video real si lo detectamos */}
      {state === "ready" && videoUrl && (
        <video
          src={videoUrl}
          controls
          playsInline
          preload="metadata"
          className="absolute inset-0 w-full h-full object-cover bg-black"
        />
      )}

      {/* Imagen real del creativo (fbcdn) */}
      {state === "ready" && !videoUrl && imageUrl && (
        <img
          src={imageUrl}
          alt={`Preview – ${pageName}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover bg-black"
        />
      )}

      {/* Botón HD */}
      <a
        href={snapshotUrl || adUrl || (adId ? `https://www.facebook.com/ads/library/?id=${adId}` : "#")}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-2 right-2 z-10 px-2.5 py-1 rounded-full bg-background/90 backdrop-blur text-foreground text-[10px] font-bold inline-flex items-center gap-1 shadow-lg border border-border/60 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary hover:text-primary-foreground"
      >
        <ExternalLink className="w-3 h-3" /> HD
      </a>
    </div>
  );
}
