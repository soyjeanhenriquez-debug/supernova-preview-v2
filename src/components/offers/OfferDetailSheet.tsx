import { useEffect, useRef, useState } from "react";
import {
  X, Flame, CalendarDays, Trophy, Copy, Check, ExternalLink, ShoppingCart, Radar, Heart, Zap, Loader2,
  Target, Tag as TagIcon, Globe2, Users, CreditCard, Route, Layers, Languages, Flag, ThumbsUp, AlertTriangle,
  MapPin, Lightbulb, BadgeDollarSign, Sparkles, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { ModalPortal } from "@/components/ModalPortal";
import { AdMediaPreview } from "@/components/AdMediaPreview";
import { CREDIT_COSTS } from "@/hooks/useCredits";
import { buildAdsLibraryPageUrl, type AdMarket } from "@/lib/demo-winning-ads";
import {
  type Offer, NICHE_LABEL, OFFER_TYPE_LABEL, MODEL_LABEL, MARKET_NAME, flagFor, copyLabel, scaleLabel, winnerPct,
} from "@/lib/offers";
import {
  type OfferIntel, type OfferVerdict, FUNNEL_LABEL, loadOfferIntel, safeExternalUrl, reportOffer, verdictToText,
} from "@/lib/offerIntel";

/**
 * Ficha de una oferta. Pensada primero para el teléfono: hoja que sube desde
 * abajo y ocupa casi toda la pantalla, pestañas arriba, contenido con scroll
 * propio y la acción principal SIEMPRE visible abajo (zona del pulgar). En
 * escritorio la misma pieza se centra como un modal.
 *
 *  · Oferta    → los hechos: métricas, ficha, a dónde lleva y dónde cobra.
 *  · Veredicto → qué hacer con ella: copiarla o no, qué copiar, qué cambiar,
 *                cómo adaptarla a LATAM, países y precio para probar.
 */
type TabKey = "oferta" | "veredicto";
type Phase = "loading" | "generating" | "ready" | "error";

interface Props {
  offer: Offer;
  following: boolean;
  onToggleFollow: () => void;
  onCreate: () => void;
  onSeeAds: () => void;
  onClose: () => void;
}

export function OfferDetailSheet({ offer: o, following, onToggleFollow, onCreate, onSeeAds, onClose }: Props) {
  const [tab, setTab] = useState<TabKey>("oferta");
  const [intel, setIntel] = useState<OfferIntel | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setPhase("loading"); setError(null); setIntel(null);
    loadOfferIntel(o.id, { signal: ctrl.signal, onGenerating: () => setPhase("generating") }).then((r) => {
      if (ctrl.signal.aborted) return;
      setIntel(r.intel);
      setError(r.error ?? null);
      setPhase(r.error && !r.intel ? "error" : "ready");
    });
    return () => ctrl.abort();
  }, [o.id, attempt]);

  // Cada pestaña empieza arriba.
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); }, [tab]);

  const name = o.product_name || o.sample_title || o.page_name || "Oferta";
  const verdict = intel?.verdict ?? null;

  return (
    <ModalPortal onClose={onClose}>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
        <div
          role="dialog" aria-modal="true" aria-label={name}
          onClick={(e) => e.stopPropagation()}
          className="bg-card border border-border w-full sm:max-w-3xl h-[94vh] supports-[height:100dvh]:h-[94dvh] sm:h-auto sm:max-h-[90vh] rounded-t-3xl sm:rounded-2xl flex flex-col overflow-hidden shadow-2xl"
        >
          {/* Asa: en móvil deja claro que es una hoja que se puede cerrar */}
          <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0" aria-hidden><span className="w-10 h-1 rounded-full bg-border" /></div>

          <header className="px-4 sm:px-6 pt-2 sm:pt-5 pb-3 flex items-start gap-3 shrink-0">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                <span>{flagFor(o.market)} {MARKET_NAME[o.market] ?? o.market}</span>
                <span className="text-border">•</span>
                <span>🔥 {scaleLabel(o)}</span>
              </div>
              <h3 className="font-display font-semibold text-[19px] sm:text-xl leading-snug text-foreground mt-1 line-clamp-2">{name}</h3>
              {o.page_name && <p className="text-[12px] text-muted-foreground truncate mt-0.5">{o.page_name}</p>}
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="shrink-0 -mr-1 w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary">
              <X className="w-5 h-5" />
            </button>
          </header>

          {/* Pestañas segmentadas: dos opciones, dedo gordo, sin scroll */}
          <div className="px-4 sm:px-6 pb-3 shrink-0">
            <div role="tablist" className="grid grid-cols-2 p-1 rounded-xl bg-secondary/60 border border-border">
              <TabButton active={tab === "oferta"} onClick={() => setTab("oferta")}>Oferta</TabButton>
              <TabButton active={tab === "veredicto"} onClick={() => setTab("veredicto")}>
                <Sparkles className="w-3.5 h-3.5" /> Veredicto
                {verdict && <span className="ml-1 text-[10px] font-bold rounded-full px-1.5 py-0.5 bg-primary/20 text-primary tabular-nums">{verdict.score}/10</span>}
              </TabButton>
            </div>
          </div>

          <div ref={bodyRef} className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 pb-5">
            {tab === "oferta"
              ? <OfferFacts o={o} name={name} intel={intel} phase={phase} onSeeAds={onSeeAds} onVerdict={() => setTab("veredicto")} />
              : <VerdictView name={name} verdict={verdict} phase={phase} error={error} onRetry={() => setAttempt((n) => n + 1)} onCreate={onCreate} />}
          </div>

          {/* Acción principal fija abajo: siempre a un toque, sin importar cuánto se haya leído */}
          <footer className="shrink-0 border-t border-border bg-card/95 backdrop-blur px-4 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center gap-2">
            <button onClick={onToggleFollow}
              aria-label={following ? "Dejar de seguir" : "Seguir esta oferta"}
              title={following ? "Dejar de seguir" : `Seguir en el Cazador de ROI · ${CREDIT_COSTS.follow_offer} ⚡`}
              className={`shrink-0 w-12 h-12 rounded-xl border flex items-center justify-center transition-colors ${following ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-primary hover:border-primary/40"}`}>
              <Heart className="w-5 h-5" fill={following ? "currentColor" : "none"} />
            </button>
            <button onClick={onCreate} className="flex-1 h-12 btn-primary-nova rounded-xl text-[14px] font-semibold flex items-center justify-center gap-2">
              <Zap className="w-4 h-4" /> Crear mi versión <span className="opacity-70 font-medium">· {CREDIT_COSTS.gen_master_prompt} ⚡</span>
            </button>
          </footer>
        </div>
      </div>
    </ModalPortal>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button role="tab" aria-selected={active} onClick={onClick}
      className={`h-10 rounded-lg text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${active ? "bg-card text-foreground shadow-sm border border-border" : "text-muted-foreground hover:text-foreground"}`}>
      {children}
    </button>
  );
}

