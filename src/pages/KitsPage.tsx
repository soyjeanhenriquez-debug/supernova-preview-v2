import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Boxes, Lock, Unlock, Copy, Check, Save, X, Flame, ShieldCheck, Sparkles, Loader2, CalendarClock, RefreshCw, ArrowRight, Eye, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CREDIT_COSTS } from "@/hooks/useCredits";
import { useProjects } from "@/hooks/useProjects";
import { NICHE_LABEL, MARKET_GROUP, flagFor, MARKET_NAME, copyLabel, scaleLabel, offerToDemoAd, openOfferAdsInRadar, type Offer } from "@/lib/offers";
import { ModalPortal } from "@/components/ModalPortal";
import { MiniAppModal } from "@/components/MiniAppModal";
import { OfferDetailSheet } from "@/components/offers/OfferDetailSheet";
import { useOfferFollows } from "@/hooks/useOfferFollows";
import { OFFERS_TAB_KEY } from "@/components/dashboard/RoiHunterWidget";

/**
 * Mini Apps Rentables: negocios digitales listos para copiar y cobrar.
 * Cada kit nace de una oferta REAL que está pagando anuncios ahora mismo
 * (no de una idea): blueprint, mega-prompt para construir la mini app,
 * guiones de venta, anuncios, landing, hooks y precios por país.
 * "2 nuevos cada semana" es automático (generate-kit por cron, lunes y jueves).
 * Ver el catálogo es gratis; desbloquear un kit cobra créditos server-side.
 * Debajo de los kits va "Apps que están escalando ahora": las apps y SaaS que
 * detecta NUESTRO radar (tabla offers), para que la página siempre tenga
 * material nuevo entre un lanzamiento y otro.
 */

// generate-kit corre lunes y jueves a las 10:00 UTC (cron supernova-generate-kit-twice-weekly).
const KIT_DAYS = [1, 4];
const KIT_HOUR_UTC = 10;
const NEW_KIT_DAYS = 7;

/** Próximo lanzamiento automático, en palabras ("hoy", "mañana", "el lunes"). */
function nextKitLabel(now = new Date()): string {
  for (let i = 0; i < 8; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i, KIT_HOUR_UTC));
    if (!KIT_DAYS.includes(d.getUTCDay()) || d.getTime() <= now.getTime()) continue;
    const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
      - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000);
    if (days <= 0) return "hoy";
    if (days === 1) return "mañana";
    return `el ${d.toLocaleDateString("es", { weekday: "long" })}`;
  }
  return "esta semana";
}
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
interface KitContent {
  blueprint?: string; miniapp_prompt?: string; whatsapp_script?: string; vsl_script?: string;
  ad_copies?: { headline: string; primary_text: string }[]; landing_copy?: string; hooks?: string[];
  pricing?: Record<string, string>;
}

type Section = "blueprint" | "miniapp" | "whatsapp" | "vsl" | "ads" | "landing" | "hooks" | "pricing";
const SECTIONS: { k: Section; l: string }[] = [
  { k: "blueprint", l: "Por qué funciona" }, { k: "miniapp", l: "Tu mini app" }, { k: "whatsapp", l: "Venta WhatsApp" },
  { k: "vsl", l: "Guion VSL" }, { k: "ads", l: "3 anuncios" }, { k: "landing", l: "Landing" },
  { k: "hooks", l: "Hooks" }, { k: "pricing", l: "Precios por país" },
];

