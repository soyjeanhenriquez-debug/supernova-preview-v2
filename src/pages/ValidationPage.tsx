import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, ClipboardCheck, Pencil, Printer, RotateCcw, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { toast } from "sonner";
import { profileReady, useBusinessProfile, type Validation } from "@/lib/businessProfile";
import { PageHeader } from "@/components/PageHeader";

/**
 * Etapa 2 del recorrido "Mi negocio": ¿esto se vende?
 * Inspirada en la "Matriz do Perpétuo" de Leandro Ladeira: preguntas de verdadero/falso que separan
 * fortalezas y puntos débiles del PRODUCTO y del MERCADO, y terminan en una matriz imprimible.
 * Adaptada a productos digitales, mini apps, cursos, afiliados y tiendas (ecommerce).
 * Sin IA: no gasta créditos. Se guarda en business_profile.validation (solo con savePatch).
 */

type Block = "producto" | "mercado";
type Question = {
  id: string;
  block: Block;
  text: string;
  /** Texto para tiendas de productos físicos (business_type === "ecommerce"). */
  textEcom?: string;
  /** Peso dentro de su bloque (1 normal, 2 importante). */
  weight: number;
  /** Consejo corto cuando la respuesta es "Falso". */
  tip: string;
  tipEcom?: string;
  /** Página de la app que ayuda a resolverlo. */
  page: string;
};

const QUESTIONS: Question[] = [
  // PRODUCTO
  { id: "p_problema", block: "producto", weight: 2, page: "Ofertas",
    text: "Resuelve un problema urgente o cumple un deseo fuerte (no es solo \"algo bonito de tener\").",
    tip: "La gente paga por dejar de sufrir algo o por lograr algo que desea mucho. Busca un ángulo más urgente." },
  { id: "p_tangible", block: "producto", weight: 1, page: "Mándala",
    text: "El resultado se puede ver o sentir: la persona sabe cuándo lo logró.",
    textEcom: "Se nota en una foto o un video corto cómo funciona y qué cambia al usarlo.",
    tip: "Convierte la promesa en algo concreto: qué tendrá, en cuánto tiempo, cómo lo notará.",
    tipEcom: "Si no se puede mostrar en uso, cuesta venderlo con anuncios. Piensa en cómo demostrarlo en 5 segundos." },
  { id: "p_frase", block: "producto", weight: 1, page: "Mándala",
    text: "Puedes explicar qué es y para quién es en una sola frase.",
    tip: "Si no cabe en una frase, el anuncio tampoco lo va a explicar. Simplifica la promesa." },
  { id: "p_prueba_venta", block: "producto", weight: 2, page: "Buscar Ofertas Winner",
    text: "Hay alguien vendiendo algo parecido con anuncios desde hace más de 30 días.",
    tip: "Un anuncio que sigue activo más de un mes suele ser señal de que vende. Busca esa prueba antes de invertir." },
  { id: "p_entrega", block: "producto", weight: 1, page: "Mini Apps",
    text: "Puedes entregarlo tú (o con ayuda de la IA) sin depender de otras personas.",
    textEcom: "Tienes un proveedor confiable y el envío llega en un tiempo razonable.",
    tip: "Empieza por una versión que puedas armar tú: una guía, una plantilla o una mini app.",
    tipEcom: "Pide muestras y compara proveedores antes de anunciar. Un envío lento trae reclamos y reembolsos." },
  { id: "p_giro", block: "producto", weight: 1, page: "Generadores",
    text: "Tu versión tiene una diferencia clara frente a lo que ya existe (tu giro).",
    tip: "No hace falta inventar nada: cambia el público, el formato, el bono o la forma de explicarlo." },
  { id: "p_testimonios", block: "producto", weight: 1, page: "Mi negocio",
    text: "Es fácil conseguir testimonios o pruebas reales de que funciona.",
    tip: "Dáselo gratis o con descuento a 3–5 personas a cambio de su opinión sincera. Nunca inventes testimonios." },
  { id: "p_precio_valor", block: "producto", weight: 1, page: "Precio",
    text: "El precio se siente pequeño comparado con lo que la persona gana o se ahorra.",
    tip: "Suma bonos, compáralo con lo que cuesta seguir con el problema o prueba otro precio." },
  { id: "p_escalera", block: "producto", weight: 1, page: "Mi negocio",
    text: "Después puedes venderle algo más a quien ya compró (otra parte, una versión mejor, una recompra).",
    textEcom: "Se puede vender en packs o combos, o la gente lo vuelve a comprar.",
    tip: "Piensa en un segundo producto o una versión premium: vender a quien ya confía en ti cuesta menos.",
    tipEcom: "Arma un pack de 2 o 3 unidades o un combo con un accesorio: sube lo que te queda por pedido." },

  // MERCADO
  { id: "m_dinero", block: "mercado", weight: 2, page: "Mi negocio",
    text: "Tu público tiene dinero para pagarlo y costumbre de comprar por internet.",
    textEcom: "Tu público tiene dinero para pagarlo y confía en comprar por internet (o puedes ofrecer pago contra entrega).",
    tip: "Revisa a quién le vendes: a veces el mismo producto funciona mejor para otro público con más poder de compra." },
  { id: "m_permitido", block: "mercado", weight: 2, page: "Hooks",
    text: "Se puede anunciar sin problemas: no es un tema muy regulado (salud con promesas, dinero fácil, apuestas…).",
    tip: "En temas delicados las plataformas rechazan anuncios o cierran cuentas. Cambia el ángulo a uno sin promesas médicas ni de ingresos." },
  { id: "m_alcance", block: "mercado", weight: 1, page: "Hooks",
    text: "Sabes dónde está ese público y puedes llegarle con anuncios o contenido.",
    tip: "Define sus intereses, qué ve y qué sigue. Si no lo sabes, empieza por ganchos que le hablen directo." },
  { id: "m_todo_el_ano", block: "mercado", weight: 1, page: "Ofertas",
    text: "Se compra todo el año, no solo en una temporada (Navidad, verano, regreso a clases…).",
    tip: "Una oferta de temporada puede servir, pero solo unas semanas. Para empezar, busca una que se venda siempre." },
  { id: "m_competencia", block: "mercado", weight: 1, page: "Buscar Ofertas Winner",
    text: "Hay varios vendiendo algo parecido (eso prueba que hay mercado), pero ninguno gigante que se quede con todo.",
    tip: "Cero competencia suele significar cero demanda; un solo gigante lo hace muy difícil. Busca un punto medio." },
];

