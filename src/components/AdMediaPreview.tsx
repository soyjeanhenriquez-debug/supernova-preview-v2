import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, ImageOff } from "lucide-react";
import { fnHeaders } from "@/lib/fnAuth";
import { safeExternalUrl } from "@/lib/offerIntel";

interface AdMediaPreviewProps {
  snapshotUrl?: string;
  adUrl?: string;
  pageId?: string;
  pageName: string;
  title?: string;
  /** Rellena al contenedor padre (que pone la proporción) en vez de imponer su 4:5. */
  fill?: boolean;
  /** "contain" enseña el creativo entero (ficha); "cover" lo recorta para llenar (tarjetas). */
  fit?: "cover" | "contain";
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
// v2 (11-oct-2026): descarta los "sin preview" que quedaron guardados 7 días por errores pasajeros.
const PREVIEW_KEY = (id: string) => `sn:ad-prev:v2:${id}`;
/** Un anuncio sin creativo de verdad se vuelve a intentar en 1 hora, no en 7 días. */
const FAILED_TTL = 60 * 60_000;
const memCache = new Map<string, CacheEntry>();

function readPreviewCache(id: string): CacheEntry | null {
  const mem = memCache.get(id);
  if (mem && Date.now() - mem.ts < (mem.failed ? FAILED_TTL : PREVIEW_TTL)) return mem;
  try {
    const raw = localStorage.getItem(PREVIEW_KEY(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (Date.now() - parsed.ts > (parsed.failed ? FAILED_TTL : PREVIEW_TTL)) {
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

/**
 * Solo las imágenes de creativo de anuncio (Facebook las marca "t39.35426" en la ruta). La silueta gris
 * por defecto ("t1.30497") y la foto de perfil de la página ("t39.30808") no son el anuncio (11-oct-2026).
 */
export function isAdCreativeImage(url: string | null | undefined): boolean {
  return !!url && /\/v\/t39\.35426-/.test(url);
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

export function AdMediaPreview({ snapshotUrl, adUrl, pageId, pageName, title, fill, fit = "cover" }: AdMediaPreviewProps) {
  const fitCls = fit === "contain" ? "object-contain" : "object-cover";
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
    if (cached.failed || (!cached.videoUrl && !isAdCreativeImage(cached.imageUrl))) { setState("failed"); return; }
    setImageUrl(isAdCreativeImage(cached.imageUrl) ? cached.imageUrl! : null);
    setVideoUrl(cached.videoUrl || null);
    setState("ready");
  }, [adId]);

  useEffect(() => {
    if (!visible || !adId || state !== "idle") return;
    setState("loading");
    const projectId = (import.meta.env.VITE_SUPABASE_PROJECT_ID as string) || "krfdoofwhtcxbyhkjoik";
    // Con sesión: un anuncio sin caché dispara un scrape de pago y la función
    // solo lo hace para un usuario con acceso (lo cacheado responde igual).
    // Tope de 20 s: sin él la tarjeta se quedaba "cargando" para siempre si el servicio no respondía.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    fnHeaders()
      .then((headers) => fetch(`https://${projectId}.supabase.co/functions/v1/meta-ad-proxy?id=${adId}`, { headers, signal: ctrl.signal }))
      .then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }))
      .then(({ status, data }) => {
        if (!data?.success || (!data.videoUrl && !isAdCreativeImage(data.imageUrl))) {
          // Solo se recuerda el fallo si de verdad no hay creativo; un 401/429 o un error pasajero, no.
          if (status === 200) writePreviewCache(adId, { failed: true });
          setState("failed");
          return;
        }
        writePreviewCache(adId, { imageUrl: data.imageUrl, videoUrl: data.videoUrl });
        setImageUrl(isAdCreativeImage(data.imageUrl) ? data.imageUrl : null);
        setVideoUrl(data.videoUrl || null);
        setState("ready");
      })
      .catch(() => setState("failed"))
      .finally(() => clearTimeout(timer));
  }, [visible, adId, state]);

  return (
    <div
      ref={containerRef}
      className={fill
        ? "absolute inset-0 w-full h-full overflow-hidden bg-secondary/40 group"
        : "relative w-full rounded-lg overflow-hidden border border-border/60 bg-secondary/40 aspect-[4/5] group"}
    >
      {/* Poster fallback siempre detrás */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center bg-gradient-to-br from-secondary/80 via-secondary/40 to-secondary/80">
        {pageId ? (
          <img
            src={`https://graph.facebook.com/${pageId}/picture?type=large`}
            alt={pageName}
            loading="lazy"
            decoding="async"
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
          // Portada: la imagen del creativo (solo si es de verdad el anuncio, ver isAdCreativeImage); si no,
          // el cuadro de medio segundo del propio video.
          src={imageUrl ? videoUrl : `${videoUrl}#t=0.5`}
          poster={imageUrl ?? undefined}
          controls
          playsInline
          preload="metadata"
          className={`absolute inset-0 w-full h-full ${fitCls} bg-black`}
        />
      )}

      {/* Imagen real del creativo (fbcdn) */}
      {state === "ready" && !videoUrl && imageUrl && (
        <img
          src={imageUrl}
          alt={`Preview – ${pageName}`}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className={`absolute inset-0 w-full h-full ${fitCls} bg-black`}
        />
      )}

      {/* Botón HD */}
      <a
        href={adId ? `https://www.facebook.com/ads/library/?id=${adId}` : (safeExternalUrl(snapshotUrl) ?? safeExternalUrl(adUrl) ?? "#")}
        target="_blank"
        rel="noopener noreferrer"
        className={`absolute ${fill ? "bottom-2 right-2" : "top-2 right-2"} z-10 px-2.5 py-1 rounded-full bg-background/90 backdrop-blur text-foreground text-[10px] font-bold inline-flex items-center gap-1 shadow-lg border border-border/60 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary hover:text-primary-foreground`}
      >
        <ExternalLink className="w-3 h-3" /> HD
      </a>
    </div>
  );
}
