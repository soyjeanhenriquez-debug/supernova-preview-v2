import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  ArrowRight, CalendarDays, Check, ChevronDown, Copy, ExternalLink, Loader2, Plus, Printer, RotateCcw, Rocket, Sparkles, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProducts } from "@/contexts/ProductContext";
import { useProjects } from "@/hooks/useProjects";
import { askAssist } from "@/lib/formAssist";
import { useBusinessProfile, type BusinessProfile, type LaunchPlan, type LaunchTask } from "@/lib/businessProfile";
import { useFeatureAccess } from "@/lib/features";

/**
 * Etapa 4 del recorrido "Mi negocio": construye y lanza tu producto.
 * Inspirada en el "Planejamento do Produto" de Ladeira (tareas por fase, con responsable y fecha),
 * pero pensada para alguien que lo hace solo y con ayuda de la IA: el responsable siempre eres tú,
 * así que cada tarea solo lleva fecha. Unos 14 días, 30 a 60 minutos al día.
 * Cada tarea se HACE aquí (espacio de trabajo al tocarla): lo escrito, los enlaces, las opiniones y los pasos
 * quedan en la tarea para poder guiar al usuario. La IA de ayuda (form-assist "launch-task") es gratis.
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

const BUILD_TITLE = "Construye tu mini app con la IA que uses para crear apps, siguiendo tus instrucciones";
// Con "Crear producto" (ebook o curso con IA) visible, el producto se crea dentro de SUPERNOVA.
const PROMPT_TITLE_OLD = "Genera las instrucciones en «Hacer mi versión»";
const PROMPT_TITLE_BUILDER = "Crea tu producto (ebook o curso) aquí mismo";

const newId = () => Math.random().toString(36).slice(2, 9);

// ---------- Plantillas ----------
type TemplateTask = { key: string; title: string; day: number; nav?: string };
type TemplateGroup = { name: string; nav?: string; tasks: TemplateTask[] };

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);

function buildTemplate(p: BusinessProfile, builder = false): TemplateGroup[] {
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
      nav: builder ? "Crear producto" : "Mini Apps",
      tasks: [
        { key: "promise", title: `Escribe en una frase qué logra la persona con ${it}`, day: 0 },
        builder
          ? { key: "prompt", title: PROMPT_TITLE_BUILDER, day: 1, nav: "Crear producto" }
          : { key: "prompt", title: PROMPT_TITLE_OLD, day: 1, nav: "Mini Apps" },
        { key: "build", title: BUILD_TITLE, day: 3 },
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
function navMaps(p: BusinessProfile, builder = false) {
  const byTask: Record<string, string> = {};
  const byGroup: Record<string, string> = {};
  for (const g of buildTemplate(p, builder)) {
    if (g.nav) byGroup[g.name] = g.nav;
    for (const t of g.tasks) if (t.nav) byTask[`tpl-${t.key}`] = t.nav;
  }
  return { byTask, byGroup };
}

function createPlan(p: BusinessProfile, start: string, builder = false): LaunchPlan {
  // La promesa ya escrita en la ficha no se vuelve a pedir: la tarea nace hecha y con ese texto.
  const promise = p.promise.trim();
  const tasks: LaunchTask[] = buildTemplate(p, builder).flatMap(g =>
    g.tasks.map(t => {
      const task: LaunchTask = { id: `tpl-${t.key}`, title: t.title, group: g.name, due: addDays(start, t.day), done: false };
      return t.key === "promise" && promise.length >= MIN_ANSWER ? { ...task, done: true, answer: promise, checks: { auto: true } } : task;
    }),
  );
  return { start, tasks };
}

// ---------- Cómo se hace cada tarea DENTRO de SUPERNOVA ----------
/**
 * write    → escribe el entregable aquí (con «Escribirlo con IA» / «Revisar con IA»).
 * tool     → se hace en otra herramienta de SUPERNOVA y se marca sola cuando hay datos.
 * link     → pega el enlace de lo que construiste (app, pago, página, tienda…).
 * feedback → anota lo que dijeron 2 personas y la IA te dice qué arreglar primero.
 * check    → mini lista de 2 a 4 pasos.
 * Las tareas que añade el usuario son «write».
 */
type Kind = "write" | "tool" | "link" | "feedback" | "check";
type Tool = { page: string; label: string };
type Spec = { kind: Kind; hint: string; placeholder?: string; steps?: string[]; tool?: Tool };

const KIND_LABEL: Record<Kind, string> = {
  write: "Escribir", tool: "En SUPERNOVA", link: "Pegar enlace", feedback: "Probar", check: "Pasos",
};