const TOTAL = QUESTIONS.length;
const BLOCK_WEIGHT: Record<Block, number> = { producto: 0.6, mercado: 0.4 };

const PAGE_LABEL: Record<string, string> = {
  "Ofertas": "Ver ofertas",
  "Buscar Ofertas Winner": "Buscar ofertas winner",
  "Mini Apps": "Crear una mini app",
  "Precio": "Calcular el precio",
  "Mándala": "Abrir la Mándala",
  "Generadores": "Usar los generadores",
  "Hooks": "Ver ganchos",
  "Mi negocio": "Ir a Mi negocio",
};

/** Puntaje de un bloque: peso de los "Verdadero" / peso de lo respondido. null si no hay respuestas. */
function blockScore(block: Block, answers: Record<string, boolean>) {
  let yes = 0, total = 0;
  for (const q of QUESTIONS) {
    if (q.block !== block || !(q.id in answers)) continue;
    total += q.weight;
    if (answers[q.id]) yes += q.weight;
  }
  return total ? yes / total : null;
}

function overallScore(answers: Record<string, boolean>) {
  const p = blockScore("producto", answers);
  const m = blockScore("mercado", answers);
  if (p === null && m === null) return null;
  if (p === null) return Math.round((m ?? 0) * 100);
  if (m === null) return Math.round(p * 100);
  return Math.round((p * BLOCK_WEIGHT.producto + m * BLOCK_WEIGHT.mercado) * 100);
}

function verdict(score: number) {
  if (score >= 75) return { tone: "good" as const, title: "Adelante: tiene lo que necesita para vender", text: "Tu oferta pasa la prueba. Sigue con el precio y cuida los puntos débiles que queden." };
  if (score >= 50) return { tone: "mid" as const, title: "Se puede, pero refuerza estos puntos antes de invertir", text: "Hay base, pero los puntos débiles te pueden hacer gastar de más en anuncios. Trabájalos primero." };
  return { tone: "bad" as const, title: "Cambia de oferta o ajústala antes de gastar en anuncios", text: "Hoy le faltan señales importantes. Mejor ajustarla o elegir otra ahora que perder dinero después." };
}

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

