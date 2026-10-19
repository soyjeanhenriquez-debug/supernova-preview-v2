import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, BookmarkPlus, Captions, Check, ChevronDown, Clapperboard, Copy, History, LayoutTemplate, Loader2, Play, RotateCcw, Search, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invokeErrorMessage } from "@/lib/fnAuth";
import { useProducts } from "@/contexts/ProductContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  charCount, cleanConceptos, dnaProgress, FIDELIDAD_AYUDA, modoAviso, OBJETIVOS, OFFER_STATUSES, useBrandDna, useEditorialPrefs,
  type Intensidad, type Objetivo, type OfferStatus,
} from "@/lib/brandDna";
import { CREDIT_COSTS, useCredits } from "@/hooks/useCredits";
import { ToolShell } from "@/components/tool/ToolShell";
import { ToolFeedback } from "@/components/ToolFeedback";
import { AddToTracker } from "@/components/AddToTracker";
import { Teleprompter } from "@/components/reel/Teleprompter";
import { REEL_TO_CAROUSEL_KEY } from "@/lib/carousel";
import {
  CHECK_LABEL, editingText, NIVEL_BY_ID, NIVELES, notionGuion, notionPorQue, publishText, REEL_URL_RE, speakSeconds, teleprompterLines, TIPOS,
  type Nivel, type ReelView,
} from "@/lib/reel";

/**
 * Analiza un Reel v2 (16-oct-2026, Fase 1 de la organización). Pasos con dirección propia:
 *   #/con-tu-cara/reel          → pegar el Reel y elegir cómo modelarlo
 *   #/con-tu-cara/reel/<id>     → el análisis y tu versión (se puede recargar o compartir)
 * El servidor cobra: análisis completo 25 créditos (incluye la primera versión) y cada versión
 * siguiente 5. Si algo falla, no se cobra.
 */
