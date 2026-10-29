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
  /** Portada fija de la oferta (offers.cover_url, p. ej. la de Cazador Swipe): se ve al instante, sin pedirle nada a
   *  Meta, y queda debajo si después carga el anuncio real. */
  coverUrl?: string | null;
}

// ============================================================
// CACHE DE PREVIEWS — 2 niveles:
//   1) Map en memoria (instantáneo, vida = sesión)
//   2) localStorage (persistente entre recargas, TTL 7 días)
// Así cada vez que el usuario vuelve a la app las previews
// que ya hemos resuelto cargan sin volver a pegarle al proxy.
//
// 12-oct-2026: las URLs de fbcdn caducan (parámetro `oe`, ~4 días). Una entrada cuya URL vence en
// menos de 30 min ya no vale: se pide de nuevo (antes se pintaba un cuadro gris hasta 7 días).
// ============================================================
type CacheEntry = { imageUrl?: string | null; videoUrl?: string | null; failed?: boolean; ts: number };
const PREVIEW_TTL = 7 * 24 * 60 * 60_000;
// v2 (11-oct-2026): descarta los "sin preview" que quedaron guardados 7 días por errores pasajeros.
const PREVIEW_KEY = (id: string) => `sn:ad-prev:v2:${id}`;
/** Un anuncio sin creativo de verdad se vuelve a intentar en 1 hora, no en 7 días. */
const FAILED_TTL = 60 * 60_000;
const EXPIRY_MARGIN = 30 * 60_000;
const memCache = new Map<string, CacheEntry>();

/** Hora (ms) en que caduca una URL firmada de fbcdn (`oe=` en hexadecimal), o null si no caduca. */
export function fbcdnExpiry(url: string | null | undefined): number | null {
  const m = (url ?? "").match(/[?&]oe=([0-9A-Fa-f]{8})/);
  return m ? parseInt(m[1], 16) * 1000 : null;
}

/** ¿Siguen vivas las URLs de esta entrada (con 30 min de margen)? */
export function entryAlive(e: Pick<CacheEntry, "imageUrl" | "videoUrl">, now = Date.now()): boolean {
  const exps = [fbcdnExpiry(e.videoUrl), fbcdnExpiry(e.imageUrl)].filter((x): x is number => x !== null);
  return exps.every((x) => x - now > EXPIRY_MARGIN);
}

function isFresh(e: CacheEntry): boolean {
  if (Date.now() - e.ts >= (e.failed ? FAILED_TTL : PREVIEW_TTL)) return false;
  return e.failed ? true : entryAlive(e);
}

function dropPreviewCache(id: string) {
  memCache.delete(id);
  try { localStorage.removeItem(PREVIEW_KEY(id)); } catch { /* sin almacenamiento */ }
}

