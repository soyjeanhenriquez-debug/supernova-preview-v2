import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Check, Copy, Download, FileText, Loader2, Pencil, Plus,
  Printer, RotateCcw, Sparkles, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { useProducts } from "@/contexts/ProductContext";
import { profileReady, useBusinessProfile } from "@/lib/businessProfile";
import { useCredits, type CreditAction } from "@/hooks/useCredits";
import { useProductBuilds } from "@/hooks/useProductBuilds";
import {
  builderCall, exportMarkdown, isPieceDone, printBuild, COVER_COLORS, FORMAT_LABEL, KIND_LABEL, MAX_NOTES, MAX_PIECES, MAX_PIECE_CHARS,
  TONE_LABEL, UPCOMING_MODELS,
  type Build, type BuildCover, type BuilderError, type BuildFormat, type BuildSize, type BuildTone, type BuilderModel, type CoverColor, type Piece,
} from "@/lib/productBuilder";

/**
 * Etapa 4 · "Crear producto": el ebook o mini curso del usuario, sin salir de SUPERNOVA.
 * 0 Empezar (formato, largo, tono) → 1 Revisa tu índice (gratis, editable) → 2 Escribe (cada pieza
 * se cobra aparte en el servidor; si la IA falla, se reembolsa sola) → 3 Descarga (portada, PDF,
 * copiar, .md: gratis). Todo queda ligado al producto activo (useProducts().activeId).
 */

/** Libro abierto: queda en sessionStorage hasta volver a la lista (sobrevive a recargar la pestaña). */
const OPEN_KEY = "supernova.openBuild";
const rememberOpen = (id: string | null) => {
  try { if (id) sessionStorage.setItem(OPEN_KEY, id); else sessionStorage.removeItem(OPEN_KEY); } catch { /* sin almacenamiento */ }
};
type Step = "start" | "outline" | "write";

const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60";
const primaryBtn = "inline-flex items-center justify-center gap-2 rounded-lg gradient-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed";
const ghostBtn = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-foreground hover:border-primary/60 disabled:opacity-40 disabled:cursor-not-allowed";
const iconBtn = "w-8 h-8 inline-grid place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed";

const sortPieces = (list: Piece[]) => [...list].sort((a, b) => a.idx - b.idx);
/** Tiene algo escrito (aunque sea poco): "Escribir todo" no la pisa. */
const hasText = (p: Piece) => !!(p.content ?? "").trim();
/** Cuenta como hecha (≥200 caracteres, igual que el servidor). */
const isDone = (p: Piece) => isPieceDone(p);

/** "Capítulo 3", "Lección 2", "Bono 1": se numera por tipo, en el orden del índice. */
function pieceLabels(list: Piece[]) {
  const count: Record<string, number> = {};
  const out: Record<string, string> = {};
  for (const p of sortPieces(list)) {
    count[p.kind] = (count[p.kind] ?? 0) + 1;
    out[p.id] = `${KIND_LABEL[p.kind]} ${count[p.kind]}`;
  }
  return out;
}

