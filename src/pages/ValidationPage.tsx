import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QuickBrief } from "@/components/QuickBrief";
import { ArrowRight, Check, CircleHelp, ClipboardCheck, Loader2, Pencil, Printer, RotateCcw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { profileReady, useBusinessProfile, type Validation } from "@/lib/businessProfile";
import { PageHeader } from "@/components/PageHeader";
import {
  QUESTIONS, TOTAL, PAGE_LABEL, normalizeAnswers, blockScore, overallScore, byAnswer, verdict, nextStep,
  suggestions, defaultKeyword, keywordWords, summarizeRadar, fmt,
  type Answer, type Answers, type Block, type Question, type RadarCheck, type Suggestion,
} from "@/lib/validation";

/**
 * Etapa 2 del recorrido "Mi negocio": ¿esto se vende?
 * Inspirada en la "Matriz do Perpétuo" de Leandro Ladeira: separa fortalezas y puntos débiles del
 * PRODUCTO y del MERCADO y termina en una matriz imprimible.
 * Desde el 04-oct-2026: Sí / No / No sé, con "Cómo saberlo" en cada pregunta, sugerencias sacadas
 * de la ficha (que el usuario confirma) y "Compruébalo por mí", que consulta el catálogo real con
 * la RPC radar_search (gratis, sin IA). La lógica vive en src/lib/validation.ts.
 * Sin IA: no gasta créditos. Se guarda en business_profile.validation (solo con savePatch).
 */

// Al imprimir: solo la matriz, en blanco y negro legible.
const PRINT_CSS = `
@media print {
  @page { margin: 14mm; }
  body * { visibility: hidden !important; }
  #sn-validation-matrix, #sn-validation-matrix * { visibility: visible !important; }
  #sn-validation-matrix { position: absolute; left: 0; top: 0; width: 100%; background: #fff !important; color: #111 !important; }
  #sn-validation-matrix * { color: #111 !important; background: transparent !important; border-color: #bbb !important; box-shadow: none !important; }
  #sn-validation-matrix .sn-no-print { display: none !important; }
  #sn-validation-matrix .sn-quad { break-inside: avoid; }
}
`;

const ANSWER_LABEL: Record<Answer, string> = { si: "Sí", no: "No", nose: "No sé" };
const RADAR_PREFILL_KEY = "supernova_radar_prefill";

type RadarState =
  | { status: "idle" }
  | { status: "loading"; kw: string }
  | { status: "done"; kw: string; result: RadarCheck }
  | { status: "error"; kw: string; message: string };

export function ValidationPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { profile, loaded, savePatch } = useBusinessProfile();
  const [answers, setAnswers] = useState<Answers>({});
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [ready, setReady] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [radar, setRadar] = useState<RadarState>({ status: "idle" });
  const saveTimer = useRef<number | null>(null);
  const pending = useRef<Validation | null>(null);
  // Copias al día para "Compruébalo por mí": responde después de esperar al Radar y no debe
  // pisar lo que el usuario marcó mientras tanto.
  const answersRef = useRef<Answers>({});
  const completedRef = useRef<string | null>(null);
  answersRef.current = answers;
  completedRef.current = completedAt;

  // Carga lo guardado una sola vez (true/false de la versión anterior se leen como sí/no).
  useEffect(() => {
    if (!loaded || ready) return;
    const saved = profile.validation;
    if (saved?.answers) {
      setAnswers(normalizeAnswers(saved.answers));
      setCompletedAt(saved.completed_at ?? null);
    }
    setKeyword(defaultKeyword(profile.product ?? ""));
    setReady(true);
  }, [loaded, ready, profile.validation, profile.product]);

  const flush = useCallback(() => {
    if (saveTimer.current) { window.clearTimeout(saveTimer.current); saveTimer.current = null; }
    const v = pending.current;
    if (!v) return;
    pending.current = null;
    savePatch({ validation: v }).then(ok => { if (!ok) toast.error("No se pudo guardar tu respuesta"); });
  }, [savePatch]);

  // Si sales de la página con algo sin guardar, lo guarda.
  useEffect(() => () => flush(), [flush]);

  const persist = (next: Validation, now = false) => {
    pending.current = next;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    if (now) flush();
    else saveTimer.current = window.setTimeout(flush, 700);
  };

  const answer = (id: string, value: Answer) => {
    const next: Answers = { ...answersRef.current, [id]: value };
    const completedAt = completedRef.current;
    answersRef.current = next;
    const allDone = QUESTIONS.every(q => q.id in next);
    const done = allDone ? (completedAt ?? new Date().toISOString()) : null;
    completedRef.current = done;
    setAnswers(next);
    setCompletedAt(done);
    // La nota se guarda para que el recorrido sepa si la oferta pasó (≥ 50) o hay que ajustarla.
    persist({ answers: next, completed_at: done, score: overallScore(next) }, allDone && !completedAt);
    if (allDone && !completedAt) {
      setEditing(false);
      const unsure = byAnswer(next, "nose").length;
      toast.success("¡Listo! Tu matriz está completa", {
        description: unsure ? `Te quedan ${unsure} puntos por comprobar. Míralos en tu resultado.` : "Mira tu resultado y tu siguiente paso.",
      });
      window.setTimeout(() => document.getElementById("sn-validation-matrix")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  };

  const reset = () => {
    if (!window.confirm("¿Borrar todas tus respuestas y empezar de nuevo?")) return;
    setAnswers({});
    setCompletedAt(null);
    setEditing(true);
    setRadar({ status: "idle" });
    persist({ answers: {}, completed_at: null, score: null }, true);
  };

  /** Lleva a otra pantalla; al Radar le pasa la palabra clave ya escrita. */
  const go = (page: string) => {
    if (!onNavigate) return;
    if (page === "Buscar Ofertas Winner" && keyword.trim().length >= 3) {
      try { localStorage.setItem(RADAR_PREFILL_KEY, keyword.trim()); } catch { /* sin almacenamiento: abre el Radar vacío */ }
    }
    flush();
    onNavigate(page);
  };

  /**
   * "Compruébalo por mí": busca en el catálogo anuncios con 30+ días con la palabra clave.
   * RPC radar_search (la misma del Radar): gratis, límite pequeño, nada de count exact ni select *.
   */
  const checkRadar = async (kwRaw?: string) => {
    const kw = (kwRaw ?? keyword).trim();
    if (kw.length < 3) { toast.error("Escribe al menos una palabra de 3 letras"); return; }
    if (kwRaw !== undefined) setKeyword(kw);
    setRadar({ status: "loading", kw });
    const { data, error } = await supabase.rpc("radar_search", {
      p_keyword: kw, p_markets: null, p_exclude_markets: null,
      p_min_score: 0, p_min_days: 30, p_min_dups: 0,
      p_sort: "days", p_offset: 0, p_limit: 10,
    });
    const r = data as { rows?: { page_name?: string; advertiser?: string; days_active?: number }[]; total?: number; capped?: boolean; error?: string } | null;
    if (error || !r || r.error) {
      const message = r?.error === "forbidden"
        ? "El Radar se abre con tu plan activo. Mientras tanto, responde con lo que sepas o marca «No sé»."
        : r?.error === "keyword_length"
          ? "Usa palabras de al menos 3 letras."
          : "No pudimos consultar el Radar ahora. Intenta de nuevo en unos segundos.";
      setRadar({ status: "error", kw, message });
      return;
    }
    const result = summarizeRadar(r);
    setRadar({ status: "done", kw, result });
    if (result.total > 0) answer("p_prueba_venta", "si");
  };

  const isEcom = profile.business_type === "ecommerce";
  const qText = (q: Question) => (isEcom && q.textEcom) || q.text;
  const qHow = (q: Question) => (isEcom && q.howEcom) || q.how;
  const qTip = (q: Question) => (isEcom && q.tipEcom) || q.tip;

  // Sugerencias de la ficha + lo que encontró el Radar. Nunca se marcan solas.
  const suggest = useMemo(() => {
    const s: Record<string, Suggestion> = suggestions(profile);
    if (radar.status === "done" && radar.result.advertisers >= 3) {
      s.m_competencia = { answer: "si", why: `En el Radar salen al menos ${radar.result.advertisers} anunciantes distintos con «${radar.kw}» y más de 30 días.` };
    }
    return s;
  }, [profile, radar]);

  const answered = QUESTIONS.filter(q => q.id in answers).length;
  const complete = answered === TOTAL;
  const score = useMemo(() => overallScore(answers), [answers]);
  const productScore = blockScore("producto", answers);
  const marketScore = blockScore("mercado", answers);

  if (!loaded || !ready) return <div className="text-sm text-muted-foreground p-6">Cargando…</div>;

  const header = (
    <PageHeader stage="Mi negocio · Etapa 2" title="Comprueba que se vende"
      icon={<ClipboardCheck className="w-5 h-5 text-primary shrink-0" />}
      line={`${TOTAL} preguntas: Sí, No o No sé. Cada una te dice cómo saberlo. Unos 3 minutos. Gratis.`}
      details={[
        "Debajo de cada pregunta está «Cómo saberlo»: una comprobación de 1 minuto. Si no estás seguro, marca «No sé»: es mejor que adivinar.",
        "«No sé» cuenta medio punto y queda en tu lista «Por comprobar».",
        "La pregunta del Radar se puede comprobar sola con anuncios reales: toca «Compruébalo por mí».",
        "Nota 75 o más: adelante · de 50 a 74: refuerza · menos de 50: cambia la oferta. Al final puedes imprimir tu matriz.",
      ]} />
  );

  if (!profileReady(profile)) {
    return (
      <div className="space-y-5 max-w-3xl">
        {header}
        <QuickBrief profile={profile} savePatch={savePatch} purpose="revisar si tu idea se vende" />
      </div>
    );
  }

  // ---------- Funciones de render (no componentes: evitan que React vuelva a montar todo) ----------

  const summary = (
    <div className="card-surface rounded-2xl px-4 py-3 text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">Tu negocio</span>
      <span className="text-foreground font-medium break-words min-w-0">{profile.product}</span>
      <span className="text-muted-foreground hidden sm:inline" aria-hidden>·</span>
      <span className="text-muted-foreground break-words min-w-0">para {profile.who}</span>
      <button onClick={() => go("Mi negocio")} className="ml-auto text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">Cambiar</button>
    </div>
  );

  const progressBar = (
    <div className="space-y-1.5" aria-live="polite">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{answered} de {TOTAL} respondidas</span>
        <span>{Math.round((answered / TOTAL) * 100)} %</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={TOTAL} aria-valuenow={answered} aria-label="Preguntas respondidas">
        <div className="h-full bg-foreground/70 transition-all" style={{ width: `${(answered / TOTAL) * 100}%` }} />
      </div>
    </div>
  );

  const pageLink = (page: string | undefined, label?: string) => page && onNavigate ? (
    <button onClick={() => go(page)}
      className="sn-no-print inline-flex items-center gap-1 text-xs font-medium text-foreground/80 hover:text-foreground underline-offset-2 hover:underline">
      {label ?? PAGE_LABEL[page] ?? page} <ArrowRight className="w-3 h-3" />
    </button>
  ) : null;

  /** Resultado de "Compruébalo por mí" en lenguaje simple. */
  const radarResult = () => {
    if (radar.status === "loading") {
      return <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando anuncios con «{radar.kw}»…</p>;
    }
    if (radar.status === "error") return <p className="text-xs text-muted-foreground">{radar.message}</p>;
    if (radar.status !== "done") return null;
    const { result, kw } = radar;
    if (result.total > 0) {
      return (
        <div className="text-xs leading-snug space-y-1">
          <p className="text-foreground">
            <Check className="inline w-3.5 h-3.5 mr-1 text-emerald-400" aria-hidden />
            Encontramos {result.capped ? "más de " : ""}{fmt(result.total)} {result.total === 1 ? "anuncio" : "anuncios"} con más de 30 días activos sobre «{kw}». Marcamos Sí.
          </p>
          {result.examples.length > 0 && (
            <p className="text-muted-foreground">Por ejemplo: {result.examples.map(e => `${e.name} · ${fmt(e.days)} días`).join(" — ")}.</p>
          )}
          {pageLink("Buscar Ofertas Winner", "Verlos en el Radar")}
        </div>
      );
    }
    const words = keywordWords(kw).length > 1 ? keywordWords(kw) : keywordWords(profile.product ?? "").filter(w => w !== kw);
    return (
      <div className="text-xs leading-snug space-y-1.5">
        <p className="text-foreground">No encontramos anuncios con más de 30 días sobre «{kw}». Prueba con otra palabra, más corta o más general.</p>
        {words.length > 0 && (
          <div className="flex flex-wrap gap-1.5 sn-no-print">
            <span className="text-muted-foreground self-center">Prueba con:</span>
            {words.slice(0, 4).map(w => (
              <button key={w} onClick={() => checkRadar(w)}
                className="rounded-full border border-border px-2.5 py-1 text-foreground/90 hover:border-foreground/40">{w}</button>
            ))}
          </div>
        )}
        <p className="text-muted-foreground">Si con 2 o 3 palabras distintas no aparece nada, lo honesto es marcar No.</p>
      </div>
    );
  };

  const radarBox = (
    <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
      <form className="flex flex-col sm:flex-row gap-2" onSubmit={e => { e.preventDefault(); checkRadar(); }}>
        <label htmlFor="sn-val-kw" className="sr-only">Palabra clave de tu producto</label>
        <input id="sn-val-kw" value={keyword} onChange={e => setKeyword(e.target.value)} maxLength={80}
          placeholder="Palabra clave (ej.: freidora, inglés, uñas)"
          className="flex-1 min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/30" />
        <button type="submit" disabled={radar.status === "loading"}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-foreground/30 px-3.5 py-2 text-sm font-medium text-foreground hover:bg-foreground/5 disabled:opacity-50">
          {radar.status === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Compruébalo por mí
        </button>
      </form>
      <p className="text-[11px] text-muted-foreground">Busca en los anuncios reales de nuestro catálogo. Gratis, no gasta créditos.</p>
      {radarResult()}
    </div>
  );

  const suggestionLine = (q: Question) => {
    const s = suggest[q.id];
    if (!s || answers[q.id] === s.answer) return null;
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="text-muted-foreground"><span className="text-foreground font-medium">Sugerencia: {ANSWER_LABEL[s.answer]}.</span> {s.why}</span>
        <button onClick={() => answer(q.id, s.answer)} className="rounded-full border border-border px-2.5 py-0.5 text-foreground/90 hover:border-foreground/40">
          Usar «{ANSWER_LABEL[s.answer]}»
        </button>
      </div>
    );
  };

  const answerButton = (q: Question, value: Answer) => {
    const on = answers[q.id] === value;
    const icon = value === "si" ? <Check className="w-4 h-4" /> : value === "no" ? <X className="w-4 h-4" /> : <CircleHelp className="w-4 h-4" />;
    const onColor = value === "si" ? "border-emerald-400/60 text-foreground bg-emerald-400/10"
      : value === "no" ? "border-red-400/60 text-foreground bg-red-400/10"
      : "border-foreground/40 text-foreground bg-foreground/10";
    return (
      <button onClick={() => answer(q.id, value)} aria-pressed={on}
        className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 ${on ? onColor : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"}`}>
        {icon} {ANSWER_LABEL[value]}
      </button>
    );
  };

  const questionCard = (q: Question, n: number) => {
    const v = answers[q.id];
    const extra = q.id === "p_frase" ? ` Tu frase: «${profile.product} para ${profile.who}».`
      : q.id === "p_precio_valor" && profile.price?.trim() ? ` Tu precio en la ficha: ${profile.price.trim()}.`
      : "";
    return (
      <li key={q.id} className="card-surface rounded-2xl p-4 space-y-3">
        <p id={`q-${q.id}`} className="text-sm sm:text-base text-foreground leading-snug font-medium">
          <span className="text-muted-foreground mr-1.5 tabular-nums font-normal">{n}.</span>{qText(q)}
        </p>
        <div className="text-xs text-muted-foreground leading-snug space-y-1">
          <p><span className="text-foreground/90 font-medium">Cómo saberlo: </span>{qHow(q)}{extra}</p>
          {q.id !== "p_prueba_venta" && pageLink(q.page)}
        </div>
        {q.id === "p_prueba_venta" && radarBox}
        {q.id === "m_competencia" && radar.status !== "done" && (
          <p className="text-xs text-muted-foreground">Tip: «Compruébalo por mí» en la pregunta 4 también te ayuda con esta.</p>
        )}
        {suggestionLine(q)}
        <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby={`q-${q.id}`}>
          {answerButton(q, "si")}
          {answerButton(q, "no")}
          {answerButton(q, "nose")}
        </div>
        {v === "no" && (
          <p className="text-xs text-muted-foreground leading-snug">
            <span className="text-foreground/90 font-medium">Cómo mejorarlo: </span>{qTip(q)}
          </p>
        )}
        {v === "nose" && (
          <p className="text-xs text-muted-foreground leading-snug">Quedó en tu lista «Por comprobar». Cuenta medio punto hasta que lo compruebes.</p>
        )}
      </li>
    );
  };

  const questionBlock = (block: Block, title: string, desc: string, offset: number) => {
    const qs = QUESTIONS.filter(q => q.block === block);
    const done = qs.filter(q => q.id in answers).length;
    return (
      <section className="space-y-3" aria-label={title}>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="font-display font-semibold text-lg text-foreground">{title}</h2>
            <p className="text-xs text-muted-foreground">{desc}</p>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">{done}/{qs.length}</span>
        </div>
        <ol className="space-y-3">{qs.map((q, i) => questionCard(q, offset + i + 1))}</ol>
      </section>
    );
  };

  const quadrant = (title: string, items: Question[], kind: "strong" | "weak", emptyText: string) => (
    <div className="sn-quad rounded-2xl border border-border p-4 space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
        {kind === "strong" ? <Check className="w-4 h-4 text-emerald-400" /> : <X className="w-4 h-4 text-red-400" />} {title}
        <span className="text-muted-foreground font-normal">({items.length})</span>
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map(q => (
            <li key={q.id} className="text-sm text-foreground leading-snug">
              {qText(q)}
              {kind === "weak" && (
                <div className="mt-1 space-y-1">
                  <p className="text-xs text-muted-foreground">{qTip(q)}</p>
                  {pageLink(q.page)}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const toCheck = byAnswer(answers, "nose");
  const toCheckList = toCheck.length > 0 && (
    <div className="sn-quad rounded-2xl border border-border p-4 space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
        <CircleHelp className="w-4 h-4 text-muted-foreground" /> Por comprobar <span className="text-muted-foreground font-normal">({toCheck.length})</span>
      </h3>
      <p className="text-xs text-muted-foreground">Respondiste «No sé». Cada comprobación toma 1 minuto; después vuelve y cambia tu respuesta.</p>
      <ul className="space-y-2.5">
        {toCheck.map(q => (
          <li key={q.id} className="text-sm text-foreground leading-snug">
            {qText(q)}{q.weight === 2 && <span className="ml-1.5 text-[11px] text-muted-foreground">(importante)</span>}
            <div className="mt-1 space-y-1">
              <p className="text-xs text-muted-foreground"><span className="text-foreground/90">Cómo saberlo: </span>{qHow(q)}</p>
              {pageLink(q.page)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );

  const scoreCard = () => {
    if (score === null) {
      return (
        <div className="card-surface rounded-2xl p-5 text-sm text-muted-foreground">
          Responde la primera pregunta y aquí verás cómo va tu oferta.
        </div>
      );
    }
    const vd = verdict(score, answers);
    // Sin terminar no hay veredicto: con 3 de 14 un "100/100 · Adelante" engaña (05-oct-2026).
    const color = !complete ? "text-foreground" : vd.tone === "good" ? "text-emerald-400" : vd.tone === "mid" ? "text-amber-400" : vd.tone === "bad" ? "text-red-400" : "text-foreground";
    const left = TOTAL - answered;
    return (
      <div className="card-surface rounded-2xl p-5 space-y-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {complete ? "Resultado" : `Resultado parcial · ${answered} de ${TOTAL}`}
        </p>
        <p className={`font-display font-bold text-4xl tabular-nums ${color}`}>{score}<span className="text-lg text-muted-foreground font-medium"> / 100</span></p>
        <p className="font-semibold text-foreground">{complete ? vd.title : `Te ${left === 1 ? "falta 1 pregunta" : `faltan ${left} preguntas`} para el veredicto`}</p>
        <p className="text-sm text-muted-foreground">{complete ? vd.text : "El resultado puede cambiar: termina todas las preguntas para verlo completo."}</p>
        <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
          <div className="rounded-lg border border-border px-3 py-2">
            <p className="text-muted-foreground">Producto (60 %)</p>
            <p className="text-foreground font-semibold tabular-nums">{productScore === null ? "—" : `${Math.round(productScore * 100)}/100`}</p>
          </div>
          <div className="rounded-lg border border-border px-3 py-2">
            <p className="text-muted-foreground">Mercado (40 %)</p>
            <p className="text-foreground font-semibold tabular-nums">{marketScore === null ? "—" : `${Math.round(marketScore * 100)}/100`}</p>
          </div>
        </div>
      </div>
    );
  };

  /** Un solo siguiente paso, el más importante. */
  const nextStepCard = () => {
    if (!complete || !onNavigate) return null;
    const ns = nextStep(answers);
    const primary = "inline-flex items-center gap-2 btn-primary-nova px-4 py-2.5 text-sm";
    const secondary = "inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-foreground hover:border-foreground/40";
    let title: string, text: string, main: { label: string; page: string }, alt: { label: string; page: string } | null = null;
    if (ns.kind === "fix") {
      title = "Primero arregla esto";
      text = `${qText(ns.question)} Respondiste No, y es de los puntos que más pesan. ${qTip(ns.question)}`;
      main = { label: PAGE_LABEL[ns.question.page ?? ""] ?? "Ajustar mi ficha", page: ns.question.page ?? "Mi negocio" };
      alt = { label: "Buscar otra oferta", page: "Ofertas" };
    } else if (ns.kind === "check") {
      title = "Primero comprueba esto";
      text = `${qText(ns.question)} — ${qHow(ns.question)}`;
      main = { label: PAGE_LABEL[ns.question.page ?? ""] ?? "Comprobarlo", page: ns.question.page ?? "Mi negocio" };
      alt = (score ?? 0) >= 50 ? { label: "Ponle precio igual", page: "Precio" } : null;
    } else if (ns.kind === "price") {
      title = "Siguiente paso: ponle precio";
      text = "Tu oferta pasa la matriz. Ahora mira cuánto te queda por venta antes de pagar anuncios.";
      main = { label: "Calcular mi precio", page: "Precio" };
    } else {
      title = "Siguiente paso: busca una oferta con más señales";
      text = "Hoy le faltan varias señales. Elegir otra oferta que ya se vende te ahorra dinero en anuncios.";
      main = { label: "Buscar otra oferta", page: "Ofertas" };
      alt = { label: "Ajustar mi ficha", page: "Mi negocio" };
    }
    return (
      <div className="sn-no-print rounded-2xl border border-primary/40 p-4 space-y-2">
        <p className="text-xs uppercase tracking-wider text-primary font-semibold">Tu siguiente paso</p>
        <p className="font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground leading-snug">{text}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button onClick={() => go(main.page)} className={primary}>{main.label} <ArrowRight className="w-4 h-4" /></button>
          {alt && <button onClick={() => go(alt.page)} className={secondary}>{alt.label}</button>}
          {ns.kind === "check" && (
            <button onClick={() => { setEditing(true); window.setTimeout(() => document.getElementById(`q-${ns.question.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); }}
              className="text-sm text-muted-foreground hover:text-foreground px-2 py-2">Ya lo comprobé: cambiar respuesta</button>
          )}
        </div>
      </div>
    );
  };

  const strong = (block: Block) => byAnswer(answers, "si", block);
  const weak = (block: Block) => byAnswer(answers, "no", block);

  const matrix = (
    <section id="sn-validation-matrix" className="space-y-4 scroll-mt-4" aria-label="Matriz de validación">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display font-semibold text-lg text-foreground">Tu matriz de validación</h2>
          <p className="text-xs text-muted-foreground break-words">
            {profile.product} · para {profile.who}
            {completedAt && ` · ${new Date(completedAt).toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" })}`}
          </p>
        </div>
        {complete && (
          <div className="sn-no-print flex flex-wrap gap-2">
            <button onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
              <Printer className="w-4 h-4" /> Imprimir matriz
            </button>
            {!editing && (
              <button onClick={() => setEditing(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
                <Pencil className="w-4 h-4" /> Editar respuestas
              </button>
            )}
          </div>
        )}
      </div>

      {scoreCard()}
      {nextStepCard()}

      {answered > 0 && (
        <div className="grid sm:grid-cols-2 gap-3">
          {quadrant("Fortalezas del producto", strong("producto"), "strong", "Todavía ninguna.")}
          {quadrant("Puntos débiles del producto", weak("producto"), "weak", "Ninguno por ahora. ¡Bien!")}
          {quadrant("Fortalezas del mercado", strong("mercado"), "strong", "Todavía ninguna.")}
          {quadrant("Puntos débiles del mercado", weak("mercado"), "weak", "Ninguno por ahora. ¡Bien!")}
        </div>
      )}
      {toCheckList}

      <p className="text-[11px] text-muted-foreground/80">
        Es una guía para decidir con más claridad, no una garantía de ventas. La prueba final siempre son los primeros anuncios.
        {toCheck.length > 0 && " Cada «No sé» cuenta medio punto: tu nota dice más cuando los compruebas."}
      </p>

      {complete && (
        <div className="sn-no-print flex flex-wrap items-center gap-2">
          <button onClick={reset} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground px-2 py-2">
            <RotateCcw className="w-3.5 h-3.5" /> Empezar de nuevo
          </button>
        </div>
      )}
    </section>
  );

  const productCount = QUESTIONS.filter(q => q.block === "producto").length;

  return (
    <div className="space-y-5 max-w-5xl">
      <style>{PRINT_CSS}</style>
      {header}
      {summary}

      {complete && !editing ? matrix : (
        <div className="grid lg:grid-cols-[1fr_380px] gap-5 items-start">
          <div className="space-y-6 min-w-0">
            {progressBar}
            {questionBlock("producto", "Tu producto", "¿Tiene lo que necesita para venderse?", 0)}
            {questionBlock("mercado", "Tu mercado", "¿Tu cliente y las plataformas lo acompañan?", productCount)}
            {complete && editing && (
              <button onClick={() => { flush(); setEditing(false); }}
                className="inline-flex items-center gap-2 btn-primary-nova px-4 py-2.5 text-sm">
                <Check className="w-4 h-4" /> Listo, ver mi matriz
              </button>
            )}
          </div>
          <div className="min-w-0 lg:sticky lg:top-4">{matrix}</div>
        </div>
      )}
    </div>
  );
}