export function ValidationPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { profile, loaded, savePatch } = useBusinessProfile();
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [ready, setReady] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const pending = useRef<Validation | null>(null);

  // Carga lo guardado una sola vez.
  useEffect(() => {
    if (!loaded || ready) return;
    const saved = profile.validation;
    if (saved?.answers) {
      const valid = Object.fromEntries(Object.entries(saved.answers).filter(([k, v]) => QUESTIONS.some(q => q.id === k) && typeof v === "boolean"));
      setAnswers(valid);
      setCompletedAt(saved.completed_at ?? null);
    }
    setReady(true);
  }, [loaded, ready, profile.validation]);

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

  const answer = (id: string, value: boolean) => {
    const next = { ...answers, [id]: value };
    const allDone = QUESTIONS.every(q => q.id in next);
    const done = allDone ? (completedAt ?? new Date().toISOString()) : null;
    setAnswers(next);
    setCompletedAt(done);
    // La nota se guarda para que el recorrido sepa si la oferta pasó (≥ 50) o hay que ajustarla.
    persist({ answers: next, completed_at: done, score: overallScore(next) }, allDone && !completedAt);
    if (allDone && !completedAt) {
      setEditing(false);
      const sc = overallScore(next) ?? 0;
      toast.success("¡Listo! Tu matriz está completa", sc >= 50 && onNavigate
        ? { description: "Siguiente paso: ponle precio.", action: { label: "Ir →", onClick: () => onNavigate("Precio") } }
        : { description: "Tu nota es baja: revisa los puntos débiles antes de seguir." });
      window.setTimeout(() => document.getElementById("sn-validation-matrix")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  };

  const reset = () => {
    if (!window.confirm("¿Borrar todas tus respuestas y empezar de nuevo?")) return;
    setAnswers({});
    setCompletedAt(null);
    setEditing(true);
    persist({ answers: {}, completed_at: null, score: null }, true);
  };

  const isEcom = profile.business_type === "ecommerce";
  const qText = (q: Question) => (isEcom && q.textEcom) || q.text;
  const qTip = (q: Question) => (isEcom && q.tipEcom) || q.tip;

  const answered = QUESTIONS.filter(q => q.id in answers).length;
  const complete = answered === TOTAL;
  const score = useMemo(() => overallScore(answers), [answers]);
  const productScore = blockScore("producto", answers);
  const marketScore = blockScore("mercado", answers);

  if (!loaded || !ready) return <div className="text-sm text-muted-foreground p-6">Cargando…</div>;

  const header = (
    <PageHeader stage="Mi negocio · Etapa 2" title="Comprueba que se vende"
      icon={<ClipboardCheck className="w-5 h-5 text-primary shrink-0" />}
      line={`${TOTAL} preguntas de sí o no. Unos 3 minutos. Gratis.`}
      details={["Responde con honestidad: verás qué tiene de fuerte tu producto y qué le falta.", "Nota 75 o más: adelante · de 50 a 74: refuerza · menos de 50: cambia la oferta.", "Al final puedes imprimir tu matriz."]} />
  );

  if (!profileReady(profile)) {
    return (
      <div className="space-y-5 max-w-3xl">
        {header}
        <div className="card-surface rounded-2xl p-6 space-y-3">
          <h2 className="font-display font-semibold text-lg text-foreground">Primero cuéntanos qué vas a vender</h2>
          <p className="text-sm text-muted-foreground">
            Para revisar si tu idea se vende necesitamos saber qué producto es, para quién es y qué resultado promete.
            Te toma un minuto y lo usamos en todas las herramientas.
          </p>
          <button onClick={() => onNavigate?.("Mi negocio")}
            className="inline-flex items-center gap-2 rounded-lg gradient-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground">
            Completar Mi negocio <ArrowRight className="w-4 h-4" />
          </button>
        </div>
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
      <button onClick={() => onNavigate?.("Mi negocio")} className="ml-auto text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">Cambiar</button>
    </div>
  );

  const progressBar = (
    <div className="space-y-1.5" aria-live="polite">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{answered} de {TOTAL} respondidas</span>
        <span>{Math.round((answered / TOTAL) * 100)}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={TOTAL} aria-valuenow={answered} aria-label="Preguntas respondidas">
        <div className="h-full bg-primary transition-all" style={{ width: `${(answered / TOTAL) * 100}%` }} />
      </div>
    </div>
  );

  const questionCard = (q: Question, n: number) => {
    const v = answers[q.id];
    const has = q.id in answers;
    return (
      <li key={q.id} className="card-surface rounded-2xl p-4 space-y-3">
        <p id={`q-${q.id}`} className="text-sm sm:text-base text-foreground leading-snug">
          <span className="text-muted-foreground mr-1.5 tabular-nums">{n}.</span>{qText(q)}
        </p>
        <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby={`q-${q.id}`}>
          <button onClick={() => answer(q.id, true)} aria-pressed={has && v === true}
            className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${has && v === true
              ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
              : "border-emerald-500/30 text-emerald-400/80 hover:bg-emerald-500/10"}`}>
            <ThumbsUp className="w-4 h-4" /> Verdadero
          </button>
          <button onClick={() => answer(q.id, false)} aria-pressed={has && v === false}
            className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 ${has && v === false
              ? "border-red-500 bg-red-500/20 text-red-300"
              : "border-red-500/30 text-red-400/80 hover:bg-red-500/10"}`}>
            <ThumbsDown className="w-4 h-4" /> Falso
          </button>
        </div>
        {has && v === false && (
          <p className="text-xs text-muted-foreground leading-snug">
            <span className="text-amber-400 font-medium">Cómo mejorarlo: </span>{qTip(q)}
          </p>
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
    <div className={`sn-quad rounded-2xl border p-4 space-y-2 ${kind === "strong" ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}>
      <h3 className={`text-sm font-semibold flex items-center gap-1.5 ${kind === "strong" ? "text-emerald-400" : "text-red-400"}`}>
        {kind === "strong" ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />} {title}
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
                  {onNavigate && (
                    <button onClick={() => onNavigate(q.page)}
                      className="sn-no-print inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                      {PAGE_LABEL[q.page] ?? q.page} <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const byAnswer = (block: Block, value: boolean) => QUESTIONS.filter(q => q.block === block && q.id in answers && answers[q.id] === value);

  const scoreCard = () => {
    if (score === null) {
      return (
        <div className="card-surface rounded-2xl p-5 text-sm text-muted-foreground">
          Responde la primera pregunta y aquí verás cómo va tu oferta.
        </div>
      );
    }
    const vd = verdict(score);
    const tone = vd.tone === "good" ? "border-emerald-500/40 bg-emerald-500/5" : vd.tone === "mid" ? "border-amber-500/40 bg-amber-500/5" : "border-red-500/40 bg-red-500/5";
    const color = vd.tone === "good" ? "text-emerald-400" : vd.tone === "mid" ? "text-amber-400" : "text-red-400";
    return (
      <div className={`rounded-2xl border p-5 space-y-2 ${tone}`}>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {complete ? "Resultado" : `Resultado parcial · ${answered} de ${TOTAL}`}
        </p>
        <p className={`font-display font-bold text-4xl tabular-nums ${color}`}>{score}<span className="text-lg text-muted-foreground font-medium"> / 100</span></p>
        <p className="font-semibold text-foreground">{vd.title}</p>
        <p className="text-sm text-muted-foreground">{complete ? vd.text : "El resultado puede cambiar: termina todas las preguntas para verlo completo."}</p>
        <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
          <div className="rounded-lg border border-border px-3 py-2">
            <p className="text-muted-foreground">Producto (60%)</p>
            <p className="text-foreground font-semibold tabular-nums">{productScore === null ? "—" : `${Math.round(productScore * 100)}/100`}</p>
          </div>
          <div className="rounded-lg border border-border px-3 py-2">
            <p className="text-muted-foreground">Mercado (40%)</p>
            <p className="text-foreground font-semibold tabular-nums">{marketScore === null ? "—" : `${Math.round(marketScore * 100)}/100`}</p>
          </div>
        </div>
        {complete && vd.tone === "bad" && onNavigate && (
          <button onClick={() => onNavigate("Ofertas")}
            className="sn-no-print mt-1 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-muted/40">
            Buscar otra oferta <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  };

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

      {answered > 0 && (
        <div className="grid sm:grid-cols-2 gap-3">
          {quadrant("Fortalezas del producto", byAnswer("producto", true), "strong", "Todavía ninguna.")}
          {quadrant("Puntos débiles del producto", byAnswer("producto", false), "weak", "Ninguno por ahora. ¡Bien!")}
          {quadrant("Fortalezas del mercado", byAnswer("mercado", true), "strong", "Todavía ninguna.")}
          {quadrant("Puntos débiles del mercado", byAnswer("mercado", false), "weak", "Ninguno por ahora. ¡Bien!")}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground/80">
        Es una guía para decidir con más claridad, no una garantía de ventas. La prueba final siempre son los primeros anuncios.
      </p>

      {complete && (
        <div className="sn-no-print flex flex-wrap items-center gap-2 pt-1">
          {onNavigate && (
            <button onClick={() => onNavigate("Precio")}
              className="inline-flex items-center gap-2 rounded-lg gradient-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground">
              Siguiente paso: ponle precio <ArrowRight className="w-4 h-4" />
            </button>
          )}
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
            {questionBlock("mercado", "Tu mercado", "¿El público y las plataformas lo acompañan?", productCount)}
            {complete && editing && (
              <button onClick={() => { flush(); setEditing(false); }}
                className="inline-flex items-center gap-2 rounded-lg gradient-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground">
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