const TOOL_TASK: Record<string, Tool> = {
  prompt: { page: "Mini Apps", label: "Hacer mi versión" },
  price: { page: "Precio", label: "Calcular mi precio" },
  ads: { page: "Mándala", label: "Crear mis anuncios" },
  organic: { page: "Contenido", label: "Planear mis contenidos" },
  recovery: { page: "Recuperar", label: "Crear mis mensajes" },
  review: { page: "Resultados", label: "Anotar mis resultados" },
};

function templateSpec(key: string, ecommerce: boolean, builder = false): Spec | null {
  const tool = TOOL_TASK[key];
  if (key === "prompt" && builder && !ecommerce) {
    return { kind: "tool", tool: { page: "Crear producto", label: "Crear mi producto" }, hint: "Tu ebook o curso, escrito a partir de tu ficha." };
  }
  switch (key) {
    // --- Producto ---
    case "promise":
      return {
        kind: "write",
        hint: ecommerce ? "Una frase: qué problema resuelve y para quién." : "Una frase: qué consigue la persona y en cuánto tiempo.",
        placeholder: ecommerce ? "Ej.: Corrige tu postura sin esfuerzo desde el primer día" : "Ej.: Haz y vende tus primeros postres en 30 días",
      };
    case "prompt": return { kind: "tool", tool, hint: "SUPERNOVA te arma las instrucciones para crear tu app." };
    case "build": return { kind: "link", hint: "Crea tu app con estas instrucciones y pega aquí su enlace.", placeholder: "https://mi-app.com" };
    case "test": return { kind: "feedback", hint: "Que 2 personas la usen. Anota lo que te dijeron." };
    case "fix": return { kind: "write", hint: "Anota qué vas a cambiar, en orden.", placeholder: "- Poner un ejemplo en la primera pantalla\n- …" };
    case "suppliers": return { kind: "link", hint: "Compara 2 o 3 y pega el enlace del que elegiste.", placeholder: "https://…" };
    case "sample":
      return { kind: "check", hint: "Pruébalo antes de venderlo.", steps: ["Pide una muestra al proveedor elegido", "Mira cuánto tardó en llegar", "Úsala como lo haría tu cliente"] };
    case "photos":
      return { kind: "check", hint: "Fotos y videos con tu celular bastan.", steps: ["3 fotos del producto en uso, con luz natural", "2 videos cortos en vertical", "1 foto del producto solo, con fondo limpio"] };
    case "shipping": return { kind: "write", hint: "Envío, cambios y forma de pago, en frases cortas.", placeholder: "Envío gratis en 3 a 5 días…" };
    // --- Página / tienda y cobro ---
    case "price": return { kind: "tool", tool, hint: ecommerce ? "Calcula tu precio y cuánto te queda por pedido." : "Calcula tu precio y cuánto te queda por venta." };
    case "checkout": return { kind: "link", hint: "Crea tu producto en Whop, Hotmart o Stripe y pega el enlace de pago.", placeholder: "https://whop.com/…" };
    case "store": return { kind: "link", hint: "Crea la página del producto en tu tienda y pega su enlace.", placeholder: "https://mitienda.com/products/…" };
    case "copy":
      return ecommerce
        ? { kind: "write", hint: "La IA escribe la descripción. Ajústala y pégala en tu tienda.", placeholder: "La descripción de tu producto…" }
        : { kind: "link", hint: "Escribe tu página con IA, publícala y pega aquí su enlace.", placeholder: "https://mipagina.com" };
    case "faq":
      return {
        kind: "write",
        hint: ecommerce ? "Envío, cambios, garantía y 3 a 5 preguntas con su respuesta." : "Tu garantía y 3 a 5 preguntas con su respuesta.",
        placeholder: "Garantía: …\n¿Cómo accedo? …",
      };
    case "testbuy":
      return ecommerce
        ? { kind: "check", hint: "Compra como si fueras un cliente.", steps: ["Haz un pedido en tu propia tienda", "Revisa que llegó el correo de confirmación", "Confirma que el pedido llega al proveedor o a ti"] }
        : { kind: "check", hint: "Compra como si fueras un cliente.", steps: ["Compra tu propio producto con el enlace", "Revisa que llegó el acceso o el correo", "Pide el reembolso si quieres"] };
    // --- Anuncios ---
    case "ads": return { kind: "tool", tool, hint: "Crea 5 anuncios: 3 para vender y 2 para quien no compró." };
    case "creatives":
      return { kind: "check", hint: "Una imagen o video para cada anuncio.", steps: ["Elige para cada anuncio: imagen o video corto", "Grábalo o diséñalo en vertical y con buena luz", "Guarda cada pieza con el nombre de su anuncio"] };
    case "pixel":
      return { kind: "check", hint: "El píxel avisa a Meta cuando alguien compra.", steps: ["Crea tu cuenta publicitaria en Meta", "Instala el píxel en tu página", "Haz una visita de prueba y mira que el píxel la registre"] };
    case "publish":
      return { kind: "check", hint: "Poco dinero y paciencia.", steps: ["Presupuesto diario bajo e igual en tus 3 anuncios de venta", "Público amplio del país donde vendes", "No toques nada 3 días"] };
    // --- Lanzamiento ---
    case "whatsapp": return { kind: "write", hint: "Escribe el mensaje para tus contactos y envíalo.", placeholder: "¡Hola! Acabo de lanzar…" };
    case "organic": return { kind: "tool", tool, hint: "Publica 3 contenidos y márcalos como «publicado»." };
    case "recovery": return { kind: "tool", tool, hint: ecommerce ? "Crea tus mensajes para carritos abandonados." : "Crea tus mensajes para quien no terminó de comprar." };
    case "review": return { kind: "tool", tool, hint: "Anota gasto y ventas de cada anuncio." };
    default: return null;
  }
}