function readPreviewCache(id: string): CacheEntry | null {
  const mem = memCache.get(id);
  if (mem && isFresh(mem)) return mem;
  try {
    const raw = localStorage.getItem(PREVIEW_KEY(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!isFresh(parsed)) {
      dropPreviewCache(id);
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

// ============================================================
// COLA GLOBAL de pedidos al proxy (12-oct-2026)
// Firecrawl (lo que resuelve un anuncio sin caché) admite ~10 pedidos por minuto. Antes cada tarjeta
// visible disparaba el suyo a la vez: una página de 24 agotaba el minuto y 9 tarjetas se quedaban
// "sin preview". Ahora van de 3 en 3, en el orden en que entran en pantalla, y si el servidor dice
// "ocupado" toda la cola espera lo que pida y se reintenta, en vez de rendirse.
// ============================================================
const MAX_PARALLEL = 3;
const MAX_TRIES = 4;
let running = 0;
let pausedUntil = 0;
let pumpTimer: ReturnType<typeof setTimeout> | null = null;
const queue: { run: () => Promise<void>; signal: AbortSignal }[] = [];

function pump() {
  if (pumpTimer) return;
  const wait = pausedUntil - Date.now();
  if (wait > 0) {
    pumpTimer = setTimeout(() => { pumpTimer = null; pump(); }, wait);
    return;
  }
  while (running < MAX_PARALLEL && queue.length) {
    const job = queue.shift()!;
    if (job.signal.aborted) continue; // la tarjeta ya salió de pantalla
    running++;
    job.run().finally(() => { running--; pump(); });
  }
}

type ProxyResult =
  | { kind: "ok"; imageUrl: string | null; videoUrl: string | null }
  | { kind: "none" }      // el anuncio de verdad no tiene creativo
  | { kind: "busy" }      // servicio ocupado: reintentar
  | { kind: "error"; status: number }; // 401/403/red: no se guarda, no se reintenta en bucle

function requestMedia(adId: string, fresh: boolean, signal: AbortSignal): Promise<ProxyResult> {
  return new Promise((resolve) => {
    const run = async () => {
      if (signal.aborted) { resolve({ kind: "error", status: 0 }); return; }
      const projectId = (import.meta.env.VITE_SUPABASE_PROJECT_ID as string) || "krfdoofwhtcxbyhkjoik";
      // Con sesión: un anuncio sin caché dispara un scrape de pago y la función
      // solo lo hace para un usuario con acceso (lo cacheado responde igual).
      // Tope de 30 s: sin él la tarjeta se quedaba "cargando" para siempre si el servicio no respondía.
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30_000);
      try {
        const headers = await fnHeaders();
        const r = await fetch(
          `https://${projectId}.supabase.co/functions/v1/meta-ad-proxy?id=${adId}${fresh ? "&fresh=1" : ""}`,
          { headers, signal: ctrl.signal },
        );
        const data = await r.json().catch(() => null) as
          { success?: boolean; imageUrl?: string | null; videoUrl?: string | null; reason?: string; retryAfter?: number } | null;
        if (r.status === 503 || data?.reason === "busy" || data?.reason === "scrape_failed") {
          // "scrape_failed" es lo que contestaba la versión anterior del servidor cuando Firecrawl
          // estaba saturado: también es "espera y reintenta", no "no hay creativo".
          const secs = Math.min(60, Math.max(5, Number(data?.retryAfter) || 20));
          pausedUntil = Math.max(pausedUntil, Date.now() + secs * 1000);
          resolve({ kind: "busy" });
        } else if (data?.success && (data.videoUrl || isAdCreativeImage(data.imageUrl))) {
          resolve({ kind: "ok", imageUrl: data.imageUrl ?? null, videoUrl: data.videoUrl ?? null });
        } else if (r.status === 200) {
          resolve({ kind: "none" });
        } else {
          resolve({ kind: "error", status: r.status });
        }
      } catch {
        resolve({ kind: "busy" }); // red caída o 30 s sin respuesta: se reintenta
      } finally {
        clearTimeout(timer);
      }
    };
    queue.push({ run, signal });
    pump();
  });
}

export function AdMediaPreview({ snapshotUrl, adUrl, pageId, pageName, title, fill, fit = "cover", coverUrl }: AdMediaPreviewProps) {
  const fitCls = fit === "contain" ? "object-contain" : "object-cover";
  const adId = extractAdId(snapshotUrl) || extractAdId(adUrl);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  // El navegador ya pintó el creativo (hasta entonces se ve el póster de abajo, no un cuadro negro).
  const [painted, setPainted] = useState(false);
  // Si la URL guardada no carga (caducó antes de tiempo), se pide UNA vez de nuevo saltando la caché.
  const [fresh, setFresh] = useState(false);
  // "Reintentar" a mano (salta la caché del servidor: puede tener guardado un fallo de cuando Firecrawl
  // estaba saturado).
  const [retry, setRetry] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [coverOk, setCoverOk] = useState(true);
  const cover = coverOk ? safeExternalUrl(coverUrl ?? undefined) : null;

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

  // 1) Caché (memoria/localStorage) antes de pintar: 0 ms de parpadeo. 2) Si no hay, y la tarjeta ya
  //    está en pantalla, se pide al proxy por la cola global. Un solo efecto: así la caché y el pedido
  //    no se pisan (antes eran dos efectos que dependían del mismo estado).
  useEffect(() => {
    if (!adId) return;
    if (!fresh) {
      const cached = readPreviewCache(adId);
      if (cached) {
        if (cached.failed || (!cached.videoUrl && !isAdCreativeImage(cached.imageUrl))) { setState("failed"); return; }
        setImageUrl(isAdCreativeImage(cached.imageUrl) ? cached.imageUrl! : null);
        setVideoUrl(cached.videoUrl || null);
        setPainted(false);
        setState("ready");
        return;
      }
    }
    if (!visible) return;
    setState("loading");
    const ctrl = new AbortController();
    let cancelled = false;
    (async () => {
      for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
        const res = await requestMedia(adId, fresh, ctrl.signal);
        if (cancelled) return;
        if (res.kind === "busy") continue; // la cola ya espera lo que pidió el servidor
        if (res.kind === "ok") {
          writePreviewCache(adId, { imageUrl: res.imageUrl, videoUrl: res.videoUrl });
          setImageUrl(isAdCreativeImage(res.imageUrl) ? res.imageUrl : null);
          setVideoUrl(res.videoUrl || null);
          setPainted(false);
          setState("ready");
          return;
        }
        // Solo se recuerda el fallo si de verdad no hay creativo; un 401/429 o un error pasajero, no.
        if (res.kind === "none") writePreviewCache(adId, { failed: true });
        setState("failed");
        return;
      }
      if (!cancelled) setState("failed");
    })();
    return () => { cancelled = true; ctrl.abort(); };
  }, [adId, visible, fresh, retry]);

  // La URL guardada no cargó: se borra de la caché y se pide de nuevo (una vez) saltando la caché.
  const onMediaError = () => {
    if (!adId) { setState("failed"); return; }
    dropPreviewCache(adId);
    if (fresh) { setState("failed"); return; }
    setImageUrl(null);
    setVideoUrl(null);
    setState("idle");
    setFresh(true);
  };

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
        {!cover && (state === "loading" || (state === "ready" && !painted)) && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" /> Cargando el anuncio…
          </div>
        )}
        {state === "failed" && !cover && (
          <div className="flex flex-col items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><ImageOff className="w-3 h-3" /> Sin vista previa</span>
            <button
              type="button"
              onClick={() => { if (adId) dropPreviewCache(adId); setState("idle"); setFresh(true); setRetry((n) => n + 1); }}
              className="relative z-20 px-2.5 py-1 rounded-full border border-border/60 bg-background/70 text-foreground hover:border-primary/50 hover:text-primary transition-colors"
            >
              Reintentar
            </button>
          </div>
        )}
      </div>

      {/* Portada fija de la oferta: tapa el póster y queda debajo del anuncio real si este carga. */}
      {cover && (
        <img
          src={cover}
          alt={`Anuncio de ${pageName}`}
          loading="lazy"
          decoding="async"
          onError={() => setCoverOk(false)}
          className={`absolute inset-0 w-full h-full ${fitCls} bg-black`}
        />
      )}

      {/* Video real si lo detectamos. Transparente hasta que pinta su primer cuadro: así se ve el póster
          de arriba y no un cuadro negro mientras baja. */}
      {state === "ready" && videoUrl && (
        <video
          // Portada: la imagen del creativo (solo si es de verdad el anuncio, ver isAdCreativeImage); si no,
          // el cuadro de medio segundo del propio video.
          src={imageUrl ? videoUrl : `${videoUrl}#t=0.5`}
          poster={imageUrl ?? undefined}
          controls
          playsInline
          preload="metadata"
          onLoadedMetadata={() => setPainted(true)}
          onLoadedData={() => setPainted(true)}
          onError={onMediaError}
          className={`absolute inset-0 w-full h-full ${fitCls} ${imageUrl ? "bg-black" : "bg-transparent"}`}
        />
      )}

      {/* Imagen real del creativo (fbcdn) */}
      {state === "ready" && !videoUrl && imageUrl && (
        <img
          src={imageUrl}
          alt={`Anuncio de ${pageName}`}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setPainted(true)}
          onError={onMediaError}
          className={`absolute inset-0 w-full h-full ${fitCls} bg-black transition-opacity duration-300 ${painted ? "opacity-100" : "opacity-0"}`}
        />
      )}

      {/* Ver el anuncio original. En el teléfono no hay "hover": ahí se ve siempre. */}
      <a
        href={adId ? `https://www.facebook.com/ads/library/?id=${adId}` : (safeExternalUrl(snapshotUrl) ?? safeExternalUrl(adUrl) ?? "#")}
        target="_blank"
        rel="noopener noreferrer"
        title="Ver el anuncio original en la biblioteca de Facebook"
        className={`absolute ${fill ? "bottom-2 right-2" : "top-2 right-2"} z-10 px-2.5 py-1 rounded-full bg-background/90 backdrop-blur text-foreground text-[10px] font-bold inline-flex items-center gap-1 shadow-lg border border-border/60 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity hover:bg-primary hover:text-primary-foreground`}
      >
        <ExternalLink className="w-3 h-3" /> Original
      </a>
    </div>
  );
}
