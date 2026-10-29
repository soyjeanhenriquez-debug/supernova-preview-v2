import { useEffect, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { Boxes, Lock, Unlock, Copy, Check, Save, X, Flame, ShieldCheck, Sparkles, Loader2, CalendarClock, RefreshCw, ArrowRight, Eye, ChevronDown, Briefcase, Calculator, MessageCircle, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CREDIT_COSTS } from "@/hooks/useCredits";
import { useProjects } from "@/hooks/useProjects";
import { NICHE_LABEL, flagFor, MARKET_NAME, copyLabel, scaleLabel, offerToDemoAd, openOfferAdsInRadar, type Offer } from "@/lib/offers";
import { ModalPortal } from "@/components/ModalPortal";
import { MiniAppModal } from "@/components/MiniAppModal";
import { OfferDetailSheet } from "@/components/offers/OfferDetailSheet";
import { useOfferFollows } from "@/hooks/useOfferFollows";
import { OFFERS_TAB_KEY } from "@/components/dashboard/RoiHunterWidget";
import { useSellThis, offerBrief } from "@/lib/sellThis";
import { setSeed } from "@/lib/creativeSeed";
import { ToolFeedback } from "@/components/ToolFeedback";
import { daysAgoLabel, formatKitPrice, kitPriceFor, plainSpanish, pricingModelLabel, SOURCE_LANG } from "@/lib/kits";

/**
 * Mini Apps Rentables: negocios digitales listos para modelar y vender.
 * Cada kit nace de una oferta REAL que lleva meses pagando anuncios (no de una idea): por qué
 * funciona, instrucciones para construir la mini app con IA, guiones de venta, anuncios, página de
 * ventas, ganchos y precios por país. Al final, "Siguiente paso" (la misma puerta que "Mi versión"):
 * tu precio en tu moneda, tu anuncio con imagen y tus mensajes de WhatsApp.
 * generate-kit corre por cron (lunes y jueves) pero puede no publicar si la IA falla: la página
 * muestra cuántos kits hay y cuándo salió el último, nunca promete cuántos vienen.
 * Ver el catálogo es gratis; desbloquear un kit cobra créditos en el servidor (unlock_kit).
 * Debajo de los kits va "Apps que están creciendo ahora": las apps y SaaS que detecta NUESTRO radar.
 */

const NEW_KIT_DAYS = 7;
const isNewKit = (publishedAt: string) => Date.now() - new Date(publishedAt).getTime() < NEW_KIT_DAYS * 86_400_000;

interface KitProof {
  days_active?: number; active_ads?: number; winner_score?: number; market?: string;
  source_product?: string; source_advertiser?: string; price_hint?: string | null; copy_score?: number;
}
interface Kit {
  id: string; slug: string; title: string; tagline: string | null; niche: string | null; market_group: string | null;
  offer_id: string | null; cover_emoji: string | null; summary: string | null; whats_inside: string[];
  proof: KitProof; price_credits: number; published_at: string; unlocked: boolean;
}
/** Números vivos de la oferta fuente (tabla offers): los de `proof` son una foto del día en que nació el kit. */
interface KitLive { days_active: number; active_ads: number; last_seen: string | null }
interface KitContent {
  blueprint?: string; miniapp_prompt?: string; whatsapp_script?: string; vsl_script?: string;
  ad_copies?: { headline: string; primary_text: string }[]; landing_copy?: string; hooks?: string[];
  pricing?: Record<string, string>;
}

type Section = "blueprint" | "miniapp" | "whatsapp" | "vsl" | "ads" | "landing" | "hooks" | "pricing" | "next";
const SECTIONS: { k: Section; l: string }[] = [
  { k: "blueprint", l: "1 · Por qué funciona" }, { k: "miniapp", l: "2 · Crea tu mini app" }, { k: "pricing", l: "3 · Precios por país" },
  { k: "landing", l: "4 · Página de ventas" }, { k: "ads", l: "5 · 3 anuncios" }, { k: "hooks", l: "6 · Ganchos" },
  { k: "vsl", l: "7 · Video de ventas" }, { k: "whatsapp", l: "8 · Venta por WhatsApp" }, { k: "next", l: "Siguiente paso →" },
];
const SECTION_HELP: Record<Section, string> = {
  blueprint: "Lee esto primero: qué vende la oferta real, a quién y cómo lanzar tu versión.",
  miniapp: "Copia este texto y pégalo en una herramienta que crea apps con IA (Lovable, Bolt, v0 u otra). Te arma la app.",
  pricing: "Precio sugerido en cada moneda. Ajústalo a lo que cobra tu competencia.",
  landing: "El texto de tu página de ventas. Cambia lo que esté entre [corchetes] por tus datos reales.",
  ads: "3 anuncios con ángulos distintos para Facebook e Instagram. Prueba los 3 y deja el que mejor funcione.",
  hooks: "Ganchos = la primera frase de un video o anuncio, la que hace que la gente se detenga.",
  vsl: "Guion de un video de ventas de 90 segundos. Puedes grabarlo con tu cara o con voz e imágenes.",
  whatsapp: "5 mensajes para quien te escribe por WhatsApp: de la primera pregunta al pago.",
  next: "",
};

export function KitsPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const [kits, setKits] = useState<Kit[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState<Kit | null>(null);
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const [apps, setApps] = useState<Offer[] | null>(null);
  const [appsTotal, setAppsTotal] = useState(0);
  const [creating, setCreating] = useState<Offer | null>(null);
  const [detail, setDetail] = useState<Offer | null>(null);
  // "Ver detalles" de un kit: la misma ficha de Ofertas (video, números, veredicto) de la oferta real.
  const [kitDetail, setKitDetail] = useState<{ kit: Kit; offer: Offer } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const [live, setLive] = useState<Record<string, KitLive>>({});
  const follows = useOfferFollows();

  // Un fallo de red no es "todavía no hay kits": se dice y se deja reintentar.
  const load = async () => {
    setLoadError(false);
    const { data, error } = await supabase.rpc("get_kits");
    if (error) { setLoadError(true); setKits([]); return; }
    const list = ((data ?? []) as unknown as Kit[]).map((k) => ({ ...k, whats_inside: Array.isArray(k.whats_inside) ? k.whats_inside : [] }));
    setKits(list);
    // Días y anuncios de HOY de cada oferta fuente (pocas filas, por id). Si falla, quedan los del kit.
    const ids = list.map((k) => k.offer_id).filter(Boolean) as string[];
    if (ids.length) {
      const { data: offers } = await supabase.from("offers").select("id, days_active, active_ads, last_seen").in("id", ids);
      setLive(Object.fromEntries(((offers ?? []) as (KitLive & { id: string })[]).map((o) => [o.id, o])));
    }
  };
  useEffect(() => { load(); }, []);

  // Apps & SaaS de nuestro radar, las más copiables primero (mismas reglas que Ofertas).
  useEffect(() => {
    supabase.from("offers").select("*", { count: "exact" })
      .eq("enrich_failed", false).is("excluded_reason", null).eq("is_primary", true)
      .eq("offer_type", "saas_app").gte("copy_score", 4)
      .order("winner_index", { ascending: false, nullsFirst: false })
      .order("winner_score", { ascending: false }).order("active_ads", { ascending: false })
      .limit(24)
      .then(({ data, count }) => {
        // Una misma app puede anunciarse desde varias páginas: una tarjeta por producto.
        const seen = new Set<string>();
        const unique = ((data ?? []) as Offer[]).filter((o) => {
          const key = (o.product_name || o.page_name || o.id).toLowerCase().replace(/[^a-z0-9áéíóúñü]+/gi, "");
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setApps(unique.slice(0, 9));
        setAppsTotal(count ?? 0);
      });
  }, []);

  const seeAllApps = () => { localStorage.setItem(OFFERS_TAB_KEY, "apps"); onNavigate?.("Ofertas"); };

  const openKitDetail = async (kit: Kit) => {
    if (!kit.offer_id) { setOpen(kit); return; }
    setLoadingDetail(kit.id);
    const { data } = await supabase.from("offers").select("*").eq("id", kit.offer_id).maybeSingle();
    setLoadingDetail(null);
    if (data) setKitDetail({ kit, offer: data as Offer });
    else setOpen(kit);
  };

  const unlock = async (kit: Kit) => {
    setUnlocking(kit.id);
    try {
      const { data, error } = await supabase.rpc("unlock_kit", { p_kit_id: kit.id });
      const res = (data ?? {}) as { success?: boolean; error?: string; already?: boolean };
      if (error || !res.success) {
        toast.error(res.error || error?.message || "No se pudo desbloquear", {
          description: res.error === "Saldo insuficiente" ? "Recarga créditos y vuelve a intentarlo." : undefined,
        });
        return;
      }
      if (!res.already) {
        toast(`-${kit.price_credits} ⚡`, { description: `Desbloqueado: ${kit.title}`, duration: 2500 });
        window.dispatchEvent(new CustomEvent("supernova_credit_spent", { detail: { cost: kit.price_credits, action: "unlock_kit", label: "Desbloquear Mini App" } }));
      }
      const updated = { ...kit, unlocked: true };
      setKits((prev) => (prev ?? []).map((k) => (k.id === kit.id ? updated : k)));
      setKitDetail(null);
      setOpen(updated);
    } finally {
      setUnlocking(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-primary font-semibold">Mi negocio · Etapa 1 · Elegir</p>
          <h2 className="page-heading font-display text-2xl text-foreground mt-1">MINI APPS RENTABLES</h2>
          <p className="text-sm text-muted-foreground mt-3 max-w-2xl">
            Negocios digitales listos para modelar y vender. Cada kit nace de una oferta real que lleva meses pagando anuncios.
          </p>
          <details className="group mt-2 max-w-2xl">
            <summary className="inline-flex items-center gap-1 cursor-pointer list-none [&::-webkit-details-marker]:hidden select-none text-[12.5px] font-medium text-muted-foreground hover:text-foreground">
              ¿Cómo funciona? <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
            </summary>
            <ul className="mt-2 space-y-1 pl-4 list-disc marker:text-primary text-[12.5px] text-muted-foreground">
              <li><strong className="text-foreground font-semibold">Mira la oferta real gratis</strong> en "Ver detalles": su anuncio, sus días pagando y su página.</li>
              <li><strong className="text-foreground font-semibold">Desbloquea el kit</strong> una sola vez: trae las instrucciones para crear la app con IA, la página de ventas, 3 anuncios, ganchos, guiones y precios por país.</li>
              <li><strong className="text-foreground font-semibold">Sigue el "Siguiente paso"</strong>: tu precio en tu moneda, la imagen de tu anuncio y tus mensajes de WhatsApp.</li>
            </ul>
          </details>
        </div>
        <div className="flex gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 bg-success/10 text-success border border-success/30 font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" /> Licencia comercial incluida
          </span>
          {kits && kits.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 bg-secondary/60 text-foreground border border-border font-semibold">
              <CalendarClock className="w-3.5 h-3.5 text-primary" /> {kits.length} {kits.length === 1 ? "kit listo" : "kits listos"} · el último salió {daysAgoLabel(kits[0].published_at)}
            </span>
          )}
        </div>
      </div>

      {kits === null ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{[0, 1, 2].map((i) => <div key={i} className="card-surface rounded-2xl h-[380px] animate-pulse" />)}</div>
      ) : loadError ? (
        <div className="card-surface rounded-2xl py-16 text-center px-6">
          <div className="empty-icon mb-5"><RefreshCw className="w-7 h-7" strokeWidth={1.4} /></div>
          <div className="font-display font-semibold text-base mb-1">No pudimos cargar los kits</div>
          <div className="text-sm text-muted-foreground max-w-md mx-auto">Suele ser la conexión. Tus kits desbloqueados siguen siendo tuyos.</div>
          <button onClick={load} className="btn-primary-nova px-4 py-2 rounded-lg text-[13px] mt-5">Reintentar</button>
        </div>
      ) : kits.length === 0 ? (
        <div className="card-surface rounded-2xl py-20 text-center px-6">
          <div className="empty-icon mb-5"><Boxes className="w-7 h-7" strokeWidth={1.4} /></div>
          <div className="font-display font-semibold text-base mb-1">Todavía no hay kits publicados</div>
          <div className="text-sm text-muted-foreground max-w-md mx-auto">Mientras tanto, elige una oferta ganadora y haz tu versión desde ahí.</div>
          <button onClick={() => onNavigate?.("Ofertas")} className="btn-primary-nova px-4 py-2 rounded-lg text-[13px] mt-5">Explorar ofertas</button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {kits.map((k) => <KitCard key={k.id} kit={k} live={k.offer_id ? live[k.offer_id] : undefined} busy={unlocking === k.id} onUnlock={() => unlock(k)} onOpen={() => setOpen(k)}
            onDetails={() => void openKitDetail(k)} loadingDetails={loadingDetail === k.id} />)}
        </div>
      )}

      {/* Apps que nuestro radar ve escalar: material nuevo entre un kit y el siguiente */}
      {apps && apps.length > 0 && (
        <section className="pt-4 space-y-4">
          <div className="flex items-end justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-display text-lg text-foreground">Apps que están creciendo ahora</h3>
              <p className="text-[13px] text-muted-foreground mt-1 max-w-2xl">
                Apps que pagan anuncios hoy, las más fáciles de replicar primero. Elige una y haz tu versión.
              </p>
            </div>
            <button onClick={seeAllApps} className="text-[12.5px] font-semibold text-primary hover:underline inline-flex items-center gap-1">
              Ver las {appsTotal.toLocaleString("es")} apps <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {apps.map((o) => <AppCard key={o.id} o={o} onCreate={() => setCreating(o)} onOpen={() => setDetail(o)} />)}
          </div>
        </section>
      )}

      {open && <KitModal kit={open} live={open.offer_id ? live[open.offer_id] : undefined} onClose={() => setOpen(null)} onUnlock={() => unlock(open)} busy={unlocking === open.id} onNavigate={onNavigate} />}
      {detail && (
        <OfferDetailSheet
          offer={detail}
          following={follows.isFollowing(detail.id)}
          onToggleFollow={() => follows.toggle(detail)}
          onCreate={() => setCreating(detail)}
          onSeeAds={() => openOfferAdsInRadar(detail, onNavigate)}
          onClose={() => setDetail(null)}
        />
      )}
      {kitDetail && (
        <OfferDetailSheet
          offer={kitDetail.offer}
          following={follows.isFollowing(kitDetail.offer.id)}
          onToggleFollow={() => follows.toggle(kitDetail.offer)}
          onCreate={() => undefined}
          onSeeAds={() => openOfferAdsInRadar(kitDetail.offer, onNavigate)}
          onClose={() => setKitDetail(null)}
          primaryAction={kitDetail.kit.unlocked
            ? { label: "Abrir mi kit", onClick: () => { const k = kitDetail.kit; setKitDetail(null); setOpen(k); } }
            : { label: "Desbloquear mi kit", cost: `${kitDetail.kit.price_credits} ⚡`, busy: unlocking === kitDetail.kit.id, onClick: () => void unlock(kitDetail.kit) }}
        />
      )}
      {creating && <MiniAppModal ad={offerToDemoAd(creating)} brief={offerBrief(creating)} offer={creating} origin="mini-apps" onNavigate={onNavigate} onClose={() => setCreating(null)} />}
    </div>
  );
}

function AppCard({ o, onCreate, onOpen }: { o: Offer; onCreate: () => void; onOpen: () => void }) {
  const copy = copyLabel(o.copy_score);
  return (
    <article className="card-surface rounded-xl p-4 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-display font-semibold text-[14.5px] leading-snug text-foreground min-w-0">
          {o.product_name || o.page_name || "App sin nombre"}
        </h4>
        <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-1 ${copy.cls}`}>{copy.label}</span>
      </div>
      <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
        <span>Se anuncia en {flagFor(o.market)} {MARKET_NAME[o.market] ?? o.market}</span>
        {o.niche && <span>· {NICHE_LABEL[o.niche] ?? o.niche}</span>}
        {o.price_hint && <span>· {o.price_hint}</span>}
      </div>
      {(o.mechanism || o.why_wins) && (
        <p className="text-[12.5px] text-foreground/80 mt-2.5 leading-relaxed line-clamp-3 flex-1">{o.mechanism || o.why_wins}</p>
      )}
      <div className="mt-3 pt-3 border-t border-border/60 text-[11px] text-muted-foreground flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1 text-primary font-semibold"><Flame className="w-3 h-3" /> {o.days_active} días pagando anuncios</span>
        <span>{o.active_ads} anuncios activos · {scaleLabel(o)}</span>
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={onCreate} className="flex-1 btn-primary-nova py-2 rounded-lg text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" /> Hacer mi versión · {CREDIT_COSTS.gen_master_prompt} créditos
        </button>
        <button onClick={onOpen} aria-label="Ver detalles y veredicto" title="Ver detalles y veredicto"
          className="px-3 min-w-11 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 inline-flex items-center justify-center">
          <Eye className="w-4 h-4" />
        </button>
      </div>
    </article>
  );
}

/** Días y anuncios de hoy si los tenemos; si no, los del día en que nació el kit. */
function kitNumbers(kit: Kit, live?: KitLive) {
  const p = kit.proof ?? {};
  return {
    days: live?.days_active ?? p.days_active,
    ads: live?.active_ads ?? p.active_ads,
    seen: live?.last_seen ? daysAgoLabel(live.last_seen) : "",
  };
}

function KitCard({ kit, live, busy, onUnlock, onOpen, onDetails, loadingDetails }: { kit: Kit; live?: KitLive; busy: boolean; onUnlock: () => void; onOpen: () => void; onDetails: () => void; loadingDetails: boolean }) {
  const lang = kit.market_group ? SOURCE_LANG[kit.market_group] : null;
  const p = kit.proof ?? {};
  const n = kitNumbers(kit, live);
  return (
    <article className="card-surface rounded-2xl overflow-hidden flex flex-col ad-card-hover">
      <div className="h-36 bg-gradient-to-br from-primary/20 via-secondary/40 to-background flex items-center justify-center relative">
        <span className="text-6xl drop-shadow">{kit.cover_emoji || "🧩"}</span>
        <div className="absolute top-2 left-2 flex gap-1.5 flex-wrap pr-16">
          {isNewKit(kit.published_at) && <span className="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-1 bg-primary text-primary-foreground">Nuevo</span>}
          {kit.niche && <span className="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-1 bg-background/80 backdrop-blur text-foreground border border-border">{NICHE_LABEL[kit.niche] ?? kit.niche}</span>}
          {lang && <span title="Idioma del anuncio real del que nace el kit. Tu kit viene en español." className="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-1 bg-background/80 backdrop-blur text-foreground border border-border">Original en {lang}</span>}
        </div>
        <span className={`absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-1 ${kit.unlocked ? "bg-success/20 text-success" : "bg-background/80 text-muted-foreground border border-border"}`}>
          {kit.unlocked ? "Desbloqueado" : `${kit.price_credits} ⚡`}
        </span>
      </div>
      <div className="p-4 flex flex-col flex-1">
        <h4 className="font-display font-semibold text-[16px] leading-snug text-foreground">{kit.title}</h4>
        {kit.tagline && <p className="text-[12px] text-primary mt-1">{kit.tagline}</p>}
        {kit.summary && <p className="text-[12.5px] text-muted-foreground mt-2.5 leading-relaxed line-clamp-2">{kit.summary}</p>}

        {kit.whats_inside.length > 0 && (
          <ul className="mt-3 space-y-1">
            {kit.whats_inside.slice(0, 3).map((w, i) => (
              <li key={i} className="text-[11.5px] text-foreground/85 flex items-start gap-1.5"><Check className="w-3 h-3 text-success mt-0.5 shrink-0" /> {w}</li>
            ))}
            {kit.whats_inside.length > 3 && <li className="text-[11px] text-muted-foreground pl-4">+{kit.whats_inside.length - 3} más</li>}
          </ul>
        )}

        <div className="mt-4 pt-3 border-t border-border/60 text-[11px] text-muted-foreground flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1 text-primary font-semibold"><Flame className="w-3 h-3" /> {n.days ?? "—"} días pagando anuncios</span>
          <span>{n.ads ?? "—"} anuncios activos</span>
          {p.market && <span>Se anuncia en {flagFor(p.market)} {MARKET_NAME[p.market] ?? p.market}</span>}
          {n.seen && <span>· visto activo {n.seen}</span>}
        </div>

        <div className="mt-3 flex gap-2">
          {kit.unlocked ? (
            <button onClick={onOpen} className="flex-1 btn-primary-nova py-2.5 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-1.5">
              <Unlock className="w-3.5 h-3.5" /> Abrir mi kit
            </button>
          ) : (
            <button onClick={onUnlock} disabled={busy} className="flex-1 btn-primary-nova py-2.5 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-1.5">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />} {busy ? "Desbloqueando…" : `Desbloquear · ${kit.price_credits} ⚡`}
            </button>
          )}
          <button onClick={onDetails} disabled={loadingDetails} title="Ver el anuncio real, sus números y el veredicto (gratis)"
            className="px-3 rounded-lg border border-border text-[12.5px] font-semibold text-foreground hover:border-primary/40 inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
            {loadingDetails ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />} Ver detalles
          </button>
        </div>
      </div>
    </article>
  );
}

function KitModal({ kit, live, onClose, onUnlock, busy, onNavigate }: { kit: Kit; live?: KitLive; onClose: () => void; onUnlock: () => void; busy: boolean; onNavigate?: (page: string) => void }) {
  const { create } = useProjects();
  const { sell, selling } = useSellThis(onNavigate ? (page) => { onClose(); onNavigate(page); } : undefined);
  const [content, setContent] = useState<KitContent | null>(null);
  const [contentError, setContentError] = useState(false);
  const [section, setSection] = useState<Section>("blueprint");
  const [copied, setCopied] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [country, setCountry] = useState<string | null>(() => { try { return localStorage.getItem("supernova_country"); } catch { return null; } });
  const n = kitNumbers(kit, live);

  const loadContent = () => {
    setContentError(false);
    setContent(null);
    supabase.rpc("get_kit_content", { p_kit_id: kit.id }).then(({ data, error }) => {
      if (error || !data) { setContentError(true); return; }
      setContent(data as KitContent);
    });
  };
  useEffect(() => {
    if (!kit.unlocked) return;
    loadContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kit.id, kit.unlocked]);

  // El país que la persona dio al entrar (user_age_country), para mostrarle SU precio primero.
  useEffect(() => {
    if (country || !kit.unlocked) return;
    let on = true;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("user_age_country").select("country").eq("user_id", user.id).maybeSingle();
      const c = String(data?.country ?? "").toUpperCase();
      if (on && c) setCountry(c);
    })();
    return () => { on = false; };
  }, [country, kit.unlocked]);

  const myPrice = kitPriceFor(content?.pricing, country);
  const ads = content?.ad_copies ?? [];

  const sectionText = (s: Section = section): string => {
    if (!content) return "";
    switch (s) {
      case "blueprint": return content.blueprint ?? "";
      case "miniapp": return content.miniapp_prompt ?? "";
      case "whatsapp": return content.whatsapp_script ?? "";
      case "vsl": return content.vsl_script ?? "";
      case "landing": return content.landing_copy ?? "";
      case "ads": return ads.map((a, i) => `### Anuncio ${i + 1} — ${a.headline}\n\n${a.primary_text}`).join("\n\n");
      case "hooks": return (content.hooks ?? []).map((h, i) => `${i + 1}. ${h}`).join("\n");
      case "pricing": {
        const pr = content.pricing ?? {};
        const rows = Object.entries(pr).filter(([k]) => !["modelo", "nota"].includes(k))
          .map(([k, v]) => `- **${MARKET_NAME[k] ?? k}**: ${formatKitPrice(v)}${k === myPrice?.market && myPrice.local ? " ← tu país" : ""}`).join("\n");
        return `**Cómo cobrar:** ${pricingModelLabel(pr.modelo)}\n\n${rows}${pr.nota ? `\n\n_${plainSpanish(pr.nota)}_` : ""}`;
      }
      case "next": return "";
    }
  };

  const copyText = async (key: string, text: string, msg = "Copiado") => {
    if (!text) return;
    try { await navigator.clipboard.writeText(text); } catch { toast.error("No se pudo copiar. Selecciona el texto y cópialo a mano."); return; }
    setCopied(key); setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    toast.success(msg);
  };

  const saveToBrain = () => {
    if (!content || saved) return;
    create({ name: `Mini App · ${kit.title}`, mode: "crear", context: { kit: { id: kit.id, title: kit.title, tagline: kit.tagline }, blueprint: content.blueprint, miniapp: content.miniapp_prompt, salesScript: content.whatsapp_script, vsl: content.vsl_script } });
    setSaved(true);
    toast.success("Guardado en Lo que creaste");
  };

  /** Paso 1: el kit pasa a ser tu producto (gratis), con el precio de tu país. */
  const useAsMine = () => void sell({ product: kit.title, promise: kit.tagline || kit.summary, price: myPrice?.price || kit.proof?.price_hint });

  /** Paso 2: la imagen del anuncio en Creativos, con el anuncio 1 como referencia. No genera sola: allá se ve el costo. */
  const makeAdImage = () => {
    const ad = ads[0];
    setSeed({
      source: "manual", target: "creativos", title: kit.title.slice(0, 80),
      product: kit.title.slice(0, 200), who: (kit.summary ?? "").slice(0, 200), promise: (kit.tagline ?? "").slice(0, 200),
      price: myPrice?.price?.slice(0, 200),
      hook: (ad?.headline ?? content?.hooks?.[0] ?? "").slice(0, 140),
      angle: (ad?.primary_text ?? "").slice(0, 200),
      evidence: n.days ? `${n.days} días pagando anuncios` : undefined,
      refId: kit.id,
    });
    onClose();
    onNavigate?.("Creativos");
  };

  const step = (num: number, title: string, body: ReactNode) => (
    <li className="rounded-xl border border-border p-4">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-primary/15 text-primary text-[12px] font-bold inline-flex items-center justify-center shrink-0">{num}</span>
        <h4 className="font-display font-semibold text-[14.5px] text-foreground">{title}</h4>
      </div>
      <div className="mt-2 pl-8 space-y-2.5">{body}</div>
    </li>
  );
  const btn = "px-3 py-2 rounded-lg border border-border text-[12px] text-foreground hover:border-primary/40 inline-flex items-center gap-1.5 disabled:opacity-60";

  const nextStep = () => (
    <div className="space-y-4">
      <div>
        <h3 className="font-display font-semibold text-base text-foreground">Siguiente paso: véndelo</h3>
        <p className="text-[12.5px] text-muted-foreground mt-1">Ya tienes el kit. Estos 3 pasos lo convierten en tu producto, con tu precio, tu anuncio y tu WhatsApp.</p>
      </div>
      <ol className="space-y-3">
        {step(1, "Ponle tu precio en tu moneda", <>
          {myPrice ? (
            <p className="text-[13px] text-foreground">
              Precio sugerido{myPrice.local ? ` en ${MARKET_NAME[myPrice.market] ?? myPrice.market}` : " (en dólares: tu país no está en el kit)"}: <strong className="font-semibold">{myPrice.price}</strong>
              <span className="text-muted-foreground"> · {pricingModelLabel(content?.pricing?.modelo)}</span>
            </p>
          ) : <p className="text-[13px] text-muted-foreground">Mira la sección "Precios por país" y elige el de tu moneda.</p>}
          <div className="flex flex-wrap gap-2">
            <button onClick={useAsMine} disabled={selling} className="btn-primary-nova px-3 py-2 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-60">
              {selling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Briefcase className="w-3.5 h-3.5" />} Usarlo como mi producto · gratis
            </button>
            {onNavigate && <button onClick={() => { onClose(); onNavigate("Precio"); }} className={btn}><Calculator className="w-3.5 h-3.5" /> Cuánto puedo pagar por cliente · gratis</button>}
          </div>
        </>)}
        {step(2, "Haz tu anuncio", <>
          {ads[0] ? <p className="text-[13px] text-foreground">Anuncio 1: <span className="text-muted-foreground">«{ads[0].headline}»</span></p>
            : <p className="text-[13px] text-muted-foreground">Usa los ganchos del kit como primera frase.</p>}
          <div className="flex flex-wrap gap-2">
            {onNavigate && (
              <button onClick={makeAdImage} className="btn-primary-nova px-3 py-2 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" /> Hacer la imagen de este anuncio · {CREDIT_COSTS.gen_ad_image} créditos por imagen
              </button>
            )}
            <button onClick={() => void copyText("ads", sectionText("ads"), "Copiaste los 3 anuncios")} disabled={!ads.length} className={btn}>
              {copied === "ads" ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />} Copiar los 3 anuncios
            </button>
          </div>
        </>)}
        {step(3, "Vende por WhatsApp", <>
          <p className="text-[13px] text-muted-foreground">5 mensajes listos: cambia [TU_LINK_DE_PAGO] y el precio por los tuyos antes de enviarlos.</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void copyText("wa", content?.whatsapp_script ?? "", "Copiaste los mensajes de WhatsApp")} disabled={!content?.whatsapp_script} className={btn}>
              {copied === "wa" ? <Check className="w-3.5 h-3.5 text-success" /> : <MessageCircle className="w-3.5 h-3.5" />} Copiar los 5 mensajes
            </button>
            {onNavigate && <button onClick={() => { onClose(); onNavigate("Recuperar"); }} className={btn}><RefreshCw className="w-3.5 h-3.5" /> Mensajes para quien casi compra</button>}
          </div>
        </>)}
      </ol>
      <ToolFeedback tool="mini-app-kit" refId={kit.id} context={{ kit: kit.title.slice(0, 60) }} question="¿Te sirvió este kit?" />
    </div>
  );

  return (
    <ModalPortal onClose={onClose}>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="card-surface rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-3xl">{kit.cover_emoji || "🧩"}</span>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.2em] text-primary font-semibold">Mini App Rentable · licencia comercial</div>
              <h3 className="font-display font-semibold text-lg text-foreground truncate">{kit.title}</h3>
              {kit.tagline && <p className="text-[12px] text-muted-foreground truncate">{kit.tagline}</p>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground p-2 -m-1 shrink-0"><X className="w-5 h-5" /></button>
        </div>

        {!kit.unlocked ? (
          <div className="p-8 text-center space-y-4 overflow-auto">
            <Lock className="w-8 h-8 text-primary mx-auto" />
            <p className="text-sm text-muted-foreground max-w-md mx-auto">{kit.summary}</p>
            <p className="font-display font-semibold text-base text-foreground">Todo incluido · {kit.price_credits} créditos, una sola vez</p>
            <ul className="text-left max-w-sm mx-auto space-y-1">
              {kit.whats_inside.map((w, i) => <li key={i} className="text-[12px] text-foreground/85 flex items-start gap-1.5"><Check className="w-3 h-3 text-success mt-0.5 shrink-0" /> {w}</li>)}
              <li className="text-[12px] text-foreground/85 flex items-start gap-1.5"><Check className="w-3 h-3 text-success mt-0.5 shrink-0" /> Siguiente paso: tu precio, tu anuncio y tu WhatsApp</li>
            </ul>
            <button onClick={onUnlock} disabled={busy} className="btn-primary-nova px-6 py-2.5 rounded-lg text-[13px] font-semibold inline-flex items-center gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {busy ? "Desbloqueando…" : `Desbloquear mi kit · ${kit.price_credits} créditos`}
            </button>
          </div>
        ) : (
          <>
            {/* En móvil las secciones van en una sola fila deslizable: envueltas en 3 líneas se comían media pantalla. */}
            <div className="px-5 pt-3 flex flex-nowrap sm:flex-wrap gap-1.5 border-b border-border pb-3 overflow-x-auto sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {SECTIONS.map((s) => (
                <button key={s.k} onClick={() => setSection(s.k)}
                  className={`px-3 py-1.5 rounded-full text-[11.5px] font-semibold border transition-colors shrink-0 whitespace-nowrap ${
                    section === s.k ? "bg-primary text-primary-foreground border-primary"
                      : s.k === "next" ? "border-primary/40 text-primary hover:bg-primary/10" : "bg-secondary/40 text-muted-foreground border-border hover:text-foreground"}`}>
                  {s.l}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-auto px-5 py-4">
              {contentError ? (
                <div className="text-center py-8 space-y-3">
                  <p className="text-sm text-muted-foreground">No pudimos abrir tu kit. Suele ser la conexión: el kit sigue siendo tuyo.</p>
                  <button onClick={loadContent} className="btn-primary-nova px-4 py-2 rounded-lg text-[13px]">Reintentar</button>
                </div>
              ) : content === null ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Abriendo tu kit…</div>
              ) : section === "next" ? nextStep() : (
                <>
                  {SECTION_HELP[section] && <p className="text-[12px] text-muted-foreground mb-3 pb-3 border-b border-border/60">{SECTION_HELP[section]}</p>}
                  <article className="prose prose-invert prose-sm max-w-none">
                    {sectionText()
                      ? <ReactMarkdown>{sectionText()}</ReactMarkdown>
                      : <p className="text-muted-foreground">Esta parte del kit quedó vacía. Escríbenos desde Ayuda y la completamos.</p>}
                  </article>
                  {(() => {
                    const i = SECTIONS.findIndex((s) => s.k === section);
                    const nx = SECTIONS[i + 1];
                    return nx ? (
                      <button onClick={() => setSection(nx.k)} className="mt-5 text-[12.5px] font-semibold text-primary hover:underline inline-flex items-center gap-1">
                        Seguir: {nx.l.replace(/^\d+ · /, "").replace(" →", "")} <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ) : null;
                  })()}
                </>
              )}
            </div>
            <div className="px-5 py-3 border-t border-border flex items-center gap-2 flex-wrap">
              {section !== "next" && (
                <button onClick={() => void copyText("section", sectionText(), "Copiado al portapapeles")} disabled={!content || !sectionText()} className="flex-1 sm:flex-none justify-center px-3 sm:px-4 py-2 rounded-lg border border-border text-[12px] text-foreground hover:border-primary/40 inline-flex items-center gap-1.5 disabled:opacity-60">
                  {copied === "section" ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />} Copiar esta sección
                </button>
              )}
              <button onClick={saveToBrain} disabled={!content || saved} className="flex-1 sm:flex-none justify-center px-3 sm:px-4 py-2 rounded-lg border border-border text-[12px] text-foreground hover:border-primary/40 inline-flex items-center gap-1.5 disabled:opacity-60">
                <Save className="w-3.5 h-3.5" /> {saved ? "Guardado en Lo que creaste" : "Guardar en Lo que creaste"}
              </button>
              {section !== "next" && (
                <button onClick={() => setSection("next")} disabled={!content}
                  className="w-full sm:w-auto justify-center px-3 sm:px-4 py-2 rounded-lg border border-primary/40 text-[12px] font-semibold text-primary hover:bg-primary/10 inline-flex items-center gap-1.5 disabled:opacity-60">
                  Siguiente paso: véndelo <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
              <span className="w-full sm:w-auto sm:ml-auto text-[11px] text-muted-foreground">
                Nace de: {kit.proof?.source_product ?? "una oferta real"} · {n.days ?? "—"} días pagando anuncios
              </span>
            </div>
          </>
        )}
      </div>
    </div>
    </ModalPortal>
  );
}