export function KitsPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const [kits, setKits] = useState<Kit[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState<Kit | null>(null);
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const [apps, setApps] = useState<Offer[] | null>(null);
  const [appsTotal, setAppsTotal] = useState(0);
  const [creating, setCreating] = useState<Offer | null>(null);
  const [detail, setDetail] = useState<Offer | null>(null);
  const follows = useOfferFollows();

  // Un fallo de red no es "todavía no hay kits": se dice y se deja reintentar.
  const load = async () => {
    setLoadError(false);
    const { data, error } = await supabase.rpc("get_kits");
    if (error) { setLoadError(true); setKits([]); return; }
    setKits(((data ?? []) as unknown as Kit[]).map((k) => ({ ...k, whats_inside: Array.isArray(k.whats_inside) ? k.whats_inside : [] })));
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
            Negocios digitales listos para copiar y cobrar. Elige un kit y desbloquéalo.
          </p>
          <details className="group mt-2 max-w-2xl">
            <summary className="inline-flex items-center gap-1 cursor-pointer list-none [&::-webkit-details-marker]:hidden select-none text-[12.5px] font-medium text-muted-foreground hover:text-foreground">
              ¿Cómo funciona? <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
            </summary>
            <ul className="mt-2 space-y-1 pl-4 list-disc marker:text-primary text-[12.5px] text-muted-foreground">
              <li>Cada kit nace de una oferta real que está pagando anuncios ahora mismo.</li>
              <li>Trae el plan, el prompt para construir la app, guiones, anuncios, landing y precios.</li>
              <li>Pagas una vez (el precio está en cada kit) y es tuyo, con licencia comercial.</li>
            </ul>
          </details>
        </div>
        <div className="flex gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 bg-success/10 text-success border border-success/30 font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" /> Licencia comercial incluida
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 bg-secondary/60 text-foreground border border-border font-semibold">
            <CalendarClock className="w-3.5 h-3.5 text-primary" /> 2 nuevos cada semana · próximo {nextKitLabel()}
          </span>
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
          <div className="font-display font-semibold text-base mb-1">Los primeros kits se están cocinando</div>
          <div className="text-sm text-muted-foreground max-w-md mx-auto">Mientras tanto, mira los negocios de hoy en tu Dashboard o explora las Ofertas ganadoras.</div>
          <button onClick={() => onNavigate?.("Ofertas")} className="btn-primary-nova px-4 py-2 rounded-lg text-[13px] mt-5">Explorar ofertas</button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {kits.map((k) => <KitCard key={k.id} kit={k} busy={unlocking === k.id} onUnlock={() => unlock(k)} onOpen={() => setOpen(k)} />)}
        </div>
      )}

      {/* Apps que nuestro radar ve escalar: material nuevo entre un kit y el siguiente */}
      {apps && apps.length > 0 && (
        <section className="pt-4 space-y-4">
          <div className="flex items-end justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-display text-lg text-foreground">Apps que están escalando ahora</h3>
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

      {open && <KitModal kit={open} onClose={() => setOpen(null)} onUnlock={() => unlock(open)} busy={unlocking === open.id} />}
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
      {creating && <MiniAppModal ad={offerToDemoAd(creating)} onClose={() => setCreating(null)} />}
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

function KitCard({ kit, busy, onUnlock, onOpen }: { kit: Kit; busy: boolean; onUnlock: () => void; onOpen: () => void }) {
  const group = kit.market_group ? MARKET_GROUP[kit.market_group] : null;
  const p = kit.proof ?? {};
  return (
    <article className="card-surface rounded-2xl overflow-hidden flex flex-col ad-card-hover">
      <div className="h-36 bg-gradient-to-br from-primary/20 via-secondary/40 to-background flex items-center justify-center relative">
        <span className="text-6xl drop-shadow">{kit.cover_emoji || "🧩"}</span>
        <div className="absolute top-2 left-2 flex gap-1.5 flex-wrap pr-16">
          {isNewKit(kit.published_at) && <span className="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-1 bg-primary text-primary-foreground">Nuevo</span>}
          {kit.niche && <span className="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-1 bg-background/80 backdrop-blur text-foreground border border-border">{NICHE_LABEL[kit.niche] ?? kit.niche}</span>}
          {group && <span className="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-1 bg-background/80 backdrop-blur text-foreground border border-border">{group.flag} {group.label.replace("Mercado ", "")}</span>}
        </div>
        <span className={`absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-1 ${kit.unlocked ? "bg-success/20 text-success" : "bg-background/80 text-muted-foreground border border-border"}`}>
          {kit.unlocked ? "Desbloqueado" : `${kit.price_credits} ⚡`}
        </span>
      </div>
      <div className="p-4 flex flex-col flex-1">
        <h4 className="font-display font-semibold text-[16px] leading-snug text-foreground">{kit.title}</h4>
        {kit.tagline && <p className="text-[12px] text-primary mt-1">{kit.tagline}</p>}
        {kit.summary && <p className="text-[12.5px] text-muted-foreground mt-3 leading-relaxed line-clamp-4">{kit.summary}</p>}

        {kit.whats_inside.length > 0 && (
          <ul className="mt-3 space-y-1">
            {kit.whats_inside.slice(0, 4).map((w, i) => (
              <li key={i} className="text-[11.5px] text-foreground/85 flex items-start gap-1.5"><Check className="w-3 h-3 text-success mt-0.5 shrink-0" /> {w}</li>
            ))}
            {kit.whats_inside.length > 4 && <li className="text-[11px] text-muted-foreground pl-4">+{kit.whats_inside.length - 4} entregables más</li>}
          </ul>
        )}

        <div className="mt-4 pt-3 border-t border-border/60 text-[11px] text-muted-foreground flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1 text-primary font-semibold"><Flame className="w-3 h-3" /> {p.days_active ?? "—"} días pagando anuncios</span>
          <span>{p.active_ads ?? "—"} anuncios activos</span>
          {p.market && <span>Se anuncia en {flagFor(p.market)} {MARKET_NAME[p.market] ?? p.market}</span>}
        </div>

        <div className="mt-3">
          {kit.unlocked ? (
            <button onClick={onOpen} className="w-full btn-primary-nova py-2.5 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-1.5">
              <Unlock className="w-3.5 h-3.5" /> Abrir mi kit
            </button>
          ) : (
            <button onClick={onUnlock} disabled={busy} className="w-full btn-primary-nova py-2.5 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-1.5">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />} Desbloquear · {kit.price_credits} ⚡
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function KitModal({ kit, onClose, onUnlock, busy }: { kit: Kit; onClose: () => void; onUnlock: () => void; busy: boolean }) {
  const { create } = useProjects();
  const [content, setContent] = useState<KitContent | null>(null);
  const [section, setSection] = useState<Section>("blueprint");
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!kit.unlocked) return;
    supabase.rpc("get_kit_content", { p_kit_id: kit.id }).then(({ data }) => setContent((data ?? {}) as KitContent));
  }, [kit.id, kit.unlocked]);

  const sectionText = (): string => {
    if (!content) return "";
    switch (section) {
      case "blueprint": return content.blueprint ?? "";
      case "miniapp": return content.miniapp_prompt ?? "";
      case "whatsapp": return content.whatsapp_script ?? "";
      case "vsl": return content.vsl_script ?? "";
      case "landing": return content.landing_copy ?? "";
      case "ads": return (content.ad_copies ?? []).map((a, i) => `### Anuncio ${i + 1} — ${a.headline}\n\n${a.primary_text}`).join("\n\n");
      case "hooks": return (content.hooks ?? []).map((h, i) => `${i + 1}. ${h}`).join("\n");
      case "pricing": {
        const pr = content.pricing ?? {};
        const rows = Object.entries(pr).filter(([k]) => !["modelo", "nota"].includes(k)).map(([k, v]) => `- **${MARKET_NAME[k] ?? k}**: ${v}`).join("\n");
        return `**Modelo sugerido:** ${pr.modelo ?? "—"}\n\n${rows}\n\n_${pr.nota ?? ""}_`;
      }
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(sectionText());
    setCopied(true); setTimeout(() => setCopied(false), 1500);
    toast.success("Copiado al portapapeles");
  };

  const saveToBrain = () => {
    if (!content || saved) return;
    create({ name: `Mini App · ${kit.title}`, mode: "crear", context: { kit: { id: kit.id, title: kit.title, tagline: kit.tagline }, blueprint: content.blueprint, miniapp: content.miniapp_prompt, salesScript: content.whatsapp_script, vsl: content.vsl_script } });
    setSaved(true);
    toast.success("Guardado en Lo que creaste");
  };

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
          <div className="p-8 text-center space-y-4">
            <Lock className="w-8 h-8 text-primary mx-auto" />
            <p className="text-sm text-muted-foreground max-w-md mx-auto">{kit.summary}</p>
            <p className="font-display font-semibold text-base text-foreground">Todo incluido · {kit.price_credits} créditos, una sola vez</p>
            <ul className="text-left max-w-sm mx-auto space-y-1">
              {kit.whats_inside.map((w, i) => <li key={i} className="text-[12px] text-foreground/85 flex items-start gap-1.5"><Check className="w-3 h-3 text-success mt-0.5 shrink-0" /> {w}</li>)}
            </ul>
            <button onClick={onUnlock} disabled={busy} className="btn-primary-nova px-6 py-2.5 rounded-lg text-[13px] font-semibold inline-flex items-center gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Desbloquear mi kit · {kit.price_credits} créditos
            </button>
          </div>
        ) : (
          <>
            {/* En móvil las 8 secciones van en una sola fila deslizable: envueltas en 3 líneas se comían media pantalla. */}
            <div className="px-5 pt-3 flex flex-nowrap sm:flex-wrap gap-1.5 border-b border-border pb-3 overflow-x-auto sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {SECTIONS.map((s) => (
                <button key={s.k} onClick={() => setSection(s.k)}
                  className={`px-3 py-1.5 rounded-full text-[11.5px] font-semibold border transition-colors shrink-0 whitespace-nowrap ${
                    section === s.k ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/40 text-muted-foreground border-border hover:text-foreground"}`}>
                  {s.l}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-auto px-5 py-4">
              {content === null ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Cargando tu kit…</div>
              ) : (
                <article className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown>{sectionText() || "_Sección vacía_"}</ReactMarkdown>
                </article>
              )}
            </div>
            <div className="px-5 py-3 border-t border-border flex items-center gap-2 flex-wrap">
              <button onClick={copy} disabled={!content} className="flex-1 sm:flex-none justify-center px-3 sm:px-4 py-2 rounded-lg border border-border text-[12px] text-foreground hover:border-primary/40 inline-flex items-center gap-1.5">
                {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />} Copiar esta sección
              </button>
              <button onClick={saveToBrain} disabled={!content || saved} className="flex-1 sm:flex-none justify-center px-3 sm:px-4 py-2 rounded-lg border border-border text-[12px] text-foreground hover:border-primary/40 inline-flex items-center gap-1.5 disabled:opacity-60">
                <Save className="w-3.5 h-3.5" /> {saved ? "Guardado en Lo que creaste" : "Guardar en Lo que creaste"}
              </button>
              <span className="w-full sm:w-auto sm:ml-auto text-[11px] text-muted-foreground">
                Fuente real: {kit.proof?.source_product ?? "oferta ganadora"} · {kit.proof?.days_active ?? "—"} días pagando anuncios
              </span>
            </div>
          </>
        )}
      </div>
    </div>
    </ModalPortal>
  );
}