type Tab = "porque" | "tele" | "edicion" | "publicar";
const TABS: { id: Tab; label: string; para: string }[] = [
  { id: "porque", label: "Por qué funciona", para: "Para entender la receta antes de grabar." },
  { id: "tele", label: "Teleprompter", para: "Para grabar: solo lo que dices, frase por frase." },
  { id: "edicion", label: "Edición", para: "Para quien edita: tramos, lo que se ve y el texto en pantalla." },
  { id: "publicar", label: "Publicar", para: "Para subirlo: texto, palabra clave, hashtags y comentario fijado." },
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Hist = { id: string; shortcode: string; nivel: Nivel; stage: string; created_at: string; owner: string | null; resumen: string | null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabase as any;
const copy = (t: string, what = "Copiado") => { void navigator.clipboard?.writeText(t).then(() => toast.success(what)); };
const withoutBilling = (d: Record<string, unknown>) => { const r = { ...d }; delete r.billing; return r as unknown as ReelView; };
const fmt = (n: number | null | undefined) => (typeof n === "number" ? n.toLocaleString("es-ES") : "—");

export function AnalizaReel({ route, go, onUpload, onHome, onNavigate }: {
  route: string[];
  go: (segs: string[], replace?: boolean) => void;
  onUpload: () => void;
  onHome: () => void;
  onNavigate: (page: string) => void;
}) {
  const { products, activeId } = useProducts();
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const { dna, loaded: dnaLoaded } = useBrandDna();
  const prefs = useEditorialPrefs();
  const { applyServerCharge } = useCredits();
  const routeId = route[0] && UUID.test(route[0]) ? route[0] : null;

  const [url, setUrl] = useState("");
  // ESPEJO es el modo por defecto (Jean, 19-oct-2026).
  const [nivel, setNivel] = useState<Nivel>("espejo");
  const [opts, setOpts] = useState({ palabra_clave: "" });
  const [objetivo, setObjetivo] = useState<Objetivo>("atraer");
  const [intensidad, setIntensidad] = useState<Intensidad>("equilibrada");
  const [offerId, setOfferId] = useState<string>("");
  const [waitlistOk, setWaitlistOk] = useState(false);
  const [conceptos, setConceptos] = useState<string[]>([]);
  const [conceptosTocados, setConceptosTocados] = useState(false);
  const [nuevoConcepto, setNuevoConcepto] = useState("");
  const [toque, setToque] = useState("");
  /** El toque personal y las palabras son de UN Reel: al cambiar de Reel no se arrastran (19-oct-2026). */
  const resetPersonal = () => { setToque(""); setConceptos([]); setConceptosTocados(false); setNuevoConcepto(""); setOpts({ palabra_clave: "" }); setWaitlistOk(false); };
  const [view, setView] = useState<ReelView | null>(null);
  const [loadingView, setLoadingView] = useState(false);
  const [busy, setBusy] = useState<null | "base" | "version">(null);
  const [elapsed, setElapsed] = useState(0);
  const [tab, setTab] = useState<Tab>("tele");
  const [hook, setHook] = useState(0);
  const [teleOpen, setTeleOpen] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const [hist, setHist] = useState<Hist[]>([]);

  const loadHistory = useCallback(async () => {
    // Solo los análisis propios: a un admin la base le deja leer los de todas las cuentas (19-oct-2026).
    if (!uid) return;
    const { data } = await db().from("reel_analyses")
      .select("id, shortcode, nivel, stage, created_at, owner:result->source->>owner, resumen:result->por_que_funciona->>resumen")
      .eq("kind", "guion").eq("user_id", uid).order("created_at", { ascending: false }).limit(12);
    setHist(((data ?? []) as Hist[]).filter(h => h.resumen));
  }, [uid]);
  useEffect(() => { void loadHistory(); }, [loadHistory]);

  // Abrir un análisis desde su dirección (recargar, Atrás, historial): se lee de la base, sin costo.
  useEffect(() => {
    if (!routeId) { if (!busy) setView(null); return; }
    if (view?.analysis_id === routeId) return;
    let alive = true;
    setLoadingView(true);
    resetPersonal();
    db().from("reel_analyses").select("id, nivel, result").eq("id", routeId).maybeSingle()
      .then(({ data }: { data: { id: string; nivel: Nivel; result: Omit<ReelView, "analysis_id"> } | null }) => {
        if (!alive) return;
        setLoadingView(false);
        if (!data?.result?.por_que_funciona) { toast.error("No encontramos ese análisis."); go([], true); return; }
        setView({ analysis_id: data.id, ...data.result });
        setNivel(data.result.version?.nivel ?? data.nivel ?? "espejo");
        if (data.result.source?.url) setUrl(data.result.source.url);
        const o = data.result.opciones;
        if (o) {
          setOpts({ palabra_clave: o.palabra_clave ?? "" });
          if (o.objetivo === "atraer" || o.objetivo === "autoridad") setObjetivo(o.objetivo);
          if (o.offer_id) setOfferId(o.offer_id);
          if (o.toque) setToque(o.toque);
          if (o.conceptos?.length) { setConceptos(o.conceptos); setConceptosTocados(true); }
        }
        setHook(0);
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  // Reloj de la espera, para los mensajes de "qué está pasando".
  useEffect(() => {
    if (!busy) { setElapsed(0); return; }
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [busy]);

  const writeVersion = async (analysisId: string) => {
    setBusy("version");
    try {
      const { data, error } = await supabase.functions.invoke("reel-analyze", {
        // Solo elecciones: el ADN, las preferencias y la oferta los lee el servidor de la base.
        body: { step: "version", analysis_id: analysisId, nivel, objetivo, offer_id: nivel === "adaptacion" ? offerId || null : null,
          waitlist_ok: waitlistOk, conceptos, toque, intensidad, palabra_clave: opts.palabra_clave },
      });
      if (error || !data?.version) throw new Error(error ? await invokeErrorMessage(error, "No se pudo escribir tu versión. No se te cobró.") : (data?.error || "No se pudo escribir tu versión. No se te cobró."));
      if (data.billing?.charged) applyServerCharge("reel_level", data.billing, "Otra versión de un Reel");
      setView(withoutBilling(data));
      setHook(0);
      setTab("tele");
      if (data.analysis_id !== routeId) go([data.analysis_id]);
      toast.success("Tu versión está lista", { description: "Grábala con el teleprompter." });
      void loadHistory();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo escribir tu versión.");
    } finally { setBusy(null); }
  };

  const analyze = async () => {
    if (busy) return;
    if (!REEL_URL_RE.test(url.trim())) { toast.error("Pega el enlace de un Reel de Instagram (instagram.com/reel/…)."); return; }
    setBusy("base");
    setView(null);
    try {
      const { data, error } = await supabase.functions.invoke("reel-analyze", { body: { step: "base", url: url.trim(), nivel } });
      if (error || !data?.analysis_id) throw new Error(error ? await invokeErrorMessage(error, "No se pudo analizar el Reel. No se te cobró.") : (data?.error || "No se pudo analizar el Reel. No se te cobró."));
      if (data.billing) applyServerCharge("reel_analyze", data.billing, "Analizar un Reel");
      setView(withoutBilling(data));
      setTab("porque");
      go([data.analysis_id]);
      await writeVersion(data.analysis_id);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo analizar el Reel.");
      setBusy(null);
    }
  };

  const startOver = () => { setView(null); setUrl(""); setRecorded(false); resetPersonal(); go([]); };
  // Reel → Carrusel (17-oct-2026): Carrusel abre "Modelar uno que ya funciona" con este Reel puesto.
  const toCarousel = () => {
    if (!view?.source?.url) return;
    try { localStorage.setItem(REEL_TO_CAROUSEL_KEY, JSON.stringify({ url: view.source.url, at: Date.now() })); } catch { /* sin almacenamiento */ }
    onNavigate("Carrusel");
  };
  const v = view?.version;
  const lines = useMemo(() => (v ? teleprompterLines(v, hook) : []), [v, hook]);
  const validUrl = REEL_URL_RE.test(url.trim());
  const step = v ? (recorded ? 3 : 2) : view || busy ? 2 : validUrl ? 1 : 0;
  const o = view?.opciones;
  const sameAsShown = v && v.nivel === nivel && (o?.palabra_clave ?? "") === opts.palabra_clave.toUpperCase() && (o?.toque ?? "") === toque
    && (o?.objetivo ?? "atraer") === (nivel === "adaptacion" ? "vender" : objetivo) && (o?.offer_id ?? "") === (nivel === "adaptacion" ? offerId : "")
    && JSON.stringify(o?.conceptos ?? []) === JSON.stringify(conceptos);
  // Palabras orientadoras (A7): salen del análisis de la referencia; en Reinventar, de sus mecanismos.
  const pq = view?.por_que_funciona;
  useEffect(() => {
    if (conceptosTocados || !pq) return;
    setConceptos(cleanConceptos(nivel === "inspiracion" ? pq.mecanismos ?? [] : pq.conceptos ?? []));
  }, [pq, nivel, conceptosTocados]);
  // VENDER: la oferta elegida (por defecto, el producto activo). Solo se listan ofertas activas.
  const offers = products.filter(p => p.status === "activo");
  useEffect(() => { if (!offerId && activeId) setOfferId(activeId); }, [activeId, offerId]);
  const offer = nivel === "adaptacion" ? offers.find(p => p.id === offerId) ?? null : null;
  const offerStatus = (offer?.offer_status ?? "borrador") as OfferStatus;
  const aviso = modoAviso(nivel, offer ? { offer_status: offerStatus, name: offer.name } : null, waitlistOk);
  const adn = dnaProgress(dna);
  const saveToque = async () => {
    const err = await prefs.add(toque);
    if (err) toast.error(err); else toast.success("Guardado como preferencia", { description: "Se aplica a todo lo que modelas. Lo ves en Tu ADN." });
  };

  const action = !view
    ? { label: `Analizar y escribir mi versión · ${CREDIT_COSTS.reel_analyze} créditos`, run: analyze, disabled: !validUrl }
    : !v
      ? { label: "Escribir mi versión · incluida", run: () => writeVersion(view.analysis_id), disabled: false }
      : { label: `${sameAsShown ? "Otra versión" : "Probar"} con ${NIVEL_BY_ID[nivel].nombre} · ${CREDIT_COSTS.reel_level} créditos`, run: () => writeVersion(view.analysis_id), disabled: false };

  const aside = (
    <>
      <div className="card-surface rounded-2xl p-4 space-y-2">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">1 · Pega el Reel</p>
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.instagram.com/reel/…" inputMode="url" disabled={!!view || !!busy}
          className="w-full min-h-[44px] rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:border-primary/60 disabled:opacity-70" />
        {view ? (
          <button type="button" onClick={startOver} className="inline-flex items-center gap-1.5 text-[12px] text-primary hover:underline"><RotateCcw className="w-3.5 h-3.5" /> Analizar otro Reel</button>
        ) : (
          <p className="text-[12px] text-muted-foreground">{url && !validUrl ? "Ese enlace no es de un Reel de Instagram." : "De una cuenta pública y de hasta 90 segundos."}</p>
        )}
      </div>

      <div className="card-surface rounded-2xl p-4 space-y-2">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">2 · ¿Cómo quieres transformarlo?</p>
        <div role="radiogroup" aria-label="Modo de modelado" className="grid grid-cols-2 gap-2">
          {NIVELES.map(n => (
            <button key={n.id} type="button" role="radio" aria-checked={nivel === n.id} onClick={() => setNivel(n.id)} title={n.quiere} disabled={!!busy}
              className={`min-h-[76px] text-left rounded-xl border p-3 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${nivel === n.id ? "border-primary/60 bg-primary/10" : "border-border hover:bg-secondary/40"}`}>
              <span className="flex items-baseline justify-between gap-1">
                <span className="text-sm font-semibold text-foreground">{n.nombre}</span>
                {n.pct && <span className="text-[11px] tabular-nums text-muted-foreground">{n.pct}</span>}
              </span>
              <span className="mt-1 block text-[12px] leading-snug text-muted-foreground">{n.line}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">{FIDELIDAD_AYUDA}</p>
        {aviso && <p role="note" className="text-[12px] text-foreground"><AlertTriangle className="inline w-3.5 h-3.5 mr-1 text-primary" />{aviso}</p>}
        {dnaLoaded && !adn.ready && (
          <p className="text-[12px] text-muted-foreground">Para que suene a ti, <button type="button" onClick={() => onNavigate("Tu ADN")} className="text-primary hover:underline">completa tu ADN</button> (unos minutos). Sin él, igual funciona.</p>
        )}

        {view && (
          <div className="space-y-2 rounded-xl border border-border p-3">
            <p className="text-[13px] font-semibold text-foreground">Dale tu toque personal <span className="font-normal text-muted-foreground">(opcional)</span></p>
            <div className="flex flex-wrap gap-1.5" aria-label="Palabras orientadoras">
              {conceptos.map((c, i) => (
                <span key={`${c}-${i}`} className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/40 pl-2.5 pr-1 py-1 text-[12px] text-foreground">
                  {c}
                  <button type="button" aria-label={`Quitar ${c}`} onClick={() => { setConceptos(cs => cs.filter((_, j) => j !== i)); setConceptosTocados(true); }}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                </span>
              ))}
              {conceptos.length < 3 && (
                <form onSubmit={e => { e.preventDefault(); const c = cleanConceptos([...conceptos, nuevoConcepto]); setConceptos(c); setNuevoConcepto(""); setConceptosTocados(true); }} className="inline-flex">
                  <input value={nuevoConcepto} onChange={e => setNuevoConcepto(e.target.value)} placeholder="+ palabra" aria-label="Agregar palabra orientadora"
                    className="w-28 min-h-[32px] rounded-full border border-dashed border-border bg-background px-3 text-[12px] text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60" />
                </form>
              )}
            </div>
            <label className="block text-[12px] text-muted-foreground">¿Qué quieres destacar o cambiar?
              <textarea value={toque} onChange={e => setToque(e.target.value)} rows={2} placeholder="Ej.: que suene más cercano y con un ejemplo de RD"
                className={`mt-1 w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${charCount(toque) > 200 ? "border-destructive" : "border-border"}`} />
            </label>
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <button type="button" onClick={saveToque} disabled={charCount(toque.trim()) < 3 || charCount(toque) > 200}
                className="inline-flex min-h-[32px] items-center gap-1 text-primary hover:underline disabled:opacity-40 disabled:no-underline"><BookmarkPlus className="w-3.5 h-3.5" /> Guardar como preferencia</button>
              <span className={`tabular-nums ${charCount(toque) > 200 ? "text-destructive" : "text-muted-foreground"}`}>{charCount(toque)}/200</span>
            </div>
          </div>
        )}

        <details className="group rounded-xl border border-border px-3 py-2">
          <summary className="flex min-h-[40px] cursor-pointer list-none items-center justify-between text-[13px] text-foreground">
            Opciones avanzadas <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2 space-y-3">
            {nivel !== "adaptacion" ? (
              <div role="radiogroup" aria-label="Objetivo" className="space-y-1">
                <p className="text-[12px] text-muted-foreground">Objetivo</p>
                {OBJETIVOS.filter(x => x.id !== "vender").map(x => (
                  <button key={x.id} type="button" role="radio" aria-checked={objetivo === x.id} onClick={() => setObjetivo(x.id)}
                    className={`w-full min-h-[44px] rounded-lg border px-3 py-2 text-left ${objetivo === x.id ? "border-primary/60 bg-primary/10" : "border-border hover:bg-secondary/40"}`}>
                    <span className="block text-[13px] font-semibold text-foreground">{x.nombre}</span>
                    <span className="block text-[11px] text-muted-foreground">{x.line}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="block text-[12px] text-muted-foreground">Oferta (opcional)
                  <select value={offerId} onChange={e => setOfferId(e.target.value)}
                    className="mt-1 w-full min-h-[44px] rounded-lg border border-border bg-background px-3 text-sm text-foreground">
                    <option value="">Sin oferta: invitar a seguir o comentar</option>
                    {offers.map(p => <option key={p.id} value={p.id}>{p.name} · {OFFER_STATUSES.find(x => x.id === (p.offer_status ?? "borrador"))?.label}</option>)}
                  </select>
                </label>
                {offer && offerStatus === "validacion" && (
                  <label className="flex items-start gap-2 text-[12px] text-foreground">
                    <input type="checkbox" checked={waitlistOk} onChange={e => setWaitlistOk(e.target.checked)} className="mt-0.5 h-4 w-4" />
                    Invitar a una lista de espera (sin pedir la compra)
                  </label>
                )}
                <button type="button" onClick={() => onNavigate("Mi negocio")} className="text-[12px] text-primary hover:underline">Editar mis ofertas</button>
              </div>
            )}
            {nivel === "recrear" && (
              <div role="radiogroup" aria-label="Intensidad de tu marca" className="space-y-1">
                <p className="text-[12px] text-muted-foreground">Cuánto de ti</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {([["sutil", "Sutil"], ["equilibrada", "Equilibrada"], ["profunda", "Profunda"]] as const).map(([id, label]) => (
                    <button key={id} type="button" role="radio" aria-checked={intensidad === id} onClick={() => setIntensidad(id)}
                      className={`min-h-[40px] rounded-lg border text-[12px] ${intensidad === id ? "border-primary/60 bg-primary/10 text-foreground" : "border-border text-muted-foreground"}`}>{label}</button>
                  ))}
                </div>
              </div>
            )}
            <label className="block text-[12px] text-muted-foreground">Palabra clave del cierre (si pide comentar)
              <input value={opts.palabra_clave} onChange={e => setOpts({ palabra_clave: e.target.value })} placeholder="GUIA" maxLength={20}
                className="mt-1 w-full min-h-[40px] rounded-lg border border-border bg-background px-3 text-sm uppercase text-foreground" />
            </label>
          </div>
        </details>
        <button type="button" onClick={action.run} disabled={!!busy || action.disabled}
          className="btn-primary-nova inline-flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-50">
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Trabajando…</> : <><Sparkles className="w-4 h-4" /> {action.label}</>}
        </button>
        <p className="text-center text-[11px] text-muted-foreground">Si algo falla, no se cobra.</p>
      </div>

      {hist.length > 0 && (
        <div className="card-surface rounded-2xl p-4 space-y-2">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground"><History className="w-3.5 h-3.5" /> Tus Reels analizados</p>
          <ul className="space-y-1">
            {hist.map(h => (
              <li key={h.id}>
                <button type="button" onClick={() => go([h.id])} disabled={!!busy}
                  className={`w-full rounded-lg px-2 py-1.5 text-left hover:bg-secondary/50 ${h.id === view?.analysis_id ? "bg-secondary/60" : ""}`}>
                  <span className="block truncate text-[13px] text-foreground">{h.owner ? `@${h.owner}` : h.shortcode} · {NIVEL_BY_ID[h.nivel]?.nombre ?? h.nivel}{h.stage !== "listo" ? " · falta tu versión" : ""}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{h.resumen}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );

  return (
    <ToolShell onNavigate={onNavigate}
      crumbs={[{ label: "Crear" }, { label: "Con tu cara", onClick: onHome }, { label: "Analiza un Reel", onClick: startOver }]}
      title="Analiza un Reel y graba tu versión"
      line="Pega un Reel que ya funciona, elige cuánto se parece tu versión y grábala con el teleprompter."
      onBack={view ? startOver : onHome} backLabel={view ? "Otro Reel" : "Volver"}
      steps={["Pega el Reel", "Elige cómo modelarlo", "Tu versión", "Grábalo"]} step={step}
      aside={aside}>
      {busy && <Waiting stage={busy} elapsed={elapsed} />}
      {!busy && loadingView && <div className="card-surface rounded-2xl p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}
      {!busy && !loadingView && !view && <HowItWorks />}

      {view && !loadingView && (
        <>
          <SourceCard view={view} />
          {v && <VersionSummary view={view} hook={hook} />}

          <div className="card-surface rounded-2xl p-4 sm:p-5 space-y-4">
            <div role="tablist" aria-label="Tu Reel" className="scroll-row flex gap-1.5">
              {TABS.map(t => (
                <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                  className={`inline-flex min-h-[40px] items-center rounded-full px-3.5 text-[13px] whitespace-nowrap ${tab === t.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <p className="text-[12px] text-muted-foreground">{TABS.find(t => t.id === tab)?.para}</p>

            {tab === "porque" && <PorQueTab view={view} />}
            {tab !== "porque" && !v && (
              <div className="rounded-xl border border-dashed border-border p-5 text-center space-y-3">
                <p className="text-sm text-muted-foreground">{busy ? "Escribiendo tu versión…" : "Tu versión todavía no está. Ya la pagaste con el análisis: escríbela sin costo."}</p>
                {!busy && <button type="button" onClick={() => writeVersion(view.analysis_id)} className="btn-primary-nova inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-sm font-semibold"><Sparkles className="w-4 h-4" /> Escribir mi versión · incluida</button>}
              </div>
            )}
            {tab === "tele" && v && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <p className="text-[12px] text-muted-foreground">Elige el gancho con el que empiezas:</p>
                  {v.ganchos.map((g, i) => (
                    <button key={g} type="button" onClick={() => setHook(i)} aria-pressed={hook === i}
                      className={`w-full rounded-xl border p-3 text-left text-sm ${hook === i ? "border-primary/60 bg-primary/10 text-foreground" : "border-border text-foreground hover:bg-secondary/40"}`}>
                      «{g}»
                    </button>
                  ))}
                </div>
                <div className="rounded-xl bg-background/60 border border-border p-4 space-y-3 max-h-[420px] overflow-y-auto">
                  {lines.map((l, i) => <p key={i} className="text-lg sm:text-xl font-semibold leading-snug text-foreground">{l}</p>)}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => { setTeleOpen(true); setRecorded(true); }} className="btn-primary-nova inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-sm font-semibold"><Play className="w-4 h-4" /> Grabar en pantalla completa</button>
                  <button type="button" onClick={() => copy(lines.join("\n\n"))} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border px-3 text-[13px] text-foreground hover:bg-secondary/60"><Copy className="w-4 h-4" /> Copiar texto</button>
                  <span className="text-[12px] text-muted-foreground">≈ {speakSeconds(lines)} s hablando</span>
                </div>
              </div>
            )}
            {tab === "edicion" && v && (
              <div className="space-y-3">
                <ol className="space-y-2">
                  {v.guion.map((t, i) => {
                    const orig = t.original != null ? view.por_que_funciona.timeline[t.original] : undefined;
                    return (
                      <li key={i} className="rounded-xl border border-border p-3 text-[13px] space-y-1">
                        <p className="tabular-nums text-muted-foreground">{t.inicio}–{t.fin} s</p>
                        {v.nivel === "espejo" && orig && <p className="text-[12px] text-muted-foreground">Original ({orig.inicio}–{orig.fin} s): {orig.descripcion}</p>}
                        <p className="text-foreground"><b className="font-medium">Se ve:</b> {t.se_ve || "—"}</p>
                        <p className="text-foreground"><b className="font-medium">Texto en pantalla:</b> {t.texto_pantalla ? `«${t.texto_pantalla}»` : "—"}</p>
                      </li>
                    );
                  })}
                </ol>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => copy(editingText(v))} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-border px-3 text-[13px] text-foreground hover:bg-secondary/60"><Copy className="w-4 h-4" /> Copiar para el editor</button>
                  <button type="button" onClick={() => copy(notionGuion(v, hook), "Guion copiado en formato Notion")} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-border px-3 text-[13px] text-foreground hover:bg-secondary/60"><Copy className="w-4 h-4" /> Copiar guion (formato Notion)</button>
                </div>
              </div>
            )}
            {tab === "publicar" && v && (
              <div className="space-y-3 text-[13px]">
                <p className="whitespace-pre-line text-foreground">{v.publicar.copy}</p>
                {v.publicar.palabra_clave && <p className="text-muted-foreground">Palabra clave: <span className="rounded-md bg-primary/15 px-2 py-0.5 font-semibold text-foreground">{v.publicar.palabra_clave}</span></p>}
                <p className="text-muted-foreground">{v.publicar.hashtags.join(" ")}</p>
                {v.publicar.comentario_fijado && <p className="text-foreground"><b className="font-medium">Comentario fijado:</b> {v.publicar.comentario_fijado}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => copy(publishText(v))} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-border px-3 text-[13px] text-foreground hover:bg-secondary/60"><Copy className="w-4 h-4" /> Copiar todo</button>
                  <AddToTracker kind="corto" title={v.ganchos[hook] ?? "Mi Reel"} keyword={v.publicar.palabra_clave} source="analiza-reel" />
                </div>
              </div>
            )}
          </div>

          {v && (
            <div className="card-surface rounded-2xl p-4 sm:p-5 space-y-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Siguiente paso</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { setTeleOpen(true); setRecorded(true); }} className="btn-primary-nova inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-sm font-semibold"><Clapperboard className="w-4 h-4" /> Grabar con el teleprompter</button>
                <button type="button" onClick={onUpload} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border px-4 text-sm text-foreground hover:bg-secondary/60"><Captions className="w-4 h-4" /> Ya lo grabé: ponerle subtítulos</button>
                <button type="button" onClick={toCarousel} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border px-4 text-sm text-foreground hover:bg-secondary/60"><LayoutTemplate className="w-4 h-4" /> Convertirlo en carrusel · {CREDIT_COSTS.reel_carousel} créditos</button>
                <button type="button" onClick={startOver} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border px-4 text-sm text-foreground hover:bg-secondary/60"><Search className="w-4 h-4" /> Analizar otro Reel</button>
              </div>
            </div>
          )}
          {v && <ToolFeedback tool="analiza-reel" refId={view.analysis_id} />}
        </>
      )}

      {teleOpen && v && <Teleprompter lines={lines} ganchos={v.ganchos} hook={hook} onHook={setHook} onClose={() => setTeleOpen(false)} />}
    </ToolShell>
  );
}

function Waiting({ stage, elapsed }: { stage: "base" | "version"; elapsed: number }) {
  const msg = stage === "version" ? "Escribiendo tu versión…" : elapsed < 8 ? "Extrayendo el Reel…" : "Analizando por qué funciona…";
  const steps = ["Extrayendo el Reel", "Analizando por qué funciona", "Escribiendo tu versión"];
  const at = stage === "version" ? 2 : elapsed < 8 ? 0 : 1;
  return (
    <div className="card-surface rounded-2xl p-6 space-y-4" aria-live="polite">
      <div className="flex items-center gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <p className="text-sm font-semibold text-foreground">{msg}</p>
        <span className="ml-auto tabular-nums text-[12px] text-muted-foreground">{elapsed} s</span>
      </div>
      <ol className="space-y-1.5 text-[13px]">
        {steps.map((s, i) => <li key={s} className={i < at ? "text-muted-foreground line-through" : i === at ? "text-foreground" : "text-muted-foreground/70"}>{i + 1}. {s}</li>)}
      </ol>
      <p className="text-[12px] text-muted-foreground">Tarda cerca de un minuto. Puedes quedarte en esta pantalla.</p>
    </div>
  );
}

function HowItWorks() {
  return (
    <div className="card-surface rounded-2xl p-5 sm:p-6 space-y-4">
      <p className="font-display text-lg font-semibold text-foreground">Así funciona</p>
      <ol className="grid gap-3 sm:grid-cols-3">
        {[
          ["Pega el enlace", "De un Reel que te guste y que ya tenga vistas: tuyo o de otra persona."],
          ["Elige cómo transformarlo", "Espejo, Recrear, Reinventar o Vender. Te decimos qué se conserva y qué es tuyo."],
          ["Grábalo con el teleprompter", "Te damos los ganchos, el guion para leer y el texto para publicar. Antes de entregarlo, revisamos que conserve el tema y que no meta nada que no toca."],
        ].map(([t, d], i) => (
          <li key={t} className="rounded-xl border border-border p-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[12px] font-semibold text-primary-foreground">{i + 1}</span>
            <p className="mt-2 text-sm font-semibold text-foreground">{t}</p>
            <p className="text-[12px] text-muted-foreground">{d}</p>
          </li>
        ))}
      </ol>
      <p className="text-[12px] text-muted-foreground">Se modela la estructura, el ritmo y el gancho; nunca la cara, el nombre, la marca ni los números de otra persona.</p>
    </div>
  );
}

function SourceCard({ view }: { view: ReelView }) {
  const s = view.source;
  const [img, setImg] = useState(true);
  return (
    <div className="card-surface rounded-2xl p-4 flex items-center gap-3">
      {s.cover && img && <img src={s.cover} alt="" referrerPolicy="no-referrer" onError={() => setImg(false)} className="h-16 w-12 shrink-0 rounded-lg object-cover" />}
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">El Reel original</p>
        <p className="truncate text-sm text-foreground">{s.owner ? `@${s.owner}` : s.shortcode}</p>
        <p className="text-[12px] text-muted-foreground">{fmt(s.views)} reproducciones · {fmt(s.likes)} me gusta{s.duracion_s ? ` · ${Math.round(s.duracion_s)} s` : ""}</p>
      </div>
      <a href={s.url} target="_blank" rel="noopener noreferrer" className="ml-auto shrink-0 text-[12px] text-primary hover:underline">Ver en Instagram</a>
    </div>
  );
}

function VersionSummary({ view }: { view: ReelView; hook: number }) {
  const v = view.version!;
  const n = NIVEL_BY_ID[v.nivel] ?? NIVEL_BY_ID.espejo;
  const r = v.revision;
  const avisos = v.que_cambio.filter(x => /^aviso:/i.test(x));
  const o = view.opciones;
  const objetivo = o?.objetivo === "autoridad" ? "Ganar autoridad" : o?.objetivo === "vender" ? "Vender" : o?.objetivo === "atraer" ? "Atraer" : "";
  return (
    <div className="card-surface rounded-2xl p-4 sm:p-5 space-y-3">
      <p className="flex flex-wrap items-center gap-2 text-sm text-foreground">
        <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[12px] font-semibold">{n.nombre}{n.pct ? ` · ${n.pct} de fidelidad creativa` : ""}</span>
        {objetivo && <span className="text-[12px] text-muted-foreground">Objetivo: {objetivo}</span>}
        {o?.offer_name && <span className="text-[12px] text-muted-foreground">Oferta: {o.offer_name}</span>}
      </p>
      <p className="text-[12px] text-muted-foreground">{n.line}</p>
      {avisos.map(a => <p key={a} role="note" className="rounded-lg border border-primary/40 bg-primary/10 p-2 text-[12px] text-foreground">{a}</p>)}
      {r ? (
        <div className="rounded-xl border border-border p-3 text-[12px] space-y-1.5">
          <p className="font-semibold text-foreground">{r.semantica ? "Revisión de calidad" : "Revisión básica (la revisión completa no alcanzó a correr)"}{r.corregida ? " · corregida una vez" : ""}</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {r.checks.map(c => (
              <li key={c.id} className="flex items-start gap-1.5" title={c.nota}>
                {c.ok ? <Check className="mt-0.5 w-3.5 h-3.5 shrink-0 text-emerald-400" aria-label="Bien" /> : <AlertTriangle className="mt-0.5 w-3.5 h-3.5 shrink-0 text-primary" aria-label="A revisar" />}
                <span className={c.ok ? "text-muted-foreground" : "text-foreground"}>{CHECK_LABEL[c.id] ?? c.id}{!c.ok && c.nota ? `: ${c.nota}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-[12px] text-muted-foreground">Versión hecha con el criterio anterior, sin la revisión de calidad nueva. Genera otra para revisarla.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 text-[13px]">
        <div><p className="font-semibold text-foreground">Lo que tomamos del original</p><ul className="mt-1 list-disc pl-4 text-muted-foreground space-y-0.5">{v.que_se_mantuvo.map(x => <li key={x}>{x}</li>)}</ul></div>
        <div><p className="font-semibold text-foreground">Lo que es tuyo</p><ul className="mt-1 list-disc pl-4 text-muted-foreground space-y-0.5">{v.que_cambio.filter(x => !/^aviso:/i.test(x)).map(x => <li key={x}>{x}</li>)}</ul></div>
      </div>
      {v.formula_explicada && <p className="text-[13px] text-muted-foreground"><b className="text-foreground font-medium">La fórmula del gancho:</b> {v.formula_explicada}</p>}
      {v.ideas.length > 0 && (
        <div className="text-[13px]"><p className="font-semibold text-foreground">3 ideas con la misma fórmula (el guion es de la mejor)</p>
          <ol className="mt-1 list-decimal pl-4 text-muted-foreground space-y-0.5">{v.ideas.map(i => <li key={i.titulo}><span className="text-foreground">{i.titulo}</span> — {i.por_que}</li>)}</ol></div>
      )}
    </div>
  );
}

function PorQueTab({ view }: { view: ReelView }) {
  const p = view.por_que_funciona;
  return (
    <div className="space-y-4">
      {p.tipo && (
        <div className="rounded-xl border border-border p-3 text-[13px] space-y-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-secondary px-2.5 py-1 text-[12px] font-semibold text-foreground">{TIPOS[p.tipo].nombre}</span>
            <span className="text-muted-foreground">{TIPOS[p.tipo].para}</span>
          </p>
          {p.tipo_por_que && <p className="text-foreground">{p.tipo_por_que}</p>}
        </div>
      )}
      <p className="font-display text-lg sm:text-xl font-semibold leading-snug text-foreground">{p.resumen}</p>
      <div className="rounded-xl border border-border p-3 text-[13px] space-y-1">
        <p className="font-semibold text-foreground">El gancho (0–3 s)</p>
        {p.gancho.se_dice && <p className="text-muted-foreground">Dice: «{p.gancho.se_dice}»</p>}
        {p.gancho.texto_pantalla && <p className="text-muted-foreground">Texto en pantalla: «{p.gancho.texto_pantalla}»</p>}
        {p.gancho.se_ve && <p className="text-muted-foreground">Se ve: {p.gancho.se_ve}</p>}
        {p.gancho.por_que && <p className="text-foreground">{p.gancho.por_que}</p>}
      </div>
      {(p.formula_gancho || p.mecanismo) && (
        <div className="grid gap-3 sm:grid-cols-2 text-[13px]">
          {p.formula_gancho && <p className="text-muted-foreground"><b className="text-foreground font-medium">Fórmula del gancho:</b> {p.formula_gancho}</p>}
          {p.mecanismo && <p className="text-muted-foreground"><b className="text-foreground font-medium">Por qué engancha:</b> {p.mecanismo}</p>}
        </div>
      )}
      <ul className="list-disc pl-5 space-y-1 text-sm text-foreground">{p.claves.map(c => <li key={c}>{c}</li>)}</ul>
      {p.timeline.length > 0 && (
        <ol className="space-y-1.5">
          {p.timeline.map((t, i) => (
            <li key={i} className="grid grid-cols-[72px_1fr] gap-2 text-[13px]">
              <span className="tabular-nums text-muted-foreground">{t.inicio}–{t.fin} s</span>
              <span><b className="text-foreground">{t.etiqueta}</b> <span className="text-muted-foreground">· {t.descripcion}</span></span>
            </li>
          ))}
        </ol>
      )}
      {p.mejorar.length > 0 && (
        <div className="text-[13px]"><p className="font-semibold text-foreground">Qué mejorar en tu versión</p><ul className="mt-1 list-disc pl-5 text-muted-foreground">{p.mejorar.map(m => <li key={m}>{m}</li>)}</ul></div>
      )}
      {!!p.no_comprobable?.length && (
        <div role="note" className="rounded-xl border border-primary/40 bg-primary/10 p-3 text-[13px]">
          <p className="font-semibold text-foreground">Ojo: esto no se puede comprobar</p>
          <ul className="mt-1 list-disc pl-5 text-foreground">{p.no_comprobable.map(x => <li key={x}>{x}</li>)}</ul>
          <p className="mt-1 text-[12px] text-muted-foreground">Tu versión no lo repite ni pone cifras parecidas: muestra solo resultados tuyos y reales.</p>
        </div>
      )}
      <button type="button" onClick={() => copy(notionPorQue(p), "Copiado en formato Notion")} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-border px-3 text-[13px] text-foreground hover:bg-secondary/60"><Copy className="w-4 h-4" /> Copiar ¿Por qué funciona? (Notion)</button>
    </div>
  );
}
