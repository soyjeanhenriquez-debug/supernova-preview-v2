import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, ImageOff } from "lucide-react";

interface AdMediaPreviewProps {
  snapshotUrl?: string;
  adUrl?: string;
  pageId?: string;
  pageName: string;
  title?: string;
}

// Cache en memoria para no re-pegar a Firecrawl por la misma id en la sesión
const cache = new Map<string, { screenshot?: string; videoUrl?: string; failed?: boolean }>();

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
  const [screenshot, setScreenshot] = useState<string | null>(null);
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

  useEffect(() => {
    if (!visible || !adId || state !== "idle") return;
    const cached = cache.get(adId);
    if (cached) {
      if (cached.failed) { setState("failed"); return; }
      setScreenshot(cached.screenshot || null);
      setVideoUrl(cached.videoUrl || null);
      setState("ready");
      return;
    }
    setState("loading");
    const projectId = (import.meta.env.VITE_SUPABASE_PROJECT_ID as string) || "quyjsihawxeghsptwltq";
    fetch(`https://${projectId}.supabase.co/functions/v1/meta-ad-proxy?id=${adId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data?.success || (!data.screenshot && !data.videoUrl)) {
          cache.set(adId, { failed: true });
          setState("failed");
          return;
        }
        cache.set(adId, { screenshot: data.screenshot, videoUrl: data.videoUrl });
        setScreenshot(data.screenshot || null);
        setVideoUrl(data.videoUrl || null);
        setState("ready");
      })
      .catch(() => {
        cache.set(adId, { failed: true });
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

      {/* Screenshot del Ad Library renderizado con browser real */}
      {state === "ready" && !videoUrl && screenshot && (
        <img
          src={screenshot}
          alt={`Preview – ${pageName}`}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover object-top bg-black"
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