function Seg<T extends string>({ value, options, onChange, label }: {
  value: T; label: string; onChange: (v: T) => void;
  options: { id: T; label: string; disabled?: boolean; title?: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-foreground">{label}</p>
      <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-secondary/30 p-1">
        {options.map(o => (
          <button key={o.id} role="radio" aria-checked={value === o.id} disabled={o.disabled} title={o.title}
            onClick={() => onChange(o.id)}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${value === o.id ? "bg-background text-foreground shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card-surface rounded-2xl p-5 space-y-4 ${className}`}>{children}</div>;
}

export function ProductBuilderPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { active, activeId } = useProducts();
  const { profile, loaded } = useBusinessProfile();
  const pb = useProductBuilds();
  const { balance, applyServerCharge } = useCredits();

  const [build, setBuild] = useState<Build | null>(null);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [step, setStep] = useState<Step>("start");
  const [creatingNew, setCreatingNew] = useState(false);
  const [opening, setOpening] = useState(false);

  // Paso 0
  const [format, setFormat] = useState<BuildFormat>("ebook");
  const [size, setSize] = useState<BuildSize>("normal");
  const [tone, setTone] = useState<BuildTone>("cercano");
  const [notes, setNotes] = useState("");
  const [outlining, setOutlining] = useState(false);

  // Paso 2
  const [modelSlug, setModelSlug] = useState<string | null>(null);
  const [writingId, setWritingId] = useState<string | null>(null);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [run, setRun] = useState<{ done: number; total: number } | null>(null);
  /** Cada corrida de "Escribir todo" tiene su número; Detener o volver a la lista lo cambian y el
   *  bucle se corta. runOwnerRef = corrida dueña de la barra de progreso (0 = ninguna). */
  const runIdRef = useRef(0);
  const runOwnerRef = useRef(0);
  const balanceRef = useRef(balance);
  useEffect(() => { balanceRef.current = balance; }, [balance]);

  const openBuild = async (b: Build) => {
    setOpening(true);
    const list = await pb.loadPieces(b.id);
    setBuild(b);
    setPieces(list);
    setFailed(new Set());
    setStep(list.some(hasText) ? "write" : "outline");
    setCreatingNew(false);
    setOpening(false);
    rememberOpen(b.id);
  };

  const backToList = async () => {
    runIdRef.current++;      // corta "Escribir todo" si estaba corriendo
    runOwnerRef.current = 0;
    setRun(null);
    setWritingId(null);
    rememberOpen(null);
    await pb.flushAll();
    setBuild(null);
    setPieces([]);
    setStep("start");
    setCreatingNew(false);
    void pb.reload();
  };

  // Libro recordado ("Lo que creaste" → Abrir, o recarga de la pestaña): se abre una vez al cargar.
  const openedFromStorage = useRef(false);
  useEffect(() => {
    if (!pb.loaded || openedFromStorage.current) return;
    openedFromStorage.current = true;
    let id: string | null = null;
    try { id = sessionStorage.getItem(OPEN_KEY); } catch { /* sin almacenamiento */ }
    const b = id ? pb.builds.find(x => x.id === id) : null;
    if (b) void openBuild(b);
    else if (id) rememberOpen(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pb.loaded]);

  // Si cambia el producto activo, el libro abierto (de otro producto) se cierra: vuelve a la lista.
  useEffect(() => {
    if (build?.product_id && activeId && build.product_id !== activeId) void backToList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, build?.product_id]);

  // Modelos elegibles: solo los habilitados y, con groserías, solo los que las permiten.
  const buildTone = build?.tone ?? tone;
  const visibleModels = useMemo(
    () => pb.models.filter(m => m.enabled && (buildTone !== "groserias" || m.allows_profanity)),
    [pb.models, buildTone],
  );
  const anyProfanity = pb.models.some(m => m.enabled && m.allows_profanity);
  const model: BuilderModel | null = visibleModels.find(m => m.slug === modelSlug) ?? visibleModels[0] ?? null;

  const sorted = useMemo(() => sortPieces(pieces), [pieces]);
  const labels = useMemo(() => pieceLabels(pieces), [pieces]);
  const doneCount = sorted.filter(isDone).length;
  const allDone = sorted.length > 0 && doneCount === sorted.length;

  // Con todas las partes hechas: queda "listo" (y un poco de confeti). Si después se agrega una
  // parte o se borra texto, vuelve a "borrador".
  useEffect(() => {
    if (!build || !sorted.length) return;
    if (allDone && build.status !== "listo") {
      setBuild(b => (b ? { ...b, status: "listo" } : b));
      void pb.updateBuild(build.id, { status: "listo" });
      import("canvas-confetti").then(({ default: confetti }) => {
        confetti({ particleCount: 120, spread: 75, origin: { y: 0.7 } });
      }).catch(() => { /* sin confeti */ });
    } else if (!allDone && build.status === "listo") {
      setBuild(b => (b ? { ...b, status: "borrador" } : b));
      void pb.updateBuild(build.id, { status: "borrador" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone, sorted.length, build?.id, build?.status]);

  if (!loaded || !pb.loaded) return <div className="text-sm text-muted-foreground p-6">Cargando…</div>;

  const header = (
    <PageHeader stage="Mi negocio · Etapa 4" title="Crea tu producto" line="Tu ebook o curso, escrito a partir de tu ficha."
      icon={<BookOpen className="w-5 h-5 text-primary shrink-0" />}
      details={[
        "El índice es gratis. Lo revisas y lo cambias como quieras.",
        "Cada capítulo o lección se cobra aparte. Si la IA falla, no se te cobra.",
        "Editar, reordenar, la portada y guardar en PDF son gratis.",
      ]}
      right={active ? (
        <span className="max-w-[220px] truncate rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs text-muted-foreground" title={active.name}>
          {active.name}
        </span>
      ) : undefined} />
  );

  // ---------- Ficha incompleta ----------
  if (!profileReady(profile)) {
    return (
      <div className="space-y-5 max-w-3xl">
        {header}
        <Card>
          <p className="font-display font-semibold text-lg text-foreground">Primero completa tu ficha</p>
          <p className="text-sm text-muted-foreground">Tu producto se escribe con lo que vendes, para quién y qué promete.</p>
          <button onClick={() => onNavigate?.("Mi negocio")} className={primaryBtn}>Ir a Mi negocio <ArrowRight className="w-4 h-4" /></button>
        </Card>
      </div>
    );
  }

  // ---------- Acciones ----------
  const createOutline = async () => {
    if (outlining) return;
    setOutlining(true);
    const r = await builderCall({
      action: "outline", product_id: activeId ?? undefined, format, size, tone,
      notes: notes.trim() ? notes.trim().slice(0, MAX_NOTES) : undefined,
    });
    setOutlining(false);
    if (!r.ok) { toast.error((r.data as BuilderError).error); return; }
    setBuild(r.data.build);
    setPieces(r.data.pieces);
    setFailed(new Set());
    setStep("outline");
    setCreatingNew(false);
    setNotes("");
    rememberOpen(r.data.build.id);
    void pb.reload();
  };

  const editPiece = (id: string, patch: Partial<Pick<Piece, "title" | "brief" | "module" | "content">>) => {
    const clean = { ...patch };
    if (typeof clean.title === "string") clean.title = clean.title.slice(0, 160);
    if (typeof clean.brief === "string") clean.brief = clean.brief.slice(0, 600);
    if (typeof clean.module === "string") clean.module = clean.module.slice(0, 120);
    if (typeof clean.content === "string") clean.content = clean.content.slice(0, MAX_PIECE_CHARS);
    setPieces(prev => prev.map(p => (p.id === id ? { ...p, ...clean } : p)));
    pb.savePieceDebounced(id, typeof clean.content === "string" ? { ...clean, edited_at: new Date().toISOString() } : clean);
  };

  const move = async (p: Piece, dir: -1 | 1) => {
    const i = sorted.findIndex(x => x.id === p.id);
    const other = sorted[i + dir];
    if (!other) return;
    setPieces(prev => prev.map(x => (x.id === p.id ? { ...x, idx: other.idx } : x.id === other.id ? { ...x, idx: p.idx } : x)));
    if (!(await pb.movePiece(p, other))) toast.error("No se pudo mover. Intenta de nuevo.");
  };

  const removePiece = async (p: Piece) => {
    if (hasText(p) && !window.confirm("Esta parte ya está escrita. ¿Quitarla de todos modos?")) return;
    const rest = sorted.filter(x => x.id !== p.id);
    setPieces(rest.map((x, i) => ({ ...x, idx: i })));
    if (!(await pb.deletePiece(p.id, rest))) toast.error("No se pudo quitar. Intenta de nuevo.");
  };

  const addPart = async () => {
    if (!build || sorted.length >= MAX_PIECES) return;
    const main = sorted.filter(p => p.kind !== "bono");
    const lastModule = build.format === "curso" ? (main[main.length - 1]?.module ?? "Módulo nuevo") : null;
    const row = await pb.addPiece(build.id, {
      kind: build.format === "curso" ? "leccion" : "capitulo", module: lastModule,
      title: "Nueva parte", brief: "", idx: (sorted[sorted.length - 1]?.idx ?? -1) + 1,
    });
    if (!row) { toast.error("No se pudo agregar. Intenta de nuevo."); return; }
    setPieces(prev => [...prev, row]);
  };

  const changeTone = (t: BuildTone) => {
    if (!build) return;
    setBuild({ ...build, tone: t });
    void pb.updateBuild(build.id, { tone: t });
  };

  /** Escribe una pieza. 'stop' = no seguir con las demás (saldo, límite, servicio caído). */
  const writeOne = async (p: Piece, instructions?: string): Promise<"ok" | "stop" | "skip"> => {
    if (!build || !model) return "stop";
    if (balanceRef.current < model.cost) {
      toast.error(`Te faltan ${model.cost - balanceRef.current} créditos`, { description: "Recarga en Créditos para seguir." });
      return "stop";
    }
    setWritingId(p.id);
    const r = await builderCall({
      action: "piece", build_id: build.id, piece_id: p.id, model: model.slug,
      instructions: instructions?.trim() ? instructions.trim().slice(0, MAX_NOTES) : undefined,
    });
    setWritingId(w => (w === p.id ? null : w)); // si ya se abrió otro libro, no toca su estado
    if (r.ok) {
      applyServerCharge(model.piece_action as CreditAction, r.billing, `${labels[p.id] ?? KIND_LABEL[p.kind]} · ${p.title}`);
      const bal = r.billing.balance ?? r.data.balance;
      if (typeof bal === "number") balanceRef.current = bal;
      setPieces(prev => prev.map(x => (x.id === p.id ? { ...x, ...r.data.piece } : x)));
      setFailed(prev => { const n = new Set(prev); n.delete(p.id); return n; });
      if (r.data.piece.truncated) toast("Quedó un poco corta al final. Puedes editarla o reescribirla.");
      return "ok";
    }
    // Los mensajes con reembolso ya dicen "No se te cobró".
    const err = r.data as BuilderError;
    toast.error(err.error);
    if (typeof err.balance === "number") balanceRef.current = err.balance;
    if (r.status === 409) return "skip";
    if ([0, 401, 402, 403, 429, 500, 503].includes(r.status)) return "stop";
    setFailed(prev => new Set(prev).add(p.id)); // 502, 504, 422: se marca "Reintentar"
    // Tardó demasiado (la siguiente también tardaría) o la IA no acepta el tono: no seguir.
    if (r.status === 504 || err.code === "tone_not_allowed") return "stop";
    return "skip";
  };

  const stopRun = () => { runIdRef.current++; };

  const writeAll = async () => {
    const targets = sorted.filter(p => !hasText(p));
    if (!targets.length || run) return;
    const my = ++runIdRef.current;
    runOwnerRef.current = my;
    setRun({ done: 0, total: targets.length });
    await pb.flushAll(); // el servidor lee títulos y "de qué trata" guardados
    let done = 0;
    for (const p of targets) {
      if (runIdRef.current !== my) break;
      const res = await writeOne(p);
      if (res === "ok") done++;
      if (runOwnerRef.current === my) setRun({ done, total: targets.length });
      if (res === "stop") break;
    }
    // Si se volvió a la lista, la barra ya no es de esta corrida: no se toca.
    if (runOwnerRef.current !== my) return;
    runOwnerRef.current = 0;
    setRun(null);
    if (runIdRef.current !== my) toast("Pausado. Lo escrito quedó guardado.");
  };

  const writeSingle = async (p: Piece, instructions?: string) => {
    await pb.flushPiece(p.id);
    await writeOne(p, instructions);
  };

  // ---------- Sin libro abierto: lista + paso 0 ----------
  if (!build) {
    const showList = pb.builds.length > 0 && !creatingNew;
    return (
      <div className="space-y-5 max-w-3xl">
        {header}
        {showList ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">Tus ebooks y cursos</p>
              <button onClick={() => setCreatingNew(true)} className={ghostBtn}><Plus className="w-3.5 h-3.5" /> Nuevo</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {pb.builds.map(b => (
                <div key={b.id} className="card-surface rounded-xl p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display font-semibold text-foreground leading-snug line-clamp-2">{b.title}</p>
                    <button aria-label="Borrar" title="Borrar"
                      onClick={async () => {
                        if (!window.confirm(`¿Borrar «${b.title}»? Se borra todo lo escrito.`)) return;
                        if (!(await pb.deleteBuild(b.id))) toast.error("No se pudo borrar.");
                      }}
                      className="text-muted-foreground hover:text-destructive shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {FORMAT_LABEL[b.format]} · {b.status === "listo" ? "Listo" : `${b.pieces_done} de ${b.pieces_total} listos`}
                  </p>
                  <button onClick={() => openBuild(b)} disabled={opening} className="self-start text-xs text-primary hover:underline inline-flex items-center gap-1">
                    Abrir <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Card>
            <div className="flex items-center justify-between gap-3">
              <p className="font-display font-semibold text-lg text-foreground">Empezar</p>
              {pb.builds.length > 0 && (
                <button onClick={() => setCreatingNew(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
              )}
            </div>
            <Seg<BuildFormat> label="Formato" value={format} onChange={setFormat}
              options={[{ id: "ebook", label: "Ebook o guía" }, { id: "curso", label: "Mini curso" }]} />
            <Seg<BuildSize> label="Largo" value={size} onChange={setSize}
              options={[{ id: "corto", label: "Corto" }, { id: "normal", label: "Normal" }]} />
            <div className="space-y-1.5">
              <Seg<BuildTone> label="Tono" value={tone} onChange={setTone}
                options={[
                  { id: "limpio", label: "Limpio" }, { id: "cercano", label: "Cercano" },
                  { id: "groserias", label: "Con groserías", disabled: pb.modelsLoaded && !anyProfanity, title: pb.modelsLoaded && !anyProfanity ? "Pronto" : undefined },
                ]} />
              {tone === "groserias" && <p className="text-xs text-muted-foreground">Solo en tu producto: Meta y TikTok rechazan anuncios con groserías.</p>}
            </div>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-foreground">¿Algo que deba incluir? <span className="text-muted-foreground font-normal">(opcional)</span></span>
              <textarea value={notes} onChange={e => setNotes(e.target.value.slice(0, MAX_NOTES))} rows={2}
                placeholder="Ej.: un capítulo sobre cómo cobrar por WhatsApp" className={`${inputCls} resize-y`} />
            </label>
            <button onClick={createOutline} disabled={outlining} className={`${primaryBtn} w-full sm:w-auto`}>
              {outlining ? <><Loader2 className="w-4 h-4 animate-spin" /> Armando tu índice…</> : <><Sparkles className="w-4 h-4" /> Crear índice · Gratis</>}
            </button>
          </Card>
        )}
      </div>
    );
  }

  // ---------- Libro abierto ----------
  const top = (
    <div className="flex items-center justify-between gap-3">
      <button onClick={backToList} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-3.5 h-3.5" /> Tus ebooks y cursos
      </button>
      <span className="text-xs text-muted-foreground tabular-nums">{FORMAT_LABEL[build.format]} · {doneCount} de {sorted.length} listos</span>
    </div>
  );

  // ---------- Paso 1 · Revisa tu índice ----------
  if (step === "outline") {
    const groups: { module: string | null; items: Piece[] }[] = [];
    for (const p of sorted) {
      const key = build.format === "curso" && p.kind !== "bono" ? p.module : null;
      const last = groups[groups.length - 1];
      if (last && last.module === key) last.items.push(p);
      else groups.push({ module: key, items: [p] });
    }
    return (
      <div className="space-y-5 max-w-3xl">
        {header}
        {top}
        <Card>
          <div>
            <p className="font-display font-semibold text-lg text-foreground">Revisa tu índice</p>
            <p className="text-sm text-muted-foreground">Cambia lo que quieras. Es gratis.</p>
          </div>
          <input value={build.title} aria-label="Título"
            onChange={e => setBuild({ ...build, title: e.target.value.slice(0, 160) })}
            onBlur={() => void pb.updateBuild(build.id, { title: build.title.trim() || "Mi producto" })}
            className={`${inputCls} font-display font-semibold text-base`} />
          <div className="space-y-4">
            {groups.map((g, gi) => (
              <div key={`${g.module ?? "sin"}-${gi}`} className="space-y-2">
                {g.module !== null && (
                  <input value={g.module} aria-label="Nombre del módulo"
                    onChange={e => g.items.forEach(p => editPiece(p.id, { module: e.target.value }))}
                    className="w-full bg-transparent text-xs uppercase tracking-wider text-primary font-semibold focus:outline-none border-b border-transparent focus:border-primary/40 py-1" />
                )}
                {g.items.map(p => {
                  const i = sorted.findIndex(x => x.id === p.id);
                  return (
                    <div key={p.id} className="rounded-xl border border-border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{labels[p.id]}</span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => move(p, -1)} disabled={i === 0} aria-label="Subir" className={iconBtn}><ArrowUp className="w-3.5 h-3.5" /></button>
                          <button onClick={() => move(p, 1)} disabled={i === sorted.length - 1} aria-label="Bajar" className={iconBtn}><ArrowDown className="w-3.5 h-3.5" /></button>
                          <button onClick={() => removePiece(p)} disabled={sorted.length <= 1} className="ml-1 text-xs text-muted-foreground hover:text-destructive px-1">Quitar</button>
                        </div>
                      </div>
                      <input value={p.title} aria-label="Título de la parte" onChange={e => editPiece(p.id, { title: e.target.value })}
                        className={`${inputCls} font-medium`} />
                      <textarea value={p.brief ?? ""} aria-label="De qué trata" placeholder="De qué trata"
                        onChange={e => editPiece(p.id, { brief: e.target.value })} rows={2} className={`${inputCls} resize-y text-xs`} />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <button onClick={addPart} disabled={sorted.length >= MAX_PIECES} className={ghostBtn}>
              <Plus className="w-3.5 h-3.5" /> Agregar parte
            </button>
            <button onClick={async () => { await pb.flushAll(); setStep("write"); }} disabled={!sorted.length} className={primaryBtn}>
              Listo, a escribir <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          {sorted.length >= MAX_PIECES && <p className="text-[11px] text-muted-foreground">Máximo {MAX_PIECES} partes.</p>}
        </Card>
      </div>
    );
  }

  // ---------- Paso 2 · Escribe ----------
  // "Escribir todo" solo llena las vacías: nunca pisa lo que el usuario escribió.
  const missing = sorted.filter(p => !hasText(p));
  const cost = model?.cost ?? 0;
  const totalCost = missing.length * cost;
  const shortBy = Math.max(0, totalCost - balance);
  const busy = !!writingId || !!run;
  // "Pronto": los de la tabla aún apagados (el admin también los ve así) + los anunciados sin fila.
  const upcoming = [
    ...pb.models.filter(m => !m.enabled).map(m => ({ slug: m.slug, label: m.label })),
    ...UPCOMING_MODELS.filter(u => !pb.models.some(m => m.slug === u.slug)),
  ];

  return (
    <div className="space-y-5 max-w-3xl">
      {header}
      {top}

      <Card>
        <div className="flex items-center justify-between gap-3">
          <p className="font-display font-semibold text-lg text-foreground">Escribe</p>
          <button onClick={() => setStep("outline")} disabled={busy} className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40">Editar índice</button>
        </div>
        <div className="space-y-1.5">
          <Seg<BuildTone> label="Tono" value={build.tone} onChange={changeTone}
            options={(["limpio", "cercano", "groserias"] as BuildTone[]).map(t => ({
              id: t, label: TONE_LABEL[t], disabled: busy || (t === "groserias" && !anyProfanity),
            }))} />
          {build.tone === "groserias" && <p className="text-xs text-muted-foreground">Solo en tu producto: Meta y TikTok rechazan anuncios con groserías.</p>}
        </div>

        {/* Selector de IA: sale de ai_builder_models (solo las habilitadas se pueden elegir). */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-foreground">IA que escribe</p>
          {!pb.modelsLoaded ? (
            <p className="text-xs text-muted-foreground">Cargando…</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {visibleModels.map(m => {
                const on = model?.slug === m.slug;
                return (
                  <button key={m.slug} onClick={() => setModelSlug(m.slug)} disabled={busy} aria-pressed={on}
                    className={`text-left rounded-xl border p-3 transition-colors disabled:opacity-60 ${on ? "border-primary bg-primary/5" : "border-border hover:border-foreground/20"}`}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground">{m.label}</span>
                      {m.tier === "maximo" && <span className="text-[10px] uppercase tracking-wider text-primary">Máximo</span>}
                    </span>
                    {m.hint && <span className="block text-xs text-muted-foreground mt-0.5">{m.hint}</span>}
                    <span className="block text-xs text-foreground/80 mt-1 tabular-nums">{m.cost} créditos por parte</span>
                  </button>
                );
              })}
              {upcoming.map(u => (
                <div key={u.slug} className="rounded-xl border border-dashed border-border p-3 opacity-60">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{u.label}</span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Pronto</span>
                  </span>
                </div>
              ))}
              {!visibleModels.length && (
                <p className="text-xs text-muted-foreground sm:col-span-2">Ninguna IA disponible escribe con este tono. Cambia el tono.</p>
              )}
            </div>
          )}
        </div>

        {/* Barra: escribir todo + saldo */}
        <div className="rounded-xl border border-border bg-secondary/20 p-3 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
            {run ? (
              <button onClick={stopRun} className={ghostBtn}><X className="w-3.5 h-3.5" /> Detener</button>
            ) : (
              <button onClick={writeAll} disabled={!model || !missing.length || busy || balance < cost} className={primaryBtn}>
                <Sparkles className="w-4 h-4" /> Escribir todo · {totalCost} créditos
              </button>
            )}
            <span className="text-xs text-muted-foreground tabular-nums">Tu saldo: {balance.toLocaleString()}</span>
          </div>
          {!run && missing.length > 0 && shortBy > 0 && (
            <p className="text-xs text-amber-400">
              Te faltan {shortBy} créditos.{" "}
              <button onClick={() => onNavigate?.("Créditos")} className="underline hover:text-amber-300">Ir a Créditos</button>
            </p>
          )}
          {run && (
            <div className="space-y-1">
              <div className="h-1.5 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={run.done} aria-valuemin={0} aria-valuemax={run.total}>
                <div className="h-full gradient-brand transition-all" style={{ width: `${Math.round((run.done / Math.max(1, run.total)) * 100)}%` }} />
              </div>
              <p className="text-[11px] text-muted-foreground tabular-nums">{run.done} de {run.total}</p>
            </div>
          )}
        </div>
      </Card>

      <div className="space-y-3">
        {sorted.map(p => (
          <PieceCard key={p.id} piece={p} label={labels[p.id]} cost={cost}
            writing={writingId === p.id} failed={failed.has(p.id)} disabled={busy || !model || balance < cost}
            saving={pb.saving} savedAt={pb.lastSavedAt}
            onWrite={instr => writeSingle(p, instr)}
            onEdit={content => editPiece(p.id, { content })} />
        ))}
      </div>

      {doneCount >= 1 && (
        <ExportPanel build={build} pieces={sorted} allDone={allDone}
          onChange={patch => { setBuild({ ...build, ...patch }); void pb.updateBuild(build.id, patch); }}
          beforeExport={pb.flushAll}
          onNext={() => {
            try { localStorage.setItem("supernova_generator_prefill", JSON.stringify({ generator: "landing-copy", text: `Página de venta de mi ${build.format === "curso" ? "curso" : "ebook"} «${build.title}»` })); } catch { /* sin almacenamiento */ }
            void pb.flushAll().then(() => onNavigate?.("Generadores"));
          }} />
      )}
    </div>
  );
}

// ---------- Pieza (capítulo, lección o bono) ----------
function PieceCard({ piece, label, cost, writing, failed, disabled, saving, savedAt, onWrite, onEdit }: {
  piece: Piece; label: string; cost: number; writing: boolean; failed: boolean; disabled: boolean;
  saving: boolean; savedAt: number | null;
  onWrite: (instructions?: string) => void; onEdit: (content: string) => void;
}) {
  const done = isDone(piece);
  const written = hasText(piece);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [rewrite, setRewrite] = useState(false);
  const [instr, setInstr] = useState("");
  const wasWriting = useRef(false);
  const [touched, setTouched] = useState(false);

  // Al terminar de escribirse, se abre para leerla.
  useEffect(() => {
    if (wasWriting.current && !writing && written) setOpen(true);
    wasWriting.current = writing;
  }, [writing, done]);

  const status = writing ? "Escribiendo…" : failed ? "Reintentar" : done ? "Lista" : written ? "Muy corta" : "Vacía";
  const statusCls = writing ? "text-primary" : failed ? "text-amber-400" : done ? "text-emerald-400" : written ? "text-amber-400" : "text-muted-foreground";
  // Con texto, o mientras se edita (aunque se haya borrado todo): se ve, se edita y se reescribe.
  const hasBody = written || editing;

  return (
    <div className="card-surface rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <button onClick={() => hasBody && setOpen(o => !o)} className="min-w-0 text-left">
          <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">{label}{piece.module ? ` · ${piece.module}` : ""}</span>
          <span className="block font-medium text-foreground leading-snug">{piece.title}</span>
        </button>
        <span className={`shrink-0 text-xs inline-flex items-center gap-1 ${statusCls}`}>
          {writing ? <Loader2 className="w-3 h-3 animate-spin" /> : done && !failed ? <Check className="w-3 h-3" /> : null}{status}
        </span>
      </div>

      {!hasBody && piece.brief && <p className="text-xs text-muted-foreground">{piece.brief}</p>}

      <div className="flex flex-wrap gap-2">
        {!hasBody ? (
          <button onClick={() => onWrite()} disabled={disabled} className={ghostBtn}>
            <Sparkles className="w-3.5 h-3.5 text-primary" /> {failed ? "Reintentar" : "Escribir"} · {cost} créditos
          </button>
        ) : (
          <>
            <button onClick={() => setOpen(o => !o)} className={ghostBtn}><FileText className="w-3.5 h-3.5" /> {open ? "Ocultar" : "Ver"}</button>
            <button onClick={() => { setOpen(true); setEditing(e => !e); setRewrite(false); }} disabled={writing} className={ghostBtn}>
              <Pencil className="w-3.5 h-3.5" /> {editing ? "Listo" : "Editar"}
            </button>
            <button onClick={() => { setRewrite(r => !r); setEditing(false); }} disabled={disabled} className={ghostBtn}>
              <RotateCcw className="w-3.5 h-3.5" /> Reescribir · {cost} créditos
            </button>
          </>
        )}
      </div>

      {rewrite && hasBody && (
        <div className="rounded-lg border border-border p-3 space-y-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">¿Qué cambiarías? <span className="text-muted-foreground font-normal">(opcional)</span></span>
            <textarea value={instr} onChange={e => setInstr(e.target.value.slice(0, MAX_NOTES))} rows={2}
              placeholder="Ej.: más ejemplos y frases más cortas" className={`${inputCls} resize-y`} />
          </label>
          <div className="flex gap-2">
            <button onClick={() => { onWrite(instr); setRewrite(false); setInstr(""); }} disabled={disabled} className={primaryBtn}>
              <RotateCcw className="w-4 h-4" /> Reescribir · {cost} créditos
            </button>
            <button onClick={() => setRewrite(false)} className="text-xs text-muted-foreground hover:text-foreground px-2">Cancelar</button>
          </div>
        </div>
      )}

      {hasBody && open && (editing ? (
        <div className="space-y-1">
          <textarea value={piece.content ?? ""} onChange={e => { setTouched(true); onEdit(e.target.value); }} rows={18}
            aria-label="Texto de la parte" className={`${inputCls} resize-y font-mono text-xs leading-relaxed`} />
          {touched && <p className="text-[11px] text-muted-foreground">{saving ? "Guardando…" : savedAt ? "Guardado" : ""}</p>}
        </div>
      ) : (
        <div className="prose prose-invert prose-sm max-w-none prose-headings:font-display prose-headings:text-foreground prose-h2:text-lg prose-h3:text-base border-t border-border pt-3">
          <ReactMarkdown>{piece.content ?? ""}</ReactMarkdown>
        </div>
      ))}
    </div>
  );
}

// ---------- Paso 3 · Descarga ----------
function ExportPanel({ build, pieces, allDone, onChange, beforeExport, onNext }: {
  build: Build; pieces: Piece[]; allDone: boolean;
  onChange: (patch: Partial<Pick<Build, "title" | "subtitle" | "cover">>) => void;
  beforeExport: () => Promise<void>; onNext: () => void;
}) {
  const cover: BuildCover = { template: "clasica", color: "noche", ...(build.cover ?? {}) };
  const colors = COVER_COLORS[cover.color ?? "noche"] ?? COVER_COLORS.noche;
  const [title, setTitle] = useState(build.title);
  const [subtitle, setSubtitle] = useState(build.subtitle ?? "");
  const [author, setAuthor] = useState(cover.author ?? "");

  const md = () => exportMarkdown(build, pieces, author);
  const fileName = (build.title || "mi-producto").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "mi-producto";

  const savePdf = async () => { await beforeExport(); printBuild({ ...build, title, subtitle }, pieces, { ...cover, author }); };
  const copyAll = async () => {
    await beforeExport();
    try { await navigator.clipboard.writeText(md()); toast.success("Copiado"); } catch { toast.error("No se pudo copiar."); }
  };
  const downloadMd = async () => {
    await beforeExport();
    const url = URL.createObjectURL(new Blob([md()], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.md`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <Card>
      {allDone && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
          <p className="font-display font-semibold text-lg text-foreground">¡Ya tienes tu producto!</p>
          <button onClick={onNext} className={primaryBtn}>Siguiente: tu página de venta <ArrowRight className="w-4 h-4" /></button>
        </div>
      )}
      <p className="font-display font-semibold text-lg text-foreground">Descarga</p>

      <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
        {/* Portada de plantilla */}
        <div className="aspect-[3/4] w-40 rounded-lg p-4 flex flex-col justify-center shadow-lg" style={{ background: colors.bg, color: colors.fg }}>
          <div className="w-8 h-1 rounded mb-3" style={{ background: colors.accent }} />
          <p className="font-display font-bold text-sm leading-tight line-clamp-4">{title || "Tu título"}</p>
          {subtitle && <p className="text-[10px] mt-1 opacity-80 line-clamp-3">{subtitle}</p>}
          {author && <p className="text-[9px] uppercase tracking-wider mt-3 opacity-80 truncate">{author}</p>}
        </div>
        <div className="space-y-3 min-w-0">
          <div className="flex gap-2" role="radiogroup" aria-label="Color de portada">
            {(Object.keys(COVER_COLORS) as CoverColor[]).map(c => (
              <button key={c} role="radio" aria-checked={cover.color === c} title={COVER_COLORS[c].label} aria-label={COVER_COLORS[c].label}
                onClick={() => onChange({ cover: { ...cover, author, color: c } })}
                className={`w-8 h-8 rounded-full border-2 ${cover.color === c ? "border-primary" : "border-border"}`}
                style={{ background: COVER_COLORS[c].bg }} />
            ))}
          </div>
          <input value={title} aria-label="Título" placeholder="Título" onChange={e => setTitle(e.target.value.slice(0, 160))}
            onBlur={() => title.trim() && title !== build.title && onChange({ title: title.trim() })} className={inputCls} />
          <input value={subtitle} aria-label="Subtítulo" placeholder="Subtítulo" onChange={e => setSubtitle(e.target.value.slice(0, 200))}
            onBlur={() => subtitle !== (build.subtitle ?? "") && onChange({ subtitle: subtitle.trim() || null })} className={inputCls} />
          <input value={author} aria-label="Autor" placeholder="Autor" onChange={e => setAuthor(e.target.value.slice(0, 80))}
            onBlur={() => author !== (cover.author ?? "") && onChange({ cover: { ...cover, author: author.trim() } })} className={inputCls} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={savePdf} className={ghostBtn}><Printer className="w-3.5 h-3.5" /> Guardar PDF</button>
        <button onClick={copyAll} className={ghostBtn}><Copy className="w-3.5 h-3.5" /> Copiar todo</button>
        <button onClick={downloadMd} className={ghostBtn}><Download className="w-3.5 h-3.5" /> Descargar .md</button>
      </div>
      {!allDone && <p className="text-[11px] text-muted-foreground">Solo se incluyen las partes ya escritas.</p>}
    </Card>
  );
}

export default ProductBuilderPage;