const WRITE_DEFAULT: Spec = { kind: "write", hint: "Escribe aquí lo que hiciste o lo que vas a hacer.", placeholder: "Escribe aquí…" };
const specFor = (t: LaunchTask, ecommerce: boolean, builder = false): Spec =>
  (t.id.startsWith("tpl-") ? templateSpec(t.id.slice(4), ecommerce, builder) : null) ?? WRITE_DEFAULT;

const isUrl = (s: string) => /^https?:\/\/[^\s.]+\.[^\s]{2,}$/i.test(s.trim());
const MIN_ANSWER = 15;
const MIN_OPINION = 10;

type Ads = { count: number; measured: boolean };
type AiState = { busy?: "sugerir" | "revisar" | "opiniones"; tip?: string; review?: string };

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  .lp-print, .lp-print * { visibility: visible !important; }
  .lp-print { position: absolute; left: 0; top: 0; width: 100%; padding: 16px; }
  .lp-print * { color: #000 !important; background: transparent !important; box-shadow: none !important; border-color: #bbb !important; }
  .lp-noprint { display: none !important; }
  .lp-group { break-inside: avoid; }
}`;

const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60";
const primaryBtn = "inline-flex items-center justify-center gap-2 rounded-lg gradient-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed";
const ghostBtn = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-foreground hover:border-primary/60 disabled:opacity-40 disabled:cursor-not-allowed";

export function LaunchPlanPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { user } = useAuth();
  const { activeId } = useProducts();
  const { profile, loaded, savePatch } = useBusinessProfile();
  const { projects } = useProjects();
  const [plan, setPlan] = useState<LaunchPlan | null>(null);
  const [ready, setReady] = useState(false);
  const [start, setStart] = useState(todayYmd());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [ai, setAi] = useState<Record<string, AiState>>({});
  const [ads, setAds] = useState<Ads | null>(null);
  const [published, setPublished] = useState<number | null>(null);
  const [hasBuiltProduct, setHasBuiltProduct] = useState(false);
  const { canSee, loading: accessLoading } = useFeatureAccess();
  const builder = canSee("Crear producto");
  const saveTimer = useRef<number | null>(null);
  const pending = useRef<LaunchPlan | null | undefined>(undefined);
  const planRef = useRef<LaunchPlan | null>(null);
  planRef.current = plan;
  const savePatchRef = useRef(savePatch);
  savePatchRef.current = savePatch;

  // Arranca con el plan guardado (una sola vez, cuando llega la ficha) y abre la primera tarea pendiente.
  useEffect(() => {
    if (!loaded || ready || accessLoading) return;
    const saved = profile.launch_plan?.tasks ? profile.launch_plan : null;
    // Planes viejos: el título de «build» nombraba herramientas concretas; el de «prompt» pasa a
    // "Crear producto" cuando está visible (no en tiendas: su plantilla no tiene esa tarea).
    const p = saved && {
      ...saved,
      tasks: saved.tasks.map(t => (
        t.id === "tpl-build" && /Lovable/.test(t.title) ? { ...t, title: BUILD_TITLE }
          : t.id === "tpl-prompt" && builder && t.title === PROMPT_TITLE_OLD ? { ...t, title: PROMPT_TITLE_BUILDER }
            : t
      )),
    };
    setPlan(p);
    setOpenId(p?.tasks.find(t => !t.done)?.id ?? null);
    setReady(true);
  }, [loaded, ready, accessLoading, builder, profile.launch_plan]);

  // Lo que el usuario ya hizo en otras herramientas (RLS: solo sus filas).
  useEffect(() => {
    if (!user || !activeId) return;
    let alive = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("mandala_ads").select("id,spend,sales,status").eq("product_id", activeId).limit(300)
      .then(({ data }: { data: { spend: number | null; sales: number | null; status: string }[] | null }) => {
        if (!alive) return;
        const list = data ?? [];
        setAds({ count: list.length, measured: list.some(a => a.spend != null || a.sales != null || a.status === "ganador" || a.status === "descartado") });
      });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("content_items").select("status").eq("product_id", activeId).eq("status", "publicado").limit(50)
      .then(({ data }: { data: { status: string }[] | null }) => { if (alive) setPublished((data ?? []).length); });
    // Un ebook o curso terminado en "Crear producto".
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("product_builds").select("status,pieces_done,pieces_total").eq("product_id", activeId).limit(30)
      .then(({ data }: { data: { status: string; pieces_done: number; pieces_total: number }[] | null }) => {
        if (alive) setHasBuiltProduct((data ?? []).some(b => b.status === "listo" || (b.pieces_total > 0 && b.pieces_done >= b.pieces_total)));
      });
    return () => { alive = false; };
  }, [user, activeId]);

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
    planRef.current = next;
    setPlan(next);
    pending.current = next;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    if (now) flush();
    else saveTimer.current = window.setTimeout(flush, 800);
  };

  // Siempre sobre el plan más reciente (las respuestas de la IA llegan después de que el usuario siguió escribiendo).
  const updateTask = (id: string, patch: Partial<LaunchTask> | ((t: LaunchTask) => Partial<LaunchTask>), now = false) => {
    const cur = planRef.current;
    if (!cur) return;
    persist({ ...cur, tasks: cur.tasks.map(t => (t.id === id ? { ...t, ...(typeof patch === "function" ? patch(t) : patch) } : t)) }, now);
  };

  // ---------- Detección automática: lo hecho en SUPERNOVA marca la tarea ----------
  const miniapp = projects
    .map(p => ({ p, text: (p.context as { miniapp?: unknown } | undefined)?.miniapp }))
    .filter((x): x is { p: typeof x.p; text: string } => typeof x.text === "string" && x.text.trim().length > 0)
    .sort((a, b) => (b.p.updatedAt || "").localeCompare(a.p.updatedAt || ""))[0] ?? null;
  const detected: Record<string, boolean> = {
    "tpl-promise": profile.promise.trim().length >= MIN_ANSWER,
    "tpl-prompt": !!miniapp || hasBuiltProduct,
    "tpl-build": hasBuiltProduct,
    "tpl-price": !!profile.pricing?.chosen,
    "tpl-ads": (ads?.count ?? 0) >= 5,
    "tpl-organic": (published ?? 0) >= 3,
    "tpl-recovery": !!profile.recovery?.messages?.length,
    "tpl-review": !!ads?.measured,
  };
  const detectedKey = Object.keys(detected).filter(k => detected[k]).join(",");

  // Una sola vez por tarea (checks.auto): si luego la desmarca a mano, no se vuelve a marcar.
  useEffect(() => {
    const cur = planRef.current;
    if (!ready || !cur || !detectedKey) return;
    const ids = new Set(detectedKey.split(","));
    const hit = cur.tasks.filter(t => ids.has(t.id) && !t.done && !t.checks?.auto);
    if (!hit.length) return;
    persist({
      ...cur,
      tasks: cur.tasks.map(t => (hit.includes(t) ? {
        ...t, done: true, checks: { ...t.checks, auto: true },
        // La promesa de la ficha se copia en la tarea si aún no escribió nada.
        ...(t.id === "tpl-promise" && !t.answer?.trim() ? { answer: profile.promise.trim().slice(0, 2000) } : {}),
      } : t)),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, plan, detectedKey]);

  if (!loaded || !ready) return <div className="text-sm text-muted-foreground p-6">Cargando…</div>;

  const ecommerce = profile.business_type === "ecommerce";
  const productName = profile.product.trim();
  const { byTask, byGroup } = navMaps(profile, builder);

  const go = (page: string) => { flush(); onNavigate?.(page); };

  const header = (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wider text-primary font-semibold">Mi negocio · Etapa 4</p>
      <h1 className="font-display font-bold text-2xl text-foreground flex items-center gap-2">
        <Rocket className="w-5 h-5 text-primary shrink-0" /> Construye y lanza tu producto
      </h1>
      <p className="text-sm text-muted-foreground max-w-2xl mt-1">
        {productName ? <>Lanza <span className="text-foreground">«{clip(productName, 60)}»</span> paso a paso. </> : "Lanza tu producto paso a paso. "}
        Cada tarea se hace aquí y queda guardada.
      </p>
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
            <li>• Unos <span className="text-foreground">14 días</span>, de 30 a 60 minutos al día.</li>
            <li>
              • 4 partes:{" "}
              {ecommerce
                ? "tu producto, tu tienda y el cobro, tus anuncios y el lanzamiento."
                : "tu producto, tu página y el cobro, tus anuncios y el lanzamiento."}
            </li>
            <li>• Cada tarea se hace aquí: escribes, pegas un enlace o marcas pasos. La IA te ayuda gratis.</li>
          </ul>
          {!productName && (
            <p className="text-xs text-amber-400">Consejo: llena primero tu ficha en Mi negocio y el plan usará tu producto.</p>
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
                const next = createPlan(profile, s, builder);
                persist(next, true);
                setOpenId(next.tasks[0]?.id ?? null);
                toast.success("Tu plan está listo", { description: "Empieza por la primera tarea." });
              }}
              className={primaryBtn}>
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

  const removeTask = (id: string) => {
    const cur = planRef.current;
    if (!cur) return;
    persist({ ...cur, tasks: cur.tasks.filter(t => t.id !== id) });
  };
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
    setOpenId(t.id);
    setFocusId(t.id);
  };
  const resetPlan = () => {
    if (!window.confirm("¿Reiniciar el plan? Se borran tus tareas, lo que escribiste y las fechas.")) return;
    persist(null, true);
    setStart(todayYmd());
    setAi({});
  };

  /** Guarda ya y abre la siguiente tarea pendiente. */
  const finish = (id: string, patch: Partial<LaunchTask> = {}) => {
    updateTask(id, { ...patch, done: true }, true);
    const tasks = planRef.current?.tasks ?? [];
    const i = tasks.findIndex(t => t.id === id);
    const next = [...tasks.slice(i + 1), ...tasks.slice(0, i)].find(t => !t.done);
    setOpenId(next?.id ?? null);
    toast.success("Guardado", { description: next ? "Sigue con la próxima tarea." : "¡Terminaste tu plan!" });
  };
  const nextPendingAfter = (id: string) => {
    const i = plan.tasks.findIndex(t => t.id === id);
    return [...plan.tasks.slice(i + 1), ...plan.tasks.slice(0, i)].find(t => !t.done) ?? null;
  };

  const setAiFor = (id: string, s: AiState | ((p: AiState) => AiState)) =>
    setAi(prev => ({ ...prev, [id]: typeof s === "function" ? s(prev[id] ?? {}) : s }));

  const runAi = async (t: LaunchTask, modo: "sugerir" | "revisar" | "opiniones") => {
    const texto = (t.answer ?? "").trim();
    if (modo === "sugerir" && texto && !window.confirm("¿Reemplazar lo que escribiste con la propuesta de la IA?")) return;
    // «Ajusta lo que falló»: la IA usa lo que dijeron las personas en la tarea de prueba.
    const opiniones = modo === "opiniones"
      ? (t.feedback ?? []).filter(Boolean)
      : t.id === "tpl-fix" ? (plan.tasks.find(x => x.id === "tpl-test")?.feedback ?? []).filter(Boolean) : [];
    const current: Record<string, unknown> = {
      modo: modo === "revisar" ? "revisar" : "sugerir",
      tarea: t.title,
      ...(modo !== "opiniones" ? { texto } : {}),
      ...(opiniones.length ? { opiniones } : {}),
    };
    setAiFor(t.id, p => ({ ...p, busy: modo, review: undefined }));
    try {
      const s = await askAssist("launch-task", current, t.title);
      const text = typeof s.text === "string" ? s.text.trim() : "";
      const tip = typeof s.tip === "string" ? s.tip.trim() : "";
      if (!text) throw new Error("La IA no devolvió nada. Prueba otra vez.");
      if (modo === "revisar") setAiFor(t.id, { tip, review: text });
      else {
        updateTask(t.id, { answer: text.slice(0, 2000) });
        setAiFor(t.id, { tip });
      }
    } catch (e) {
      setAiFor(t.id, p => ({ ...p, busy: undefined }));
      toast.error(e instanceof Error ? e.message : "No se pudo usar la IA");
    }
  };

  // ---------- Funciones de render (no componentes): así los campos no se vuelven a montar ni pierden el foco ----------
  const tipLine = (id: string) => {
    const tip = ai[id]?.tip;
    return tip ? (
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-px" /> {tip}
      </p>
    ) : null;
  };

  const aiBtn = (t: LaunchTask, modo: "sugerir" | "revisar" | "opiniones", label: string, disabled = false) => {
    const busy = ai[t.id]?.busy;
    return (
      <button onClick={() => void runAi(t, modo)} disabled={!!busy || disabled} className={ghostBtn}>
        {busy === modo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-primary" />}
        {busy === modo ? "Pensando…" : label}
      </button>
    );
  };

  const writeBody = (t: LaunchTask, spec: Spec) => {
    const text = t.answer ?? "";
    const review = ai[t.id]?.review;
    const enough = text.trim().length >= MIN_ANSWER;
    return (
      <>
        <textarea value={text} rows={4} placeholder={spec.placeholder} aria-label="Tu respuesta"
          onChange={e => updateTask(t.id, { answer: e.target.value.slice(0, 2000) })}
          className={`${inputCls} resize-y leading-relaxed min-h-[96px]`} />
        {tipLine(t.id)}
        {review && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
            <p className="text-xs font-semibold text-primary">Versión mejorada</p>
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{review}</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => { updateTask(t.id, { answer: review.slice(0, 2000) }); setAiFor(t.id, p => ({ ...p, review: undefined })); }}
                className={ghostBtn}><Check className="w-3.5 h-3.5" /> Usar esta versión</button>
              <button onClick={() => setAiFor(t.id, p => ({ ...p, review: undefined }))} className="text-xs text-muted-foreground hover:text-foreground px-2">
                Quedarme con la mía
              </button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {aiBtn(t, "sugerir", "Escribirlo con IA")}
          {text.trim() && aiBtn(t, "revisar", "Revisar con IA")}
        </div>
        {t.id === "tpl-promise" && enough && (
          <button onClick={() => savePatch({ promise: text.trim().slice(0, 300) }).then(ok =>
            ok ? toast.success("Guardada como tu promesa en Mi ficha") : toast.error("No se pudo guardar en tu ficha"))}
            className="text-xs text-primary hover:underline">
            Usar como promesa en Mi ficha
          </button>
        )}
        {t.id === "tpl-whatsapp" && enough && (
          <a href={`https://wa.me/?text=${encodeURIComponent(text.trim())}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            Enviarlo por WhatsApp <ExternalLink className="w-3 h-3" />
          </a>
        )}
        <button onClick={() => { if (t.done) { flush(); toast.success("Guardado"); } else finish(t.id); }} disabled={!enough} className={`${primaryBtn} w-full sm:w-auto`}>
          <Check className="w-4 h-4" /> {t.done ? "Guardar" : "Guardar y marcar hecha"}
        </button>
        {!enough && text.trim() && <p className="text-[11px] text-muted-foreground">Escribe un poco más para marcarla.</p>}
      </>
    );
  };

  const toolBody = (t: LaunchTask, spec: Spec) => {
    const isDetected = !!detected[t.id];
    const progress =
      t.id === "tpl-ads" && ads ? `Llevas ${Math.min(ads.count, 5)} de 5 anuncios.`
        : t.id === "tpl-organic" && published != null ? `Llevas ${Math.min(published, 3)} de 3 publicados.`
          : null;
    return (
      <>
        {isDetected
          ? <p className="text-sm font-semibold text-emerald-400">✓ Hecho en SUPERNOVA</p>
          : progress && <p className="text-xs text-muted-foreground tabular-nums">{progress}</p>}
        {spec.tool && onNavigate && (
          <button onClick={() => go(spec.tool!.page)} className={`${isDetected ? ghostBtn + " py-2.5 text-sm" : primaryBtn} w-full sm:w-auto`}>
            {isDetected ? "Ver en SUPERNOVA" : spec.tool.label} <ArrowRight className="w-4 h-4" />
          </button>
        )}
        {!t.done && (
          <button onClick={() => finish(t.id)} className="block text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
            Ya lo hice
          </button>
        )}
      </>
    );
  };

  const copyText = (text: string, ok: string) =>
    navigator.clipboard.writeText(text).then(() => toast.success(ok), () => toast.error("No se pudo copiar"));

  const buildExtras = () => miniapp ? (
    <details className="rounded-lg border border-border bg-background/40">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-foreground">
        Tus instrucciones · {clip(miniapp.p.name || "Mi versión", 40)}
      </summary>
      <div className="px-3 pb-3 space-y-2">
        <div className="prose prose-invert prose-sm max-w-none max-h-72 overflow-y-auto">
          <ReactMarkdown>{miniapp.text}</ReactMarkdown>
        </div>
        <button onClick={() => copyText(miniapp.text, "Instrucciones copiadas")} className={ghostBtn}>
          <Copy className="w-3.5 h-3.5" /> Copiar instrucciones
        </button>
      </div>
    </details>
  ) : onNavigate ? (
    <button onClick={() => go("Mini Apps")} className={ghostBtn}>
      <Sparkles className="w-3.5 h-3.5 text-primary" /> Generar mis instrucciones · Hacer mi versión
    </button>
  ) : null;

  const linkBody = (t: LaunchTask, spec: Spec) => {
    const link = t.link ?? "";
    const valid = isUrl(link);
    const save = () => {
      if (!valid) return;
      if (t.done) { flush(); toast.success("Enlace guardado"); } else finish(t.id, { link: link.trim() });
    };
    const storeUrl = profile.store_url.trim();
    return (
      <>
        {t.id === "tpl-build" && buildExtras()}
        {t.id === "tpl-copy" && !ecommerce && onNavigate && (
          <button onClick={() => {
            try { localStorage.setItem("supernova_generator_prefill", JSON.stringify({ generator: "landing-copy", text: "Página de venta de mi producto" })); } catch { /* sin almacenamiento */ }
            go("Generadores");
          }} className={ghostBtn}>
            <Sparkles className="w-3.5 h-3.5 text-primary" /> Escribir mi página con IA
          </button>
        )}
        <div className="flex gap-2">
          <input type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false}
            value={link} placeholder={spec.placeholder} aria-label="Enlace"
            onChange={e => updateTask(t.id, { link: e.target.value.trim().slice(0, 500) })}
            onKeyDown={e => { if (e.key === "Enter") save(); }}
            className={`${inputCls} min-w-0 flex-1`} />
          {valid && (
            <a href={link.trim()} target="_blank" rel="noopener noreferrer" className={`${ghostBtn} shrink-0`}>
              Abrir <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
        {link && !valid && <p className="text-[11px] text-amber-400">Pega el enlace completo. Empieza con https://</p>}
        {t.id === "tpl-store" && !link && isUrl(storeUrl) && (
          <button onClick={() => updateTask(t.id, { link: storeUrl })} className="text-xs text-primary hover:underline">
            Usar {clip(storeUrl.replace(/^https?:\/\//, ""), 40)}
          </button>
        )}
        <button onClick={save} disabled={!valid} className={`${primaryBtn} w-full sm:w-auto`}>
          <Check className="w-4 h-4" /> {t.done ? "Enlace guardado" : "Guardar enlace"}
        </button>
      </>
    );
  };

  const feedbackBody = (t: LaunchTask) => {
    const fb = t.feedback ?? [];
    const okCount = [0, 1].filter(i => (fb[i] ?? "").trim().length >= MIN_OPINION).length;
    const setOpinion = (i: number, v: string) => updateTask(t.id, cur => {
      const next = [...(cur.feedback ?? [])];
      while (next.length < 2) next.push("");
      next[i] = v.slice(0, 1000);
      const both = next.slice(0, 2).every(x => x.trim().length >= MIN_OPINION);
      return { feedback: next, done: cur.done || both };
    });
    return (
      <>
        {[0, 1].map(i => (
          <label key={i} className="block space-y-1">
            <span className="text-xs font-medium text-foreground">¿Qué dijo la persona {i + 1}?</span>
            <textarea value={fb[i] ?? ""} rows={2} placeholder="Qué entendió, qué le gustó, dónde se trabó…"
              onChange={e => setOpinion(i, e.target.value)} className={`${inputCls} resize-y`} />
          </label>
        ))}
        {aiBtn(t, "opiniones", "¿Qué arreglo primero? (IA)", okCount === 0)}
        {tipLine(t.id)}
        {t.answer && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
            <p className="text-xs font-semibold text-primary mb-1">Arregla primero</p>
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{t.answer}</p>
          </div>
        )}
        {t.done
          ? <p className="text-sm font-semibold text-emerald-400">✓ Listo</p>
          : <p className="text-[11px] text-muted-foreground tabular-nums">{okCount} de 2 opiniones</p>}
      </>
    );
  };

  const checkBody = (t: LaunchTask, spec: Spec) => {
    const steps = spec.steps ?? [];
    const nav = byTask[t.id];
    return (
      <>
        <ul className="space-y-1.5">
          {steps.map((s, i) => {
            const k = `s${i}`;
            const on = !!t.checks?.[k];
            return (
              <li key={k}>
                <button role="checkbox" aria-checked={on}
                  onClick={() => updateTask(t.id, cur => {
                    const checks = { ...(cur.checks ?? {}), [k]: !cur.checks?.[k] };
                    return { checks, done: steps.every((_, j) => checks[`s${j}`]) };
                  })}
                  className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-muted/40">
                  <span className={`mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center ${on ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/50"}`}>
                    {on && <Check className="w-3 h-3" />}
                  </span>
                  <span className={`text-sm leading-snug ${on ? "text-muted-foreground line-through" : "text-foreground"}`}>{s}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {t.done && <p className="text-sm font-semibold text-emerald-400">✓ Listo</p>}
        {nav && !t.done && onNavigate && (
          <button onClick={() => go(nav)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            Ayuda en SUPERNOVA <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </>
    );
  };

  const workspace = (t: LaunchTask, spec: Spec) => {
    const custom = !t.id.startsWith("tpl-");
    const late = !t.done && !!t.due && t.due < today;
    const next = t.done ? nextPendingAfter(t.id) : null;
    return (
      <div className="lp-noprint border-t border-border px-3 pb-3 pt-3 space-y-3">
        {custom && (
          <input value={t.title} placeholder="¿Qué tarea es?" aria-label="Tarea" autoFocus={focusId === t.id}
            onFocus={() => { if (focusId === t.id) setFocusId(null); }}
            onChange={e => updateTask(t.id, { title: e.target.value.replace(/\n/g, " ").slice(0, 200) })}
            className={inputCls} />
        )}
        <p className="text-sm text-foreground">{spec.hint}</p>
        {spec.kind === "write" && writeBody(t, spec)}
        {spec.kind === "tool" && toolBody(t, spec)}
        {spec.kind === "link" && linkBody(t, spec)}
        {spec.kind === "feedback" && feedbackBody(t)}
        {spec.kind === "check" && checkBody(t, spec)}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <input type="date" value={t.due ?? ""} aria-label="Fecha"
            onChange={e => updateTask(t.id, { due: isYmd(e.target.value) ? e.target.value : null })}
            className={`rounded-md border border-border bg-background px-2 py-1 text-xs [color-scheme:dark] focus:outline-none focus:border-primary/60 ${late ? "text-amber-400" : "text-muted-foreground"}`} />
          {next && (
            <button onClick={() => setOpenId(next.id)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              Siguiente tarea <ArrowRight className="w-3 h-3" />
            </button>
          )}
          <button onClick={() => { if (window.confirm("¿Borrar esta tarea?")) removeTask(t.id); }} aria-label="Borrar tarea"
            className="ml-auto p-1 text-muted-foreground hover:text-red-400">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  const taskRow = (t: LaunchTask) => {
    const spec = specFor(t, ecommerce, builder);
    const isToday = !t.done && t.due === today;
    const late = !t.done && !!t.due && t.due < today;
    const open = openId === t.id;
    return (
      <li key={t.id} className={`rounded-xl border ${open ? "border-primary/50 bg-background/40" : late ? "border-amber-500/40 bg-amber-500/5" : "border-border"}`}>
        <div className="flex items-start gap-2.5 px-3 py-2.5">
          <button onClick={() => updateTask(t.id, { done: !t.done })} role="checkbox" aria-checked={t.done}
            aria-label={t.done ? "Marcar como pendiente" : "Marcar como hecha"}
            className={`mt-0.5 w-5 h-5 shrink-0 rounded-md border flex items-center justify-center transition-colors ${t.done ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/50 hover:border-primary"}`}>
            {t.done && <Check className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => setOpenId(open ? null : t.id)} aria-expanded={open} className="flex-1 min-w-0 text-left">
            <span className={`block text-sm leading-snug ${t.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
              {t.title || <span className="text-muted-foreground italic">Tarea nueva</span>}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              {t.due && <span className={late ? "text-amber-400" : ""}>{niceDate(t.due)}</span>}
              <span className="lp-noprint">· {KIND_LABEL[spec.kind]}</span>
              {isToday && <span className="rounded-full bg-primary/15 text-primary px-2 py-0.5 font-semibold">Hoy</span>}
              {late && <span className="rounded-full bg-amber-500/15 text-amber-400 px-2 py-0.5 font-semibold">Atrasada</span>}
            </span>
          </button>
          <ChevronDown className={`lp-noprint mt-1 w-4 h-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
        {open && workspace(t, spec)}
      </li>
    );
  };

  const groupCard = (g: string) => {
    const tasks = plan.tasks.filter(t => t.group === g);
    const gDone = tasks.filter(t => t.done).length;
    const nav = byGroup[g];
    return (
      <section key={g} className="lp-group card-surface rounded-2xl p-3 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="font-semibold text-foreground">{g}</h2>
          <div className="flex items-center gap-3">
            {nav && gDone < tasks.length && onNavigate && (
              <button onClick={() => go(nav)} className="lp-noprint inline-flex items-center gap-1 text-xs text-primary hover:underline">
                {nav} <ArrowRight className="w-3 h-3" />
              </button>
            )}
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
          {overdue ? "No pasa nada: cambia las fechas y sigue." : "Una tarea a la vez."}
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
          <p className="text-sm text-muted-foreground">Ya casi terminas. Pon tus anuncios a trabajar y mira los números con calma.</p>
          <button onClick={() => go("Mándala")} className={primaryBtn}>
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
          <button onClick={() => go("Dashboard")} className="text-sm text-muted-foreground hover:text-foreground">
            Volver al inicio
          </button>
        </div>
      )}
    </div>
  );
}
