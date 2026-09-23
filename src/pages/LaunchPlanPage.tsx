import { useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarDays, Check, Plus, Printer, RotateCcw, Rocket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useBusinessProfile, type BusinessProfile, type LaunchPlan, type LaunchTask } from "@/lib/businessProfile";

/**
 * Etapa 4 del recorrido "Mi negocio": construye y lanza tu producto.
 * Inspirada en el "Planejamento do Produto" de Ladeira (tareas por fase, con responsable y fecha),
 * pero pensada para alguien que lo hace solo y con ayuda de la IA: el responsable siempre eres tú,
 * así que cada tarea solo lleva fecha. Unos 14 días, 30 a 60 minutos al día. Sin IA: no gasta créditos.
 * El plan se guarda en business_profile.launch_plan (solo con savePatch).
 */

// ---------- Fechas en hora local (nunca toISOString: en LATAM de noche daría "mañana") ----------
const pad = (n: number) => String(n).padStart(2, "0");
const toYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayYmd = () => toYmd(new Date());
const parseYmd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const addDays = (start: string, days: number) => {
  const d = parseYmd(start);
  d.setDate(d.getDate() + days);
  return toYmd(d);
};
const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const niceDate = (s: string) =>
  parseYmd(s).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" });

const newId = () => Math.random().toString(36).slice(2, 9);

// ---------- Plantillas ----------
type TemplateTask = { key: string; title: string; day: number; nav?: string };
type TemplateGroup = { name: string; nav?: string; tasks: TemplateTask[] };

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);

function buildTemplate(p: BusinessProfile): TemplateGroup[] {
  const product = clip(p.product.trim(), 60);
  const ecommerce = p.business_type === "ecommerce";
  const it = product ? `«${product}»` : "tu producto";

  const productGroup: TemplateGroup = ecommerce
    ? {
      name: "1. Tu producto",
      tasks: [
        { key: "promise", title: `Escribe en una frase qué problema resuelve ${it}`, day: 0 },
        { key: "suppliers", title: "Busca 2 o 3 proveedores y compara precio, calidad y tiempo de envío", day: 1 },
        { key: "sample", title: "Pide una muestra y pruébala tú mismo", day: 2 },
        { key: "photos", title: "Toma fotos y videos cortos del producto en uso", day: 6 },
        { key: "shipping", title: "Define envío, cambios y forma de pago (contra entrega si puedes)", day: 6 },
      ],
    }
    : {
      name: "1. Tu producto",
      nav: "Mini Apps",
      tasks: [
        { key: "promise", title: `Escribe en una frase qué logra la persona con ${it}`, day: 0 },
        { key: "prompt", title: "Genera las instrucciones en «Hacer mi versión»", day: 1, nav: "Mini Apps" },
        { key: "build", title: "Construye tu mini app con IA (Lovable, Claude…) siguiendo las instrucciones", day: 3 },
        { key: "test", title: "Pruébala tú y pídele a 2 personas que la usen", day: 5 },
        { key: "fix", title: "Ajusta lo que no se entendió o falló", day: 6 },
      ],
    };

  const pageGroup: TemplateGroup = ecommerce
    ? {
      name: "2. Tienda y cobro",
      nav: "Generadores",
      tasks: [
        { key: "price", title: "Confirma tu precio y cuánto te queda por pedido", day: 3, nav: "Precio" },
        { key: "store", title: "Crea la página del producto en tu tienda (Shopify u otra)", day: 7 },
        { key: "copy", title: "Escribe la descripción del producto con los Generadores", day: 7, nav: "Generadores" },
        { key: "faq", title: "Pon envío, cambios, garantía y preguntas frecuentes", day: 8 },
        { key: "testbuy", title: "Haz un pedido de prueba de principio a fin", day: 8 },
      ],
    }
    : {
      name: "2. Página y cobro",
      nav: "Generadores",
      tasks: [
        { key: "price", title: "Confirma tu precio y cuánto te queda por venta", day: 6, nav: "Precio" },
        { key: "checkout", title: "Crea el producto y el enlace de pago en Whop o Hotmart", day: 7 },
        { key: "copy", title: "Escribe tu página de venta con los Generadores", day: 7, nav: "Generadores" },
        { key: "faq", title: "Pon la garantía y las preguntas frecuentes", day: 8 },
        { key: "testbuy", title: "Haz una compra de prueba (y revisa que llegue el acceso)", day: 8 },
      ],
    };

  return [
    productGroup,
    pageGroup,
    {
      name: "3. Anuncios",
      nav: "Mándala",
      tasks: [
        { key: "ads", title: "Crea tus 5 anuncios en la Mándala", day: 9, nav: "Mándala" },
        { key: "creatives", title: "Prepara las imágenes o videos de cada anuncio", day: 10, nav: "Contenido" },
        { key: "pixel", title: "Configura tu cuenta publicitaria y el píxel (el código que avisa cuando alguien compra)", day: 10 },
        { key: "publish", title: "Publica los anuncios con un presupuesto bajo", day: 11 },
      ],
    },
    {
      name: "4. Lanzamiento",
      nav: "Contenido",
      tasks: [
        { key: "whatsapp", title: "Avisa a tus contactos por WhatsApp", day: 11 },
        { key: "organic", title: "Publica 3 contenidos orgánicos (sin pagar) sobre tu producto", day: 12, nav: "Contenido" },
        { key: "recovery", title: ecommerce ? "Activa la recuperación de carritos abandonados" : "Activa la recuperación de ventas", day: 13, nav: "Recuperar" },
        { key: "review", title: "A los 3 días, anota tus resultados y mira qué apagar o escalar", day: 14, nav: "Resultados" },
      ],
    },
  ];
}