/* ─────────────────────────────── Pestaña: Oferta ─────────────────────────────── */

function OfferFacts({ o, name, intel, phase, onSeeAds, onVerdict }: {
  o: Offer; name: string; intel: OfferIntel | null; phase: Phase; onSeeAds: () => void; onVerdict: () => void;
}) {
  const copy = copyLabel(o.copy_score);
  const market = (["BR", "US", "ES", "MX", "RU"].includes(o.market) ? o.market : "LATAM") as AdMarket;
  const metaUrl = buildAdsLibraryPageUrl(o.page_id, market);
  const landing = safeExternalUrl(intel?.landing_url);
  const checkout = safeExternalUrl(intel?.checkout_url);
  const working = phase === "loading" || phase === "generating";
  const price = intel?.price_text || o.price_hint;
  const otherMarkets = (o.markets ?? []).filter((m) => m !== o.market);
  const [reported, setReported] = useState(false);

  const report = async () => {
    const ok = await reportOffer(o.id, "inactive");
    if (ok) { setReported(true); toast.success("Gracias: la revisamos y, si está apagada, sale del catálogo."); }
    else toast.error("No se pudo enviar el reporte. Intenta de nuevo.");
  };

  return (
    <div className="space-y-4">
      <div className="relative aspect-video rounded-2xl overflow-hidden bg-secondary/40 border border-border">
        <AdMediaPreview fill fit="contain" adUrl={o.sample_ad_url ?? undefined} pageId={o.page_id} pageName={o.page_name ?? name} title={name} />
      </div>

      {/* Lo primero que se mira: ¿cuánto dinero hay detrás y puedo copiarlo? */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Kpi icon={<Flame className="w-3.5 h-3.5" />} label="Anuncios activos" value={o.active_ads.toLocaleString("es")} hint="corriendo a la vez" />
        <Kpi icon={<CalendarDays className="w-3.5 h-3.5" />} label="Días pagando" value={o.days_active.toLocaleString("es")} hint="sin apagar la campaña" />
        <Kpi icon={<Trophy className="w-3.5 h-3.5" />} label="Índice ganador" value={`${winnerPct(o)}%`} hint="dinero + copiabilidad" accent />
        <Kpi icon={<Target className="w-3.5 h-3.5" />} label="Para ti" value={copy.label} hint={o.copy_score ? `${o.copy_score}/5 de copiabilidad` : "sin evaluar"} small />
      </div>

      {/* A dónde lleva y dónde cobra: lo que un principiante necesita ver con sus ojos */}
      <section className="rounded-2xl border border-border bg-secondary/20 p-3 sm:p-4 space-y-2">
        <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground px-1">Mírala funcionando</h4>
        {working ? (
          <div className="flex items-center gap-2.5 text-[13px] text-muted-foreground px-1 py-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" /> Buscando su página de ventas y su checkout…
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            <LinkButton href={landing} icon={<ExternalLink className="w-4 h-4" />} label="Ver página de ventas" sub={intel?.landing_domain ?? "no la encontramos"} primary />
            <LinkButton href={checkout} icon={<ShoppingCart className="w-4 h-4" />} label="Ver checkout" sub={intel?.checkout_platform ? `cobra con ${intel.checkout_platform}` : "no detectado"} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <LinkButton href={metaUrl} icon={<Globe2 className="w-4 h-4" />} label="Anuncios en Meta" sub="biblioteca oficial" compact />
          <button onClick={onSeeAds} className="rounded-xl border border-border bg-card hover:border-primary/40 px-3 py-2.5 text-left flex items-center gap-2.5 min-w-0">
            <Radar className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="min-w-0"><span className="block text-[12.5px] font-semibold text-foreground truncate">Ver en el Radar</span><span className="block text-[10.5px] text-muted-foreground truncate">todos sus anuncios</span></span>
          </button>
        </div>
      </section>

      {/* Ficha */}
      <section className="grid sm:grid-cols-2 gap-2">
        <Fact icon={<TagIcon className="w-4 h-4" />} label="Nicho" value={o.niche ? (NICHE_LABEL[o.niche] ?? o.niche) : null} />
        <Fact icon={<BadgeDollarSign className="w-4 h-4" />} label="Ticket (precio del producto)" value={price} loading={working && !price} highlight />
        <Fact icon={<Layers className="w-4 h-4" />} label="Tipo de producto" value={o.offer_type ? (OFFER_TYPE_LABEL[o.offer_type] ?? o.offer_type) : null} />
        <Fact icon={<CreditCard className="w-4 h-4" />} label="Modelo de cobro" value={o.business_model && o.business_model !== "otro" ? MODEL_LABEL[o.business_model] : null} />
        <Fact icon={<Route className="w-4 h-4" />} label="Tipo de embudo" value={intel?.funnel_type ? (FUNNEL_LABEL[intel.funnel_type] ?? intel.funnel_type) : null} loading={working} />
        <Fact icon={<ShoppingCart className="w-4 h-4" />} label="Checkout" value={intel?.checkout_platform ?? null} loading={working} />
        <Fact icon={<Flag className="w-4 h-4" />} label="Países donde anuncia"
          value={[o.market, ...otherMarkets].slice(0, 6).map((m) => `${flagFor(m)} ${MARKET_NAME[m] ?? m}`).join(" · ")} />
        <Fact icon={<Languages className="w-4 h-4" />} label="Idioma" value={o.language ? o.language.toUpperCase() : null} />
        <div className="sm:col-span-2"><Fact icon={<Users className="w-4 h-4" />} label="Público objetivo" value={o.target_audience} multiline /></div>
      </section>

      {(o.mechanism || o.why_wins) && (
        <section className="space-y-2">
          {o.mechanism && <TextBlock title="Qué vende y cómo" text={o.mechanism} />}
          {o.why_wins && <TextBlock title="Por qué convierte" text={o.why_wins} />}
        </section>
      )}

      {/* Puente al veredicto: la ficha dice qué es; el veredicto dice qué hacer */}
      <button onClick={onVerdict} className="w-full rounded-2xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors p-4 text-left flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0"><Sparkles className="w-5 h-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold text-foreground">¿La copiarías? Mira el veredicto</span>
          <span className="block text-[11.5px] text-muted-foreground">Qué copiar, qué cambiar, en qué países y a qué precio probarla.</span>
        </span>
        <span className="text-primary text-lg" aria-hidden>›</span>
      </button>

      <div className="pt-1 text-center">
        <button onClick={report} disabled={reported} className="text-[11.5px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 disabled:opacity-60 py-2">
          <Flag className="w-3.5 h-3.5" /> {reported ? "Reporte enviado" : "Reportar oferta inactiva"}
        </button>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, hint, accent, small }: { icon: React.ReactNode; label: string; value: string; hint?: string; accent?: boolean; small?: boolean }) {
  return (
    <div className={`rounded-2xl border px-3 py-3 ${accent ? "border-success/30 bg-success/5" : "border-border bg-secondary/30"}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{icon}{label}</div>
      <div className={`font-display font-bold text-foreground tabular-nums leading-tight mt-1.5 ${small ? "text-[15px]" : "text-[26px]"} ${accent ? "text-success" : ""}`}>{value}</div>
      {hint && <div className="text-[10.5px] text-muted-foreground mt-0.5 truncate">{hint}</div>}
    </div>
  );
}

function Fact({ icon, label, value, loading, highlight, multiline }: { icon: React.ReactNode; label: string; value: string | null | undefined; loading?: boolean; highlight?: boolean; multiline?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/20 px-3 py-2.5 flex items-start gap-3 min-w-0">
      <span className="w-8 h-8 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
        {loading && !value
          ? <div className="h-4 w-24 rounded bg-secondary animate-pulse mt-1.5" />
          : <div className={`text-[13.5px] mt-0.5 ${multiline ? "leading-relaxed" : "truncate"} ${value ? (highlight ? "text-primary font-semibold" : "text-foreground") : "text-muted-foreground/70"}`}>{value || "—"}</div>}
      </div>
    </div>
  );
}

function LinkButton({ href, icon, label, sub, primary, compact }: { href: string | null; icon: React.ReactNode; label: string; sub: string; primary?: boolean; compact?: boolean }) {
  const cls = `rounded-xl border px-3 ${compact ? "py-2.5" : "py-3"} flex items-center gap-2.5 min-w-0 text-left transition-colors`;
  const inner = (
    <>
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={`block ${compact ? "text-[12.5px]" : "text-[13.5px]"} font-semibold truncate`}>{label}</span>
        <span className="block text-[10.5px] opacity-75 truncate">{sub}</span>
      </span>
      {href && <ExternalLink className="w-3.5 h-3.5 opacity-60 shrink-0" />}
    </>
  );
  if (!href) return <div aria-disabled className={`${cls} border-dashed border-border text-muted-foreground/60 cursor-not-allowed`}>{inner}</div>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer"
      className={`${cls} ${primary ? "border-primary bg-primary text-primary-foreground hover:opacity-90" : "border-border bg-card text-foreground hover:border-primary/40"}`}>
      {inner}
    </a>
  );
}

function TextBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/20 px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</div>
      <p className="text-[13.5px] text-foreground/90 leading-relaxed mt-1.5">{text}</p>
    </div>
  );
}

/* ────────────────────────────── Pestaña: Veredicto ───────────────────────────── */

const DECISION: Record<OfferVerdict["would_copy"], { label: string; emoji: string; cls: string }> = {
  si: { label: "Sí, la copiaría", emoji: "✅", cls: "bg-success/15 text-success border-success/40" },
  con_cambios: { label: "La copiaría con cambios", emoji: "🛠️", cls: "bg-warning/15 text-warning border-warning/40" },
  no: { label: "No la copiaría", emoji: "⛔", cls: "bg-destructive/10 text-destructive border-destructive/30" },
};

function VerdictView({ name, verdict, phase, error, onRetry, onCreate }: {
  name: string; verdict: OfferVerdict | null; phase: Phase; error: string | null; onRetry: () => void; onCreate: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (phase === "loading" || phase === "generating") return <Generating first={phase === "generating"} />;

  if (!verdict) {
    return (
      <div className="rounded-2xl border border-border bg-secondary/20 py-12 px-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-secondary mx-auto flex items-center justify-center text-muted-foreground mb-4"><RefreshCw className="w-5 h-5" /></div>
        <div className="font-display font-semibold text-[15px] text-foreground">Todavía no hay veredicto para esta oferta</div>
        <p className="text-[13px] text-muted-foreground mt-1.5 max-w-sm mx-auto">{error ?? "No pudimos leer su página o la IA no respondió. La ficha de la pestaña Oferta sigue siendo válida."}</p>
        <button onClick={onRetry} className="btn-primary-nova px-4 py-2.5 rounded-lg text-[13px] font-semibold mt-5">Intentar de nuevo</button>
      </div>
    );
  }

  const d = DECISION[verdict.would_copy] ?? DECISION.con_cambios;
  const copyAll = async () => {
    await navigator.clipboard.writeText(verdictToText(name, verdict));
    setCopied(true); setTimeout(() => setCopied(false), 1600);
    toast.success("Veredicto copiado");
  };

  return (
    <div className="space-y-3">
      {/* Cabecera: la respuesta antes que la explicación */}
      <section className="rounded-2xl border border-border bg-secondary/20 p-4">
        <div className="flex items-center gap-4">
          <ScoreRing score={verdict.score} />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">¿La copiaría?</div>
            <span className={`inline-flex items-center gap-1.5 mt-1.5 rounded-full border px-3 py-1.5 text-[13px] font-bold ${d.cls}`}>{d.emoji} {d.label}</span>
          </div>
        </div>
        {verdict.headline && <p className="text-[14.5px] text-foreground leading-snug mt-3.5 font-medium">{verdict.headline}</p>}
      </section>

      <Section icon={<Lightbulb className="w-4 h-4" />} title="Por qué llama la atención" text={verdict.why_attention} />
      <Section icon={<ThumbsUp className="w-4 h-4" />} title="Qué está funcionando" text={verdict.whats_working} />
      <ListSection icon={<Check className="w-4 h-4" />} title="Qué copiar" items={verdict.copy_this} tone="good" />
      <ListSection icon={<AlertTriangle className="w-4 h-4" />} title="Qué cambiar" items={verdict.change_this} tone="warn" />
      <Section icon={<MapPin className="w-4 h-4" />} title="Cómo adaptarla a LATAM" text={verdict.latam_adaptation} />

      <div className="grid sm:grid-cols-2 gap-3">
        {verdict.countries_to_test.length > 0 && (
          <section className="rounded-2xl border border-border bg-secondary/20 p-4">
            <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground flex items-center gap-2"><Globe2 className="w-4 h-4" /> Países para probar</h4>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {verdict.countries_to_test.map((c, i) => (
                <span key={c} className={`text-[12px] font-semibold rounded-full px-2.5 py-1 border ${i === 0 ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-card text-foreground"}`}>
                  {flagFor(c)} {MARKET_NAME[c] ?? c}
                </span>
              ))}
            </div>
          </section>
        )}
        {verdict.suggested_ticket && (
          <section className="rounded-2xl border border-border bg-secondary/20 p-4">
            <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground flex items-center gap-2"><BadgeDollarSign className="w-4 h-4" /> Precio para probar</h4>
            <div className="font-display font-bold text-[22px] text-primary mt-1.5 leading-tight">{verdict.suggested_ticket}</div>
            {verdict.ticket_detected && <div className="text-[11.5px] text-muted-foreground mt-1">Hoy la venden a {verdict.ticket_detected}</div>}
          </section>
        )}
      </div>

      {verdict.miniapp_idea && (
        <section className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary flex items-center gap-2"><Sparkles className="w-4 h-4" /> Llévala más lejos: tu mini app</h4>
          <p className="text-[13.5px] text-foreground/90 leading-relaxed mt-2">{verdict.miniapp_idea}</p>
          <button onClick={onCreate} className="mt-3 text-[12.5px] font-semibold text-primary inline-flex items-center gap-1.5 hover:underline">
            <Zap className="w-3.5 h-3.5" /> Armar esta versión con SUPERNOVA
          </button>
        </section>
      )}

      <Section icon={<Trophy className="w-4 h-4" />} title="Conclusión" text={verdict.conclusion} strong />

      <div className="flex justify-center pt-1">
        <button onClick={copyAll} className="px-4 py-2.5 rounded-lg border border-border text-[12.5px] text-foreground hover:border-primary/40 inline-flex items-center gap-2">
          {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />} Copiar veredicto
        </button>
      </div>
      <p className="text-[10.5px] text-muted-foreground/80 text-center leading-relaxed px-4">
        Análisis generado por IA a partir de los anuncios y la página pública de la oferta. Es una guía, no una garantía de resultados.
      </p>
    </div>
  );
}

function Section({ icon, title, text, strong }: { icon: React.ReactNode; title: string; text: string; strong?: boolean }) {
  if (!text) return null;
  return (
    <section className={`rounded-2xl border p-4 ${strong ? "border-primary/30 bg-primary/5" : "border-border bg-secondary/20"}`}>
      <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground flex items-center gap-2">{icon} {title}</h4>
      <p className="text-[14px] text-foreground/90 leading-relaxed mt-2">{text}</p>
    </section>
  );
}

function ListSection({ icon, title, items, tone }: { icon: React.ReactNode; title: string; items: string[]; tone: "good" | "warn" }) {
  if (!items?.length) return null;
  return (
    <section className="rounded-2xl border border-border bg-secondary/20 p-4">
      <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground flex items-center gap-2">{icon} {title}</h4>
      <ul className="mt-2.5 space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[13.5px] text-foreground/90 leading-relaxed">
            <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold ${tone === "good" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
              {tone === "good" ? "✓" : "!"}
            </span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ScoreRing({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(10, score)) / 10;
  const r = 26, c = 2 * Math.PI * r;
  const color = score >= 8 ? "hsl(var(--success))" : score >= 5 ? "hsl(var(--warning))" : "hsl(var(--destructive))";
  return (
    <div className="relative w-[68px] h-[68px] shrink-0" role="img" aria-label={`Nota de la oportunidad: ${score} de 10`}>
      <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-display font-bold text-[22px] text-foreground tabular-nums">{score}</span>
        <span className="text-[9px] text-muted-foreground mt-0.5">de 10</span>
      </div>
    </div>
  );
}

/** Espera con sentido: qué está pasando, no un spinner mudo (la primera vez tarda ~20 s). */
function Generating({ first }: { first: boolean }) {
  const STEPS = ["Abriendo su anuncio en Meta", "Leyendo su página de ventas", "Buscando el checkout y el precio", "Escribiendo el veredicto"];
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!first) return;
    const t = window.setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 5500);
    return () => window.clearInterval(t);
  }, [first, STEPS.length]);

  if (!first) {
    return <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-2xl bg-secondary/40 animate-pulse" />)}</div>;
  }
  return (
    <div className="rounded-2xl border border-border bg-secondary/20 p-5">
      <div className="font-display font-semibold text-[15px] text-foreground">Eres la primera persona en abrir esta oferta</div>
      <p className="text-[12.5px] text-muted-foreground mt-1">La estamos analizando ahora (unos 20 segundos). Queda guardada: la próxima vez abre al instante.</p>
      <ul className="mt-4 space-y-2.5">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex items-center gap-2.5 text-[13px] ${i <= step ? "text-foreground" : "text-muted-foreground/60"}`}>
            {i < step ? <Check className="w-4 h-4 text-success shrink-0" /> : i === step ? <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" /> : <span className="w-4 h-4 rounded-full border border-border shrink-0" />}
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}