/** Página de SUPERNOVA de cada tarea de la plantilla (por id) y de cada grupo (por nombre). */
function navMaps(p: BusinessProfile) {
  const byTask: Record<string, string> = {};
  const byGroup: Record<string, string> = {};
  for (const g of buildTemplate(p)) {
    if (g.nav) byGroup[g.name] = g.nav;
    for (const t of g.tasks) if (t.nav) byTask[`tpl-${t.key}`] = t.nav;
  }
  return { byTask, byGroup };
}

function createPlan(p: BusinessProfile, start: string): LaunchPlan {
  const tasks: LaunchTask[] = buildTemplate(p).flatMap(g =>
    g.tasks.map(t => ({ id: `tpl-${t.key}`, title: t.title, group: g.name, due: addDays(start, t.day), done: false })),
  );
  return { start, tasks };
}

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  .lp-print, .lp-print * { visibility: visible !important; }
  .lp-print { position: absolute; left: 0; top: 0; width: 100%; padding: 16px; }
  .lp-print * { color: #000 !important; background: transparent !important; box-shadow: none !important; border-color: #bbb !important; }
  .lp-noprint { display: none !important; }
  .lp-group { break-inside: avoid; }
  .lp-print input { border: none !important; padding: 0 !important; }
}`;

export function LaunchPlanPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { profile, loaded, savePatch } = useBusinessProfile();
  const [plan, setPlan] = useState<LaunchPlan | null>(null);
  const [ready, setReady] = useState(false);
  const [start, setStart] = useState(todayYmd());
  const [focusId, setFocusId] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  const pending = useRef<LaunchPlan | null | undefined>(undefined);
  const savePatchRef = useRef(savePatch);
  savePatchRef.current = savePatch;

  // Arranca con el plan guardado (una sola vez, cuando llega la ficha).
  useEffect(() => {
    if (!loaded || ready) return;
    setPlan(profile.launch_plan?.tasks ? profile.launch_plan : null);
    setReady(true);
  }, [loaded, ready, profile.launch_plan]);

  // Si se sale de la página con cambios sin guardar, los guarda igual.
  useEffect(() => () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    if (pending.current !== undefined) void savePatchRef.current({ launch_plan: pending.current });
  }, []);

  const flush = () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const next = pending.current;
    if (next === undefined) return;
    pending.current = undefined;
    savePatchRef.current({ launch_plan: next }).then(ok => { if (!ok) toast.error("No se pudo guardar tu plan"); });
  };

  // Guardado automático (0,8 s después del último cambio).
  const persist = (next: LaunchPlan | null, now = false) => {
    setPlan(next);
    pending.current = next;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    if (now) flush();
    else saveTimer.current = window.setTimeout(flush, 800);
  };

  if (!loaded || !ready) return <div className="text-sm text-muted-foreground p-6">Cargando…</div>;

  const ecommerce = profile.business_type === "ecommerce";
  const productName = profile.product.trim();
  const { byTask, byGroup } = navMaps(profile);

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wider text-primary font-semibold">Mi negocio · Etapa 4</p>
        <h1 className="font-display font-bold text-2xl text-foreground flex items-center gap-2">
          <Rocket className="w-5 h-5 text-primary shrink-0" /> Construye y lanza tu producto
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl mt-1">
          {productName
            ? <>Tu plan para lanzar <span className="text-foreground">«{clip(productName, 80)}»</span>, paso a paso y con fechas. </>
            : "Tu plan para lanzar, paso a paso y con fechas. "}
          Marca cada tarea cuando la termines. No gasta créditos.
        </p>
      </div>
    </div>
  );

  // ---------- Sin plan: explicación y fecha de inicio ----------
  if (!plan) {
    return (
      <div className="space-y-5 max-w-3xl">
        {header}
        <div className="card-surface rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-foreground font-semibold">
            <CalendarDays className="w-4 h-4 text-primary" /> Así funciona tu plan
          </div>
          <ul className="text-sm text-muted-foreground space-y-2 leading-relaxed">
            <li>• Son unos <span className="text-foreground">14 días</span>, con 30 a 60 minutos al día. Puedes ir más rápido o más lento.</li>
            <li>
              • Va en 4 partes:{" "}
              {ecommerce
                ? "consigues y pruebas tu producto, armas tu tienda y el cobro, preparas tus anuncios y lanzas."
                : "construyes tu producto con ayuda de la IA, armas tu página y el cobro, preparas tus anuncios y lanzas."}
            </li>
            <li>• Cada tarea tiene fecha. Puedes cambiarla, editar el texto, borrar tareas o añadir las tuyas.</li>
            <li>• Donde se puede, un enlace te lleva a la herramienta de SUPERNOVA que te ayuda con esa tarea.</li>
          </ul>
          {!productName && (
            <p className="text-xs text-amber-400">
              Consejo: si llenas primero tu ficha en Mi negocio, el plan usa el nombre de tu producto.
            </p>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              <span className="text-foreground font-medium">¿Cuándo empiezas?</span>
              <input type="date" value={start} onChange={e => setStart(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground [color-scheme:dark] focus:outline-none focus:border-primary/60" />
            </label>
            <button
              onClick={() => {
                const s = isYmd(start) ? start : todayYmd();
                persist(createPlan(profile, s), true);
                toast.success("Tu plan está listo", { description: "Empieza por la primera tarea de hoy." });
              }}
              className="inline-flex items-center gap-2 rounded-lg gradient-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground">
              <Rocket className="w-4 h-4" /> Armar mi plan
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Con plan ----------
  const today = todayYmd();
  const total = plan.tasks.length;
  const doneCount = plan.tasks.filter(t => t.done).length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  const overdue = plan.tasks.filter(t => !t.done && t.due && t.due < today).length;
  const groups = Array.from(new Set(plan.tasks.map(t => t.group)));

  const updateTask = (id: string, patch: Partial<LaunchTask>) =>
    persist({ ...plan, tasks: plan.tasks.map(t => (t.id === id ? { ...t, ...patch } : t)) });
  const removeTask = (id: string) => persist({ ...plan, tasks: plan.tasks.filter(t => t.id !== id) });
  const addTask = (group: string) => {
    const dues = plan.tasks.filter(t => t.group === group && t.due).map(t => t.due as string).sort();
    const due = dues.length ? (dues[dues.length - 1] < today ? today : dues[dues.length - 1]) : today;
    const t: LaunchTask = { id: newId(), title: "", group, due, done: false };
    // La nueva va justo después de la última tarea del grupo.
    let last = -1;
    plan.tasks.forEach((x, i) => { if (x.group === group) last = i; });
    const tasks = [...plan.tasks];
    tasks.splice(last + 1, 0, t);
    persist({ ...plan, tasks });
    setFocusId(t.id);
  };
  const resetPlan = () => {
    if (!window.confirm("¿Reiniciar el plan? Se borran tus tareas y fechas y vuelves a empezar.")) return;
    persist(null, true);
    setStart(todayYmd());
  };

  // Funciones de render (no componentes): así el input no se vuelve a montar y no pierde el foco al teclear.
  const goLink = (page: string) => onNavigate && (
    <button onClick={() => { flush(); onNavigate(page); }}
      className="lp-noprint inline-flex items-center gap-1 text-xs text-primary hover:underline">
      Hacerlo en SUPERNOVA <ArrowRight className="w-3 h-3" />
    </button>
  );

  const taskRow = (t: LaunchTask) => {
    const isToday = !t.done && t.due === today;
    const late = !t.done && !!t.due && t.due < today;
    const nav = byTask[t.id];
    return (
      <li key={t.id} className={`rounded-xl border px-3 py-2.5 ${late ? "border-amber-500/40 bg-amber-500/5" : "border-border"}`}>
        <div className="flex items-start gap-2.5">
          <button onClick={() => updateTask(t.id, { done: !t.done })} role="checkbox" aria-checked={t.done}
            aria-label={t.done ? "Marcar como pendiente" : "Marcar como hecha"}
            className={`mt-0.5 w-5 h-5 shrink-0 rounded-md border flex items-center justify-center transition-colors ${t.done ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/50 hover:border-primary"}`}>
            {t.done && <Check className="w-3.5 h-3.5" />}
          </button>
          <textarea value={t.title} rows={Math.max(1, Math.ceil(t.title.length / 40))} placeholder="Escribe la tarea…" aria-label="Tarea"
            autoFocus={focusId === t.id}
            onFocus={() => { if (focusId === t.id) setFocusId(null); }}
            onChange={e => updateTask(t.id, { title: e.target.value.replace(/\n/g, " ").slice(0, 200) })}
            className={`flex-1 min-w-0 resize-none bg-transparent text-sm leading-snug focus:outline-none [field-sizing:content] ${t.done ? "line-through text-muted-foreground" : "text-foreground"}`} />
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2 pl-7">
          <input type="date" value={t.due ?? ""} aria-label="Fecha"
            onChange={e => updateTask(t.id, { due: isYmd(e.target.value) ? e.target.value : null })}
            className={`rounded-md border border-border bg-background px-2 py-1 text-xs [color-scheme:dark] focus:outline-none focus:border-primary/60 ${late ? "text-amber-400" : "text-muted-foreground"}`} />
          {isToday && <span className="rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[11px] font-semibold">Hoy</span>}
          {late && <span className="rounded-full bg-amber-500/15 text-amber-400 px-2 py-0.5 text-[11px] font-semibold">Atrasada</span>}
          {nav && !t.done && goLink(nav)}
          <button onClick={() => removeTask(t.id)} aria-label="Borrar tarea"
            className="lp-noprint ml-auto p-1 text-muted-foreground hover:text-red-400">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </li>
    );
  };

  const groupCard = (g: string) => {
    const tasks = plan.tasks.filter(t => t.group === g);
    const gDone = tasks.filter(t => t.done).length;
    const nav = byGroup[g];
    return (
      <section key={g} className="lp-group card-surface rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-foreground">{g}</h2>
          <div className="flex items-center gap-3">
            {nav && gDone < tasks.length && goLink(nav)}
            <span className="text-xs text-muted-foreground tabular-nums">{gDone} de {tasks.length}</span>
          </div>
        </div>
        <ul className="space-y-2">{tasks.map(taskRow)}</ul>
        <button onClick={() => addTask(g)}
          className="lp-noprint inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
          <Plus className="w-3.5 h-3.5" /> Añadir tarea
        </button>
      </section>
    );
  };

  return (
    <div className="lp-print space-y-5 max-w-3xl">
      <style>{PRINT_CSS}</style>
      {header}

      <div className="card-surface rounded-2xl p-5 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm text-foreground font-semibold tabular-nums">{doneCount} de {total} tareas</p>
          <p className={`text-sm ${overdue ? "text-amber-400" : "text-emerald-400"}`}>
            {overdue ? `Tienes ${overdue} ${overdue === 1 ? "tarea atrasada" : "tareas atrasadas"}` : "Vas al día"}
          </p>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full gradient-brand transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">
          Empezaste el {niceDate(plan.start)}.{" "}
          {overdue ? "No pasa nada: cambia las fechas para que sean reales y sigue." : "Una tarea a la vez."}
        </p>
        <div className="lp-noprint flex flex-wrap gap-2 pt-1">
          <button onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
            <Printer className="w-3.5 h-3.5" /> Imprimir plan
          </button>
          <button onClick={resetPlan}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-red-400">
            <RotateCcw className="w-3.5 h-3.5" /> Reiniciar plan
          </button>
        </div>
      </div>

      {total > 0 && pct >= 80 && onNavigate && (
        <div className="lp-noprint card-surface rounded-2xl p-5 border border-primary/40 space-y-2">
          <p className="text-xs uppercase tracking-wider text-primary font-semibold">Siguiente paso: vende</p>
          <p className="text-sm text-muted-foreground">
            Ya casi terminas tu plan. Ahora toca poner tus anuncios a trabajar y mirar los números con calma.
          </p>
          <button onClick={() => { flush(); onNavigate("Mándala"); }}
            className="inline-flex items-center gap-2 rounded-lg gradient-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground">
            Ir a la Mándala <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {groups.map(groupCard)}

      {total === 0 && (
        <div className="card-surface rounded-2xl p-5 text-sm text-muted-foreground">
          Borraste todas las tareas. Usa «Reiniciar plan» para volver a empezar con la plantilla.
        </div>
      )}

      {onNavigate && (
        <div className="lp-noprint">
          <button onClick={() => { flush(); onNavigate("Dashboard"); }} className="text-sm text-muted-foreground hover:text-foreground">
            Volver al inicio
          </button>
        </div>
      )}
    </div>
  );
}
