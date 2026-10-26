import { useCallback, useEffect, useMemo, useState } from "react";
import { toolEvent } from "@/lib/toolEvents";
import { ArrowRight, CalendarDays, CalendarRange, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Layers, Link2, List, Loader2, Minus, PenLine, Plus, Search, Sparkles, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProducts } from "@/contexts/ProductContext";
import { useBusinessProfile } from "@/lib/businessProfile";
import { PageHeader } from "@/components/PageHeader";
import { ParaPublicar } from "@/components/publicar/ParaPublicar";
import { isGenjutsuOwner } from "@/lib/genjutsuOwner";
import { ClaimBonusButton, PublishBonusCard } from "@/components/PublishBonus";
import { ToolFeedback } from "@/components/ToolFeedback";
import { CREDIT_COSTS, useCredits } from "@/hooks/useCredits";
import { fnErrorMessage, fnHeaders, readBilling } from "@/lib/fnAuth";
import { setSeed as setCreativeSeed } from "@/lib/creativeSeed";
import {
  DEFAULT_GOALS, EXTRA_NETWORKS, KINDS, NETWORK_LABEL, cleanChannels, freshChannels, kindFromPlatform, loadGoals, nextPiece, progressOf, publishAll, saveGoals, statusFromChannels, weekSummary,
  type Channels, type Goals, type Kind, type Network,
} from "@/lib/contentTracker";
import { seedFromProduct } from "@/lib/contentText";

/**
 * Etapa 5 del recorrido "Mi negocio": calendario de contenido orgánico.
 * Nuestra versión del "Minerador de Palavras-Chave" de Ladeira: temas con demanda REAL
 * (autocompletado de Google y YouTube, edge function content-ideas, gratis con tope por usuario),
 * cada pieza conectada a una etapa de la Mándala (Atraer / Conectar / Convertir), con plataforma,
 * fecha y estado. Las piezas se guardan en content_items (RLS: cada quien sus filas).
 *
 * Tracker de publicaciones (06-oct-2026): cada pieza tiene su tipo (video corto, largo, texto o
 * carrusel) y se publica en varias redes con un check y su enlace; guarda la palabra clave y los
 * leads y ventas que la persona anota. Arriba, "Tu semana" contra su meta. Todo gratis.
 *
 * Tu mes de contenido (07-oct-2026, decisión de Jean: 50 créditos): "Arma tu mes" llama a la edge
 * function content-month, que cobra en el servidor y guarda hasta 30 días de piezas (gancho, qué
 * decir, llamado a la acción y palabra clave) para Instagram y TikTok. Sirve para vender y para
 * marca personal. Cada pieza abre la herramienta que la produce con todo cargado.
 *
 * Que la gente publique (12-oct-2026): arriba "Hoy publica esto" con la pieza que toca, "Hacer esta
 * pieza" / "Ya lo publiqué" / "Pasar a mañana" y reagendar las atrasadas; la semana se navega con
 * un resumen de las próximas semanas; "Buscar ideas" parte del tema real del producto activo.
 */

type Stage = "atraer" | "conectar" | "convertir";
type Platform = "reels" | "tiktok" | "youtube" | "blog" | "whatsapp" | "shorts" | "threads" | "x" | "instagram";
type Status = "idea" | "guion" | "grabado" | "publicado";
type Item = {
  id: string; topic: string; title: string | null; stage: Stage; platform: Platform; status: Status;
  due: string | null; source: string | null; created_at: string;
  kind: Kind | null; channels: Channels; keyword: string | null; leads: number; sales: number;
  brief: string | null; cta: string | null; plan_id: string | null;
};
const COLS = "id,topic,title,stage,platform,status,due,source,created_at,kind,channels,keyword,leads,sales,brief,cta,plan_id";
const normalize = (r: Record<string, unknown>): Item => ({ ...(r as unknown as Item), kind: (r.kind as Kind) ?? kindFromPlatform(r.platform as string), channels: cleanChannels(r.channels), leads: Number(r.leads) || 0, sales: Number(r.sales) || 0 });
type Idea = { topic: string; title: string; stage: Stage; platform: Platform; why: string; source: string };
type SearchHit = { q: string; source: "google" | "youtube" };

// Mismos colores que la Mándala.
const STAGES: { id: Stage; label: string; color: string; desc: string }[] = [
  { id: "atraer", label: "Atraer", color: "#3B82F6", desc: "gente nueva que aún no te conoce" },
  { id: "conectar", label: "Conectar", color: "#A1A1AA", desc: "que confíen en ti" },
  { id: "convertir", label: "Convertir", color: "#8B5CF6", desc: "invitar a comprar, sin presión" },
];
const PLATFORMS: { id: Platform; label: string }[] = [
  { id: "reels", label: "Reels" }, { id: "tiktok", label: "TikTok" }, { id: "youtube", label: "YouTube" },
  { id: "blog", label: "Blog" }, { id: "whatsapp", label: "WhatsApp" },
];
const KIND_IDS = Object.keys(KINDS) as Kind[];
const STATUSES: { id: Status; label: string }[] = [
  { id: "idea", label: "Idea" }, { id: "guion", label: "Guion" }, { id: "grabado", label: "Grabado" }, { id: "publicado", label: "Publicado" },
];
const DAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Tu mes de contenido: opciones de "Personalizar" (todas opcionales).
type MonthGoal = "vender" | "marca" | "ambas";
type MonthNet = "instagram" | "tiktok";
const MONTH_GOALS: { id: MonthGoal; label: string; desc: string }[] = [
  { id: "marca", label: "Crecer mi marca personal", desc: "Que te conozcan y confíen en ti. Poca venta directa." },
  { id: "vender", label: "Vender mi producto", desc: "Más piezas que invitan a comprar, sin presión." },
  { id: "ambas", label: "Las dos", desc: "Marca personal y ventas en el mismo mes." },
];
const MONTH_FREQ = [3, 5, 7] as const;

// Tabla nueva, aún no está en los tipos generados de Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as any).from("content_items");

/** Fecha local como 'YYYY-MM-DD' (sin pasar por UTC). */
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = (d: Date) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -((x.getDay() + 6) % 7)); };
const prettyDate = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" });
const stageOf = (s: Stage) => STAGES.find(x => x.id === s) ?? STAGES[0];

export function ContentPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { user } = useAuth();
  const { activeId } = useProducts();
  const { profile, loaded } = useBusinessProfile();
  const [items, setItems] = useState<Item[]>([]);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [view, setView] = useState<"semana" | "lista">("semana");
  const [weekOffset, setWeekOffset] = useState(0);
  const [seed, setSeed] = useState("");
  const [seedTouched, setSeedTouched] = useState(false);
  const [platform, setPlatform] = useState<Platform | "">("");
  const [searching, setSearching] = useState(false);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [searches, setSearches] = useState<SearchHit[]>([]);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [manualTitle, setManualTitle] = useState("");
  const [manualKind, setManualKind] = useState<Kind>("corto");
  const [goals, setGoals] = useState<Goals>(DEFAULT_GOALS);
  const [editGoals, setEditGoals] = useState(false);
  const [linksOpen, setLinksOpen] = useState<string | null>(null);
  const [briefOpen, setBriefOpen] = useState<string | null>(null);
  // Tu mes de contenido
  const { applyServerCharge, canAfford } = useCredits();
  const [monthOpts, setMonthOpts] = useState(false);
  const [monthGoal, setMonthGoal] = useState<MonthGoal | null>(null);
  const [monthNets, setMonthNets] = useState<MonthNet[]>(["instagram", "tiktok"]);
  const [monthFreq, setMonthFreq] = useState<number>(5);
  const [monthFace, setMonthFace] = useState(true);
  const [monthBusy, setMonthBusy] = useState(false);
  const [lastPlan, setLastPlan] = useState<{ id: string; count: number; end: string } | null>(null);
  const [justPublished, setJustPublished] = useState<Item | null>(null);

  // El tema sale del producto ACTIVO ("ejercicio en casa", no "programa digital"). Al cambiar de
  // producto se vuelve a deducir y se limpian las ideas del producto anterior.
  const autoSeed = useMemo(() => seedFromProduct(profile.product, profile.who), [profile.product, profile.who]);
  useEffect(() => { setSeedTouched(false); setIdeas([]); setSearches([]); setAdded(new Set()); setJustPublished(null); }, [activeId]);
  useEffect(() => { if (loaded && !seedTouched) setSeed(autoSeed); }, [loaded, autoSeed, seedTouched]);

  const load = useCallback(async () => {
    if (!user || !activeId) return;
    const { data, error } = await table().select(COLS)
      .eq("user_id", user.id).eq("product_id", activeId).order("due", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }).limit(500);
    if (error) toast.error("No se pudo cargar tu calendario");
    setItems(((data ?? []) as Record<string, unknown>[]).map(normalize));
    setItemsLoaded(true);
  }, [user, activeId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (user && activeId) void loadGoals(user.id, activeId).then(setGoals); }, [user, activeId]);

  const today = useMemo(() => new Date(), []);
  const monday = useMemo(() => addDays(mondayOf(today), weekOffset * 7), [today, weekOffset]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => ymd(addDays(monday, i))), [monday]);
  const thisWeek = useMemo(() => { const m = mondayOf(today); return [ymd(m), ymd(addDays(m, 6))]; }, [today]);
  const week = weekSummary(items, thisWeek[0], thisWeek[1], goals);

  /** Próximos días libres desde hoy (1 pieza por día). */
  const nextFreeDays = (n: number, extraTaken: string[] = []) => {
    const taken = new Set([...items.map(i => i.due).filter(Boolean) as string[], ...extraTaken]);
    const out: string[] = [];
    for (let d = new Date(today); out.length < n; d = addDays(d, 1)) {
      const k = ymd(d);
      if (!taken.has(k)) { out.push(k); taken.add(k); }
    }
    return out;
  };

  const searchIdeas = async () => {
    const q = seed.trim().slice(0, 80);
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke<{ ideas?: Idea[]; searches?: SearchHit[]; error?: string }>("content-ideas", {
        body: { seed: q, platform: platform || undefined, product_id: activeId || undefined },
      });
      if (error || !data?.ideas) {
        // El cuerpo del error trae el mensaje en español (tope, sesión, etc.).
        let msg = data?.error;
        try { msg = msg ?? (await (error as { context?: Response })?.context?.json())?.error; } catch { /* sin cuerpo */ }
        toast.error(msg || "No se pudieron buscar ideas. Intenta de nuevo.");
        return;
      }
      setIdeas(data.ideas);
      setSearches(data.searches ?? []);
      setAdded(new Set());
      if (!data.searches?.length) toast.message(`No encontramos búsquedas de Google sobre "${q}"; estas ideas las armó la IA. Prueba con otras palabras de tu tema.`);
    } finally {
      setSearching(false);
    }
  };

  type NewRow = Omit<Item, "id" | "created_at" | "kind" | "channels" | "keyword" | "leads" | "sales" | "brief" | "cta" | "plan_id"> & { kind?: Kind };
  const insertItems = async (rows: NewRow[]) => {
    if (!user || !activeId || !rows.length) return false;
    const full = rows.map(r => { const k = r.kind ?? kindFromPlatform(r.platform); return { ...r, kind: k, channels: freshChannels(k), user_id: user.id, product_id: activeId }; });
    const { data, error } = await table().insert(full).select(COLS);
    if (error) { toast.error("No se pudo guardar en tu calendario"); return false; }
    setItems(prev => [...prev, ...((data ?? []) as Record<string, unknown>[]).map(normalize)].sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999")));
    return true;
  };

  const ideaRow = (idea: Idea, due: string) => ({
    topic: idea.topic.slice(0, 200) || idea.title.slice(0, 200), title: idea.title.slice(0, 200), stage: idea.stage,
    platform: idea.platform, status: "idea" as Status, due, source: idea.source.slice(0, 30),
  });

  const addIdea = async (idx: number) => {
    const [due] = nextFreeDays(1);
    if (await insertItems([ideaRow(ideas[idx], due)])) {
      setAdded(prev => new Set(prev).add(idx));
      toast.success(`Agregada para el ${prettyDate(due)}`);
    }
  };

  const addAll = async () => {
    const pending = ideas.map((idea, idx) => ({ idea, idx })).filter(x => !added.has(x.idx));
    if (!pending.length) return;
    const days = nextFreeDays(pending.length);
    if (await insertItems(pending.map((p, i) => ideaRow(p.idea, days[i])))) {
      setAdded(new Set(ideas.map((_, i) => i)));
      toast.success(`${pending.length} ideas en tu calendario, una por día`);
    }
  };

  const addManual = async () => {
    const t = manualTitle.trim().slice(0, 200);
    if (!t) return;
    const [due] = nextFreeDays(1);
    if (await insertItems([{ topic: t, title: t, stage: "atraer", platform: KINDS[manualKind].networks[0], kind: manualKind, status: "idea", due, source: "manual" }])) setManualTitle("");
  };

  const update = async (id: string, patch: Partial<Item>) => {
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)));
    const { error } = await table().update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error("No se pudo guardar el cambio"); load(); }
  };

  // ── Tracker: checks por red, enlaces, leads y ventas ──
  const today0 = ymd(new Date());
  const setChannels = (it: Item, ch: Channels) => update(it.id, { channels: ch, status: statusFromChannels(ch, it.status) as Status });
  const toggleNet = (it: Item, n: Network) => {
    const cur = it.channels[n] ?? {};
    const ch = { ...it.channels, [n]: { ...cur, done: !cur.done, ...(!cur.done ? { at: today0 } : {}) } };
    void setChannels(it, ch);
    if (!cur.done && progressOf(ch).done === progressOf(ch).total) toast.success("Publicada en todas sus redes", { description: "Cuando te escriban con tu palabra clave, súmalos aquí." });
  };
  const addNet = (it: Item, n: Network) => void setChannels(it, { ...it.channels, [n]: { done: false } });
  const removeNet = (it: Item, n: Network) => { const ch = { ...it.channels }; delete ch[n]; void setChannels(it, ch); };
  const setUrl = (it: Item, n: Network, url: string) => {
    const u = url.trim();
    if (u && !/^https:\/\/\S{4,300}$/.test(u)) { toast("Pega el enlace completo de la publicación (empieza con https://)."); return; }
    void setChannels(it, { ...it.channels, [n]: { ...(it.channels[n] ?? {}), ...(u ? { url: u, done: true, at: it.channels[n]?.at ?? today0 } : { url: undefined }) } });
  };
  const changeKind = (it: Item, k: Kind) => {
    // Al cambiar de tipo se conservan las redes ya marcadas y se agregan las de fábrica del tipo nuevo.
    const kept = Object.fromEntries(Object.entries(it.channels).filter(([, c]) => c?.done)) as Channels;
    void update(it.id, { kind: k, platform: KINDS[k].networks[0] as Platform, channels: { ...freshChannels(k), ...kept } });
  };
  const bump = (it: Item, field: "leads" | "sales", d: number) => void update(it.id, { [field]: Math.max(0, Math.min(100000, (it[field] || 0) + d)) } as Partial<Item>);
  const persistGoals = async (g: Goals) => { setGoals(g); if (user && activeId && !(await saveGoals(user.id, activeId, g))) toast.error("No se pudo guardar tu meta"); };

  /** "Ya lo publiqué": todas sus redes con check hoy. Si salió de SUPERNOVA, puede ganar el bono. */
  const markPublished = (it: Item) => {
    const ch = publishAll(it.channels, it.kind ?? "corto", today0);
    void update(it.id, { channels: ch, status: "publicado" });
    setJustPublished({ ...it, channels: ch, status: "publicado" });
    toast.success("¡Publicada!", { description: "Pega el enlace en cada red (ícono de cadena) y anota aquí a quienes te escriban." });
  };
  const moveTo = (it: Item, due: string) => { void update(it.id, { due }); toast(`Movida al ${prettyDate(due)}`); };
  /** Las atrasadas sin publicar pasan a los próximos días libres, una por día, desde hoy. */
  const rescheduleLate = async (late: Item[]) => {
    const others = items.filter(i => !late.some(l => l.id === i.id)).map(i => i.due).filter(Boolean) as string[];
    const taken = new Set(others);
    const days: string[] = [];
    for (let d = new Date(today); days.length < late.length; d = addDays(d, 1)) { const k = ymd(d); if (!taken.has(k)) { days.push(k); taken.add(k); } }
    await Promise.all(late.map((it, i) => update(it.id, { due: days[i] })));
    toast.success(`${late.length} piezas reagendadas, una por día desde hoy`);
  };

  const remove = async (id: string) => {
    const before = items;
    setItems(prev => prev.filter(i => i.id !== id));
    const { error } = await table().delete().eq("id", id);
    if (error) { toast.error("No se pudo borrar"); setItems(before); }
  };

  const writeScript = (it: Item) => {
    try {
      localStorage.setItem("supernova_generator_prefill", JSON.stringify({ generator: "reels-script", text: `${it.title ?? ""} — ${it.topic}` }));
    } catch { /* sin almacenamiento */ }
    if (it.status === "idea") update(it.id, { status: "guion" });
    onNavigate?.("Generadores");
  };

  // ── Tu mes de contenido ──
  // Sin producto con nombre se asume marca personal; si no, las dos. Siempre se puede cambiar.
  const deducedGoal: MonthGoal = profile.product.trim() ? "ambas" : "marca";
  const goalNow = monthGoal ?? deducedGoal;
  const buildMonth = async () => {
    if (!activeId || monthBusy) return;
    if (!canAfford("content_month")) {
      toast.error(`Te faltan créditos: armar tu mes cuesta ${CREDIT_COSTS.content_month}`, { description: "Recarga créditos o espera a que se renueven." });
      return;
    }
    setMonthBusy(true);
    toolEvent("mes-contenido", "empezar");
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/content-month`, {
        method: "POST", headers: await fnHeaders(),
        body: JSON.stringify({ product_id: activeId, goal: goalNow, networks: monthNets, per_week: monthFreq, face: monthFace, start: ymd(new Date()), seed: seedTouched ? seed : undefined }),
      });
      if (!resp.ok) throw new Error(await fnErrorMessage(resp, "No se pudo armar tu mes"));
      const data = await resp.json() as { plan_id: string; count: number; end: string; from_searches: number };
      applyServerCharge("content_month", readBilling(resp), `${data.count} piezas`);
      setLastPlan({ id: data.plan_id, count: data.count, end: data.end });
      toolEvent("mes-contenido", "resultado");
      setWeekOffset(0); setView("semana");
      await load();
      toast.success(`Listo: ${data.count} piezas hasta el ${prettyDate(data.end)}`, { description: data.from_searches ? `${data.from_searches} salen de lo que la gente busca en Google y YouTube.` : undefined });
    } catch (e) {
      toolEvent("mes-contenido", "error");
      toast.error(e instanceof Error ? e.message : "No se pudo armar tu mes");
    } finally {
      setMonthBusy(false);
    }
  };
  const removePlan = async (planId: string) => {
    const mine = items.filter(i => i.plan_id === planId);
    const touched = mine.filter(i => i.status !== "idea" || i.leads || i.sales || Object.values(i.channels).some(c => c?.done)).length;
    if (!window.confirm(`¿Borrar las ${mine.length} piezas de este mes?${touched ? ` ${touched} ya tienen avances y también se borran.` : ""} Los créditos no se devuelven.`)) return;
    const before = items;
    setItems(prev => prev.filter(i => i.plan_id !== planId));
    const { error } = await table().delete().eq("plan_id", planId);
    if (error) { toast.error("No se pudo borrar"); setItems(before); return; }
    if (lastPlan?.id === planId) setLastPlan(null);
  };
  /** Abre la herramienta que produce la pieza, con el gancho y el qué decir cargados. */
  const makePiece = (it: Item) => {
    const what = [it.brief, it.cta && `Cierre: ${it.cta}`, it.keyword && `Palabra clave: comenta ${it.keyword}`].filter(Boolean).join("\n");
    if (it.kind === "carrusel") {
      setCreativeSeed({
        source: "manual", target: "carrusel", title: (it.title ?? it.topic).slice(0, 80),
        product: profile.product, who: profile.who, promise: profile.promise, price: profile.price,
        hook: (it.title ?? "").slice(0, 140), angle: (it.brief ?? "").slice(0, 200),
      });
      if (it.status === "idea") void update(it.id, { status: "guion" });
      onNavigate?.("Carrusel");
      return;
    }
    try {
      localStorage.setItem("supernova_generator_prefill", JSON.stringify({ generator: "reels-script", text: `${it.title ?? ""}\n${what}`.trim().slice(0, 1500) }));
    } catch { /* sin almacenamiento */ }
    if (it.status === "idea") void update(it.id, { status: "guion" });
    onNavigate?.("Generadores");
  };

  // ── Funciones de render (no componentes): los inputs no se vuelven a montar al teclear ──
  const stageChip = (s: Stage, small?: boolean) => {
    const st = stageOf(s);
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border ${small ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-[11px]"} font-semibold`}
        style={{ color: st.color, borderColor: `${st.color}66`, background: `${st.color}1A` }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.color }} />{st.label}
      </span>
    );
  };

  const itemCard = (it: Item, compact: boolean) => (
    <div key={it.id} className={`rounded-xl border border-border bg-background/60 p-2.5 space-y-2 ${it.status === "publicado" ? "opacity-70" : ""}`}
      style={{ borderLeft: `3px solid ${stageOf(it.stage).color}` }}>
      <textarea key={`t-${it.id}`} defaultValue={it.title ?? ""} rows={compact ? 3 : 2} aria-label="Título"
        onBlur={e => { const v = e.target.value.trim().slice(0, 200); if (v !== (it.title ?? "")) update(it.id, { title: v }); }}
        className="w-full resize-none bg-transparent text-sm text-foreground leading-snug focus:outline-none focus:ring-1 focus:ring-primary/40 rounded" />
      {it.topic && it.topic !== it.title && <p className="text-[11px] text-muted-foreground leading-snug">🔎 {it.topic}</p>}
      {(it.brief || it.cta) && (
        <div>
          <button type="button" onClick={() => setBriefOpen(v => (v === it.id ? null : it.id))} aria-expanded={briefOpen === it.id}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
            <ChevronDown className={`w-3 h-3 transition-transform ${briefOpen === it.id ? "rotate-180" : ""}`} /> Qué decir
          </button>
          {briefOpen === it.id && (
            <div className="mt-1 space-y-1 text-[11px] leading-snug text-muted-foreground">
              {it.brief && <ul className="list-disc pl-4 space-y-0.5">{it.brief.split(" · ").map((b, i) => <li key={i}>{b}</li>)}</ul>}
              {it.cta && <p><span className="text-foreground">Cierre:</span> {it.cta}</p>}
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <select value={it.stage} onChange={e => update(it.id, { stage: e.target.value as Stage })} aria-label="Etapa"
          className="rounded-md border px-1.5 py-1 text-[11px] font-semibold bg-background"
          style={{ color: stageOf(it.stage).color, borderColor: `${stageOf(it.stage).color}66` }}>
          {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select value={it.kind ?? "corto"} onChange={e => changeKind(it, e.target.value as Kind)} aria-label="Tipo de pieza"
          className="rounded-md border border-border bg-background px-1.5 py-1 text-[11px] text-muted-foreground">
          {KIND_IDS.map(k => <option key={k} value={k}>{KINDS[k].label}</option>)}
        </select>
        <select value={it.status} onChange={e => update(it.id, { status: e.target.value as Status })} aria-label="Estado"
          className={`rounded-md border px-1.5 py-1 text-[11px] bg-background ${it.status === "publicado" ? "border-emerald-500/50 text-emerald-400" : "border-border text-foreground"}`}>
          {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>
      {/* Dónde se publica: un check por red */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1">
          {(Object.keys(it.channels) as Network[]).map(n => {
            const c = it.channels[n] ?? {};
            return (
              <button key={n} type="button" onClick={() => toggleNet(it, n)} aria-pressed={!!c.done} title={c.done ? "Publicado. Toca para desmarcar." : "Toca cuando lo publiques"}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${c.done ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400" : "border-border text-muted-foreground hover:text-foreground"}`}>
                {c.done ? <Check className="w-3 h-3" /> : <span className="w-2.5 h-2.5 rounded-full border border-current" />}{NETWORK_LABEL[n]}
              </button>
            );
          })}
          {EXTRA_NETWORKS[it.kind ?? "corto"].filter(n => !it.channels[n]).map(n => (
            <button key={n} type="button" onClick={() => addNet(it, n)} className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground">
              <Plus className="w-2.5 h-2.5" />{NETWORK_LABEL[n]}
            </button>
          ))}
          <button type="button" onClick={() => setLinksOpen(v => (v === it.id ? null : it.id))} aria-label="Enlaces de las publicaciones"
            className="ml-auto p-1 text-muted-foreground hover:text-foreground"><Link2 className="w-3.5 h-3.5" /></button>
        </div>
        {(() => { const p = progressOf(it.channels); return p.total > 0 && <p className="text-[10px] text-muted-foreground">{p.done} de {p.total} redes publicadas</p>; })()}
        <ClaimBonusButton item={it} />
        {linksOpen === it.id && (
          <div className="space-y-1">
            {(Object.keys(it.channels) as Network[]).map(n => (
              <div key={n} className="flex items-center gap-1.5">
                <span className="w-16 shrink-0 text-[10px] text-muted-foreground">{NETWORK_LABEL[n]}</span>
                <input key={`u-${it.id}-${n}`} defaultValue={it.channels[n]?.url ?? ""} placeholder="https://…" aria-label={`Enlace en ${NETWORK_LABEL[n]}`}
                  onBlur={e => { if (e.target.value.trim() !== (it.channels[n]?.url ?? "")) setUrl(it, n, e.target.value); }}
                  className="flex-1 min-w-0 rounded-md border border-border bg-background px-1.5 py-1 text-[11px] text-foreground focus:outline-none focus:border-primary/60" />
                <button type="button" onClick={() => removeNet(it, n)} aria-label={`Quitar ${NETWORK_LABEL[n]}`} className="p-0.5 text-muted-foreground hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Lo que trae: palabra clave, leads y ventas (solo lo que anotes) */}
      <div className="flex flex-wrap items-center gap-1.5">
        <input key={`k-${it.id}`} defaultValue={it.keyword ?? ""} maxLength={30} placeholder="Palabra clave" aria-label="Palabra clave"
          onBlur={e => { const v = e.target.value.replace(/[^\p{L}\p{N} ]/gu, "").toLocaleUpperCase("es").trim().slice(0, 30); if (v !== (it.keyword ?? "")) update(it.id, { keyword: v || null }); }}
          className="w-28 rounded-md border border-border bg-background px-1.5 py-1 text-[11px] text-foreground uppercase focus:outline-none focus:border-primary/60" />
        {(["leads", "sales"] as const).map(f => (
          <span key={f} className="inline-flex items-center gap-1 rounded-md border border-border px-1 py-0.5 text-[11px] text-muted-foreground" title={f === "leads" ? "Personas que te escribieron por esta pieza" : "Ventas que salieron de esta pieza"}>
            <button type="button" onClick={() => bump(it, f, -1)} aria-label={`Restar ${f === "leads" ? "lead" : "venta"}`} className="p-0.5 hover:text-foreground"><Minus className="w-3 h-3" /></button>
            <span className="tabular-nums text-foreground">{it[f]}</span> {f === "leads" ? "te escribieron" : "compraron"}
            <button type="button" onClick={() => bump(it, f, 1)} aria-label={`Sumar ${f === "leads" ? "lead" : "venta"}`} className="p-0.5 hover:text-foreground"><Plus className="w-3 h-3" /></button>
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <input type="date" value={it.due ?? ""} onChange={e => update(it.id, { due: e.target.value || null })} aria-label="Fecha"
          className="rounded-md border border-border bg-background px-1.5 py-1 text-[11px] text-muted-foreground min-w-0" />
        {it.plan_id ? (
          <button onClick={() => makePiece(it)} title={it.kind === "carrusel" ? "Abre el Carrusel con este gancho" : "Abre el guion de Reels con este gancho"}
            className="inline-flex items-center gap-1 rounded-md border border-primary/40 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10">
            {it.kind === "carrusel" ? <Layers className="w-3 h-3" /> : <PenLine className="w-3 h-3" />} Hacer esta pieza
          </button>
        ) : (
          <button onClick={() => writeScript(it)} className="inline-flex items-center gap-1 rounded-md border border-primary/40 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10">
            <PenLine className="w-3 h-3" /> Escribir guion
          </button>
        )}
        {it.status !== "publicado" && (
          <button type="button" onClick={() => markPublished(it)} title="Marca todas sus redes como publicadas hoy"
            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 px-2 py-1 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/10">
            <CheckCircle2 className="w-3 h-3" /> Ya lo publiqué
          </button>
        )}
        <button onClick={() => remove(it.id)} className="ml-auto p-1 text-muted-foreground hover:text-red-400" aria-label="Borrar"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );

  /** Piezas con fecha dentro de la semana que empieza en `off` semanas desde la actual. */
  const weekRange = (off: number) => { const m = addDays(mondayOf(today), off * 7); return [ymd(m), ymd(addDays(m, 6))] as const; };
  const countWeek = (off: number) => { const [a, b] = weekRange(off); return items.filter(i => i.due && i.due >= a && i.due <= b).length; };
  const weekLabel = (off: number) => (off === 0 ? "Esta semana" : off === 1 ? "La próxima" : off === -1 ? "La pasada" : new Date(`${weekRange(off)[0]}T12:00:00`).toLocaleDateString("es", { day: "numeric", month: "short" }));

  const weekView = () => {
    const [from, to] = weekRange(weekOffset);
    const inWeek = items.filter(i => i.due && i.due >= from && i.due <= to).length;
    const after = items.filter(i => i.due && i.due > to).sort((a, b) => (a.due as string).localeCompare(b.due as string))[0];
    const goTo = (due: string) => setWeekOffset(Math.round((mondayOf(new Date(`${due}T12:00:00`)).getTime() - mondayOf(today).getTime()) / (7 * 86_400_000)));
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => setWeekOffset(w => w - 1)} className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground" aria-label="Semana anterior"><ChevronLeft className="w-4 h-4" /></button>
          <div className="text-center min-w-0">
            <p className="text-sm text-foreground font-medium">
              {weekOffset === 0 ? "Esta semana" : weekOffset === 1 ? "La próxima semana" : weekOffset === -1 ? "La semana pasada" : `Semana del ${prettyDate(weekDays[0])}`}
              <span className="text-muted-foreground font-normal"> · {inWeek} {inWeek === 1 ? "pieza" : "piezas"}</span>
            </p>
            <p className="text-[11px] text-muted-foreground">{prettyDate(weekDays[0])} – {prettyDate(weekDays[6])}
              {weekOffset !== 0 && <button type="button" onClick={() => setWeekOffset(0)} className="ml-2 text-primary hover:underline">Volver a hoy</button>}
            </p>
          </div>
          <button onClick={() => setWeekOffset(w => w + 1)} className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground" aria-label="Semana siguiente"><ChevronRight className="w-4 h-4" /></button>
        </div>
        {/* Las próximas semanas de un vistazo: así se ve lo agendado más adelante */}
        <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Semanas">
          {[0, 1, 2, 3, 4].map(off => {
            const n = countWeek(off);
            return (
              <button key={off} type="button" role="tab" aria-selected={weekOffset === off} onClick={() => setWeekOffset(off)}
                className={`shrink-0 rounded-full border px-3 py-1 text-[11px] ${weekOffset === off ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                {weekLabel(off)} · <span className="tabular-nums">{n}</span>
              </button>
            );
          })}
        </div>
        {!inWeek && (
          <div className="rounded-xl border border-dashed border-border p-3 text-[12px] text-muted-foreground flex flex-wrap items-center gap-2">
            Nada agendado esta semana.
            {after && <button type="button" onClick={() => goTo(after.due as string)} className="inline-flex items-center gap-1 text-primary hover:underline">Ver tu próxima pieza ({prettyDate(after.due as string)}) <ArrowRight className="w-3 h-3" /></button>}
          </div>
        )}
        <div className="grid gap-2 lg:grid-cols-7">
          {weekDays.map((d, i) => {
            const dayItems = items.filter(it => it.due === d);
            const isToday = d === ymd(today);
            return (
              <div key={d} className={`rounded-xl border p-2 min-h-[90px] space-y-2 ${isToday ? "border-primary/60 bg-primary/5" : "border-border"} ${!dayItems.length && !isToday ? "hidden lg:block" : ""}`}>
                <p className={`text-[11px] font-semibold uppercase tracking-wider ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                  {DAY_NAMES[i]} {new Date(`${d}T12:00:00`).getDate()}{isToday && " · hoy"}
                </p>
                {dayItems.length ? dayItems.map(it => itemCard(it, true)) : <p className="text-[11px] text-muted-foreground/60">Libre</p>}
              </div>
            );
          })}
        </div>
        {items.some(i => !i.due) && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Sin fecha</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{items.filter(i => !i.due).map(it => itemCard(it, false))}</div>
          </div>
        )}
      </div>
    );
  };

  const listView = () => (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {STATUSES.map(s => {
        const group = items.filter(i => i.status === s.id);
        return (
          <div key={s.id} className="rounded-xl border border-border p-2.5 space-y-2">
            <p className="text-xs font-semibold text-foreground">{s.label} <span className="text-muted-foreground font-normal">· {group.length}</span></p>
            {group.map(it => (
              <div key={it.id} className="space-y-1">
                {it.due && <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{prettyDate(it.due)}</p>}
                {itemCard(it, false)}
              </div>
            ))}
            {!group.length && <p className="text-[11px] text-muted-foreground/60">Nada aquí todavía.</p>}
          </div>
        );
      })}
    </div>
  );

  // ── "Hoy publica esto": el siguiente paso evidente ──
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const late = items.filter(i => i.due && i.due < today0 && i.status !== "publicado");
  const pick = nextPiece(items, today0);
  const netsOf = (it: Item) => (Object.keys(it.channels) as Network[]).map(n => NETWORK_LABEL[n]).join(" · ");
  const todayCard = () => {
    if (!itemsLoaded) return null;
    if (!items.length) {
      return (
        <div className="card-surface rounded-2xl p-5 space-y-3">
          <p className="text-xs uppercase tracking-wider text-primary font-semibold">Tu primer paso</p>
          <p className="font-display text-lg text-foreground">Llena tu calendario y publica hoy tu primera pieza</p>
          <p className="text-[13px] text-muted-foreground">Arma tu mes de un toque o busca ideas gratis sobre "{seed || "tu tema"}". Luego aquí verás qué publicar cada día.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => scrollTo("mes-contenido")} className="inline-flex items-center gap-2 rounded-lg gradient-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground"><CalendarRange className="w-4 h-4" /> Armar mi mes</button>
            <button type="button" onClick={() => scrollTo("buscar-ideas")} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-foreground hover:border-foreground/40"><Search className="w-4 h-4" /> Buscar ideas gratis</button>
          </div>
        </div>
      );
    }
    const it = pick?.item;
    return (
      <div className="card-surface rounded-2xl p-5 space-y-3">
        {justPublished && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3 flex flex-wrap items-center gap-2 text-[13px]">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-foreground">Publicaste “{(justPublished.title ?? justPublished.topic).slice(0, 60)}”.</span>
            <ClaimBonusButton item={justPublished} />
            <button type="button" onClick={() => setJustPublished(null)} className="ml-auto text-[11px] text-muted-foreground hover:text-foreground">Cerrar</button>
          </div>
        )}
        {it ? (
          <>
            <p className="text-xs uppercase tracking-wider text-primary font-semibold">
              {pick.when === "hoy" ? "Hoy publica esto" : pick.when === "atrasada" ? `Pendiente desde el ${prettyDate(it.due as string)}` : `Tu próxima pieza · ${prettyDate(it.due as string)}`}
            </p>
            <p className="font-display text-lg text-foreground leading-snug">{it.title || it.topic}</p>
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
              {stageChip(it.stage)}
              <span>{KINDS[it.kind ?? "corto"].label}</span>
              {netsOf(it) && <span>· {netsOf(it)}</span>}
              {it.keyword && <span>· palabra clave {it.keyword}</span>}
            </div>
            {it.brief && <ul className="list-disc pl-5 space-y-0.5 text-[12px] text-muted-foreground">{it.brief.split(" · ").slice(0, 3).map((b, i) => <li key={i}>{b}</li>)}</ul>}
            <div className="flex flex-wrap gap-2">
              {it.status === "grabado" ? (
                <button type="button" onClick={() => markPublished(it)} className="inline-flex items-center gap-2 rounded-lg gradient-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground"><CheckCircle2 className="w-4 h-4" /> Ya lo publiqué</button>
              ) : (
                <>
                  <button type="button" onClick={() => makePiece(it)} className="inline-flex items-center gap-2 rounded-lg gradient-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground">
                    {it.kind === "carrusel" ? <Layers className="w-4 h-4" /> : <PenLine className="w-4 h-4" />} Hacer esta pieza
                  </button>
                  <button type="button" onClick={() => markPublished(it)} className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 px-4 py-2.5 text-sm text-emerald-400 hover:bg-emerald-500/10"><CheckCircle2 className="w-4 h-4" /> Ya lo publiqué</button>
                </>
              )}
              {pick.when !== "proxima" && (
                <button type="button" onClick={() => moveTo(it, ymd(addDays(today, 1)))} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground">Pasar a mañana</button>
              )}
            </div>
            {late.length > 1 && (
              <p className="text-[12px] text-muted-foreground">
                Tienes {late.length} piezas atrasadas sin publicar.{" "}
                <button type="button" onClick={() => void rescheduleLate(late)} className="text-primary hover:underline">Reagendarlas una por día desde hoy</button>
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-xs uppercase tracking-wider text-emerald-400 font-semibold">Estás al día</p>
            <p className="text-[13px] text-muted-foreground">No tienes piezas pendientes con fecha. Agenda la siguiente para no perder el ritmo.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => scrollTo("buscar-ideas")} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:border-foreground/40"><Search className="w-4 h-4" /> Buscar ideas gratis</button>
              <button type="button" onClick={() => scrollTo("mes-contenido")} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:border-foreground/40"><CalendarRange className="w-4 h-4" /> Armar mi mes</button>
            </div>
          </>
        )}
      </div>
    );
  };

  const googleHits = searches.filter(s => s.source === "google");
  const ytHits = searches.filter(s => s.source === "youtube");
  const hitChips = (list: SearchHit[]) => (
    <div className="flex flex-wrap gap-1.5">
      {list.slice(0, 24).map(s => (
        <span key={`${s.source}-${s.q}`} className="rounded-full border border-border bg-background/60 px-2.5 py-1 text-[11px] text-muted-foreground">{s.q}</span>
      ))}
    </div>
  );

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader stage="Mi negocio · Etapa 5" title="Calendario de contenido"
          icon={<CalendarDays className="w-5 h-5 text-primary" />}
          line="Ideas con búsquedas reales, publícalas en todas tus redes con un check y anota quién te escribe."
          details={STAGES.map(s => `${s.label}: ${s.desc}.`)} />
      </div>

      {/* El siguiente paso evidente: qué publicar hoy */}
      {todayCard()}

      {/* Bono por publicar lo que se hizo con una herramienta (50 créditos, 1 al día, 1.000 al mes) */}
      <PublishBonusCard />

      {/* Tu semana: lo publicado contra tu meta, y lo que te trae clientes */}
      <div className="card-surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-foreground flex items-center gap-2"><Target className="w-4 h-4 text-primary" /> Tu semana</p>
          <button type="button" onClick={() => setEditGoals(v => !v)} className="text-xs text-muted-foreground hover:text-foreground">{editGoals ? "Listo" : "Cambiar mi meta"}</button>
        </div>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {week.byKind.map(b => {
            const pct = b.goal ? Math.min(100, Math.round((b.published / b.goal) * 100)) : 0;
            return (
              <div key={b.kind} className="rounded-xl border border-border p-3 space-y-1.5">
                <p className="text-[12px] text-foreground">{KINDS[b.kind].label} <span className="text-muted-foreground">· {KINDS[b.kind].line}</span></p>
                {editGoals ? (
                  <label className="flex items-center gap-2 text-[11px] text-muted-foreground">Meta por semana
                    <input type="number" min={0} max={50} value={goals[b.kind]} onChange={e => void persistGoals({ ...goals, [b.kind]: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })}
                      aria-label={`Meta de ${KINDS[b.kind].label}`} className="w-14 rounded-md border border-border bg-background px-1.5 py-1 text-[12px] text-foreground" />
                  </label>
                ) : (
                  <p className="font-display font-bold text-xl text-foreground tabular-nums">{b.published}<span className="text-muted-foreground text-sm font-normal"> / {b.goal}</span></p>
                )}
                <div className="h-1.5 rounded-full bg-border overflow-hidden"><div className={`h-full rounded-full ${pct >= 100 ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-muted-foreground">
          <span><span className="text-foreground font-semibold tabular-nums">{week.posts}</span> publicaciones esta semana (contando cada red)</span>
          <span><span className="text-foreground font-semibold tabular-nums">{week.leads}</span> te escribieron</span>
          <span><span className="text-foreground font-semibold tabular-nums">{week.sales}</span> compraron</span>
          {week.best && <span>Lo que más te trae clientes: <span className="text-foreground">{KINDS[week.best.kind].label.toLowerCase()}</span> ({week.best.leads} en total)</span>}
        </div>
        <p className="text-[11px] text-muted-foreground/80">Una pieza cuenta como publicada cuando está marcada en todas sus redes. Las personas que te escriben y las ventas las anotas tú en cada pieza: solo números reales.</p>
      </div>

      {/* Tu mes de contenido: hasta 30 días armados de un toque (cobra el servidor) */}
      <div id="mes-contenido" className="card-surface rounded-2xl p-5 space-y-4 scroll-mt-20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-foreground flex items-center gap-2"><CalendarRange className="w-4 h-4 text-primary" /> Arma tu mes de contenido</p>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
              Con lo que ya sabemos de {profile.product.trim() ? `"${profile.product.trim().slice(0, 50)}"` : "ti"} armamos {Math.round(monthFreq * 30 / 7)} piezas para los próximos 30 días en {monthNets.map(n => (n === "instagram" ? "Instagram" : "TikTok")).join(" y ")}: tema con búsquedas reales, gancho, qué decir y cómo cerrar. Cada una se abre lista en Carrusel o en Guion de Reels.
            </p>
          </div>
          <button onClick={buildMonth} disabled={monthBusy || !activeId || !monthNets.length}
            className="inline-flex items-center justify-center gap-2 rounded-lg gradient-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50 shrink-0">
            {monthBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {monthBusy ? "Armando tu mes…" : `Arma mi mes · ${CREDIT_COSTS.content_month} créditos`}
          </button>
        </div>
        {monthBusy && <p className="text-[12px] text-muted-foreground">Leemos lo que la gente busca sobre tu tema y escribimos cada pieza. Tarda menos de un minuto.</p>}

        <div>
          <button type="button" onClick={() => setMonthOpts(v => !v)} aria-expanded={monthOpts} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${monthOpts ? "rotate-180" : ""}`} /> Personalizar (opcional)
          </button>
          {monthOpts && (
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-[12px] font-semibold text-foreground">¿Para qué es tu contenido?</p>
                {MONTH_GOALS.map(g => (
                  <button key={g.id} type="button" onClick={() => setMonthGoal(g.id)} aria-pressed={goalNow === g.id}
                    className={`w-full text-left rounded-lg border px-3 py-2 ${goalNow === g.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}>
                    <span className="block text-[13px] text-foreground">{g.label}{monthGoal === null && g.id === deducedGoal && <span className="text-[11px] text-muted-foreground"> · elegido por ti</span>}</span>
                    <span className="block text-[11px] text-muted-foreground">{g.desc}</span>
                  </button>
                ))}
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <p className="text-[12px] font-semibold text-foreground">Redes</p>
                  <div className="flex flex-wrap gap-2">
                    {(["instagram", "tiktok"] as MonthNet[]).map(n => {
                      const on = monthNets.includes(n);
                      return (
                        <button key={n} type="button" aria-pressed={on} onClick={() => setMonthNets(v => (on ? v.filter(x => x !== n) : [...v, n]))}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                          {on && <Check className="w-3 h-3" />}{n === "instagram" ? "Instagram" : "TikTok"}
                        </button>
                      );
                    })}
                  </div>
                  {!monthNets.length && <p className="text-[11px] text-muted-foreground">Elige al menos una red.</p>}
                </div>
                <div className="space-y-1.5">
                  <p className="text-[12px] font-semibold text-foreground">Piezas por semana</p>
                  <div className="flex gap-2">
                    {MONTH_FREQ.map(f => (
                      <button key={f} type="button" aria-pressed={monthFreq === f} onClick={() => setMonthFreq(f)}
                        className={`rounded-full border px-3 py-1.5 text-xs ${monthFreq === f ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                        {f} <span className="text-muted-foreground">({Math.round(f * 30 / 7)} en el mes)</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[12px] font-semibold text-foreground">¿Muestras tu cara?</p>
                  <div className="flex gap-2">
                    {[{ v: true, l: "Sí" }, { v: false, l: "No, prefiero voz o personaje IA" }].map(o => (
                      <button key={String(o.v)} type="button" aria-pressed={monthFace === o.v} onClick={() => setMonthFace(o.v)}
                        className={`rounded-full border px-3 py-1.5 text-xs ${monthFace === o.v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                        {o.l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {lastPlan && (
          <div className="border-t border-border pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-foreground">{lastPlan.count} piezas en tu calendario hasta el {prettyDate(lastPlan.end)}. Empieza por la de hoy: toca <span className="text-primary font-semibold">Hacer esta pieza</span>.</p>
              <button type="button" onClick={() => void removePlan(lastPlan.id)} className="text-xs text-muted-foreground hover:text-red-400">Borrar este mes</button>
            </div>
            <ToolFeedback tool="mes-contenido" refId={lastPlan.id} context={{ objetivo: goalNow, redes: monthNets, por_semana: monthFreq, cara: monthFace }} />
          </div>
        )}
        <p className="text-[11px] text-muted-foreground/80">Es un plan para publicar con constancia, no una promesa de vistas ni de ventas. Todo lo puedes editar, mover o borrar.</p>
      </div>

      {/* Buscar ideas con demanda real */}
      <div id="buscar-ideas" className="card-surface rounded-2xl p-5 space-y-4 scroll-mt-20">
        <div>
          <p className="font-semibold text-foreground flex items-center gap-2"><Search className="w-4 h-4 text-primary" /> Buscar ideas con demanda real</p>
          <p className="text-xs text-muted-foreground mt-0.5">Miramos lo que la gente escribe en Google y YouTube sobre tu tema y lo convertimos en ideas para tu negocio. Es gratis.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={seed} maxLength={80} onChange={e => { setSeed(e.target.value); setSeedTouched(true); }}
            onKeyDown={e => { if (e.key === "Enter" && !searching) searchIdeas(); }}
            placeholder="Tu tema en 1 a 3 palabras, por ejemplo: repostería"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60" />
          <button onClick={searchIdeas} disabled={searching || !seed.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg gradient-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {searching ? "Buscando…" : "Buscar ideas"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">¿Dónde publicas más?</span>
          {PLATFORMS.map(p => (
            <button key={p.id} onClick={() => setPlatform(v => (v === p.id ? "" : p.id))}
              className={`rounded-full border px-3 py-1.5 text-xs ${platform === p.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {p.label}
            </button>
          ))}
        </div>

        {searches.length > 0 && (
          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Lo que la gente busca</p>
            {googleHits.length > 0 && <div className="space-y-1.5"><p className="text-[11px] font-semibold text-foreground">En Google</p>{hitChips(googleHits)}</div>}
            {ytHits.length > 0 && <div className="space-y-1.5"><p className="text-[11px] font-semibold text-foreground">En YouTube</p>{hitChips(ytHits)}</div>}
          </div>
        )}

        {ideas.length > 0 && (
          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">{ideas.length} ideas para ti</p>
              <button onClick={addAll} disabled={added.size >= ideas.length}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/50 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-40">
                <Plus className="w-3.5 h-3.5" /> Agregar todas (una por día)
              </button>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {ideas.map((idea, idx) => (
                <div key={idx} className="rounded-xl border border-border bg-background/60 p-3 flex flex-col gap-2" style={{ borderLeft: `3px solid ${stageOf(idea.stage).color}` }}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {stageChip(idea.stage)}
                    <span className="text-[11px] text-muted-foreground">{PLATFORMS.find(p => p.id === idea.platform)?.label}</span>
                    <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground/70">{idea.source === "ia" ? "IA" : idea.source === "youtube" ? "YouTube" : "Google"}</span>
                  </div>
                  <p className="text-sm font-medium text-foreground leading-snug">{idea.title}</p>
                  {idea.source !== "ia" && idea.topic && <p className="text-[11px] text-muted-foreground">🔎 La gente busca: “{idea.topic}”</p>}
                  {idea.why && <p className="text-[11px] text-muted-foreground leading-snug">{idea.why}</p>}
                  <button onClick={() => addIdea(idx)} disabled={added.has(idx)}
                    className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary/50 disabled:opacity-50">
                    {added.has(idx) ? "En tu calendario ✓" : <><Plus className="w-3.5 h-3.5" /> Agregar al calendario</>}
                  </button>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground/80">Son ideas para publicar, no una promesa de visitas ni de ventas: lo que funciona lo decide tu constancia y tus números.</p>
          </div>
        )}
      </div>

      {/* Para publicar (26-oct-2026): hoy solo la cuenta de Jean, porque programa con su Upload-Post. */}
      {isGenjutsuOwner(user?.id) && <ParaPublicar />}

      {/* Calendario */}
      <div className="card-surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-border p-0.5">
            <button onClick={() => setView("semana")} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${view === "semana" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>
              <CalendarDays className="w-3.5 h-3.5" /> Semana
            </button>
            <button onClick={() => setView("lista")} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${view === "lista" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>
              <List className="w-3.5 h-3.5" /> Lista
            </button>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <select value={manualKind} onChange={e => setManualKind(e.target.value as Kind)} aria-label="Tipo de pieza"
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground">
              {KIND_IDS.map(k => <option key={k} value={k}>{KINDS[k].label}</option>)}
            </select>
            <input value={manualTitle} maxLength={200} onChange={e => setManualTitle(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addManual(); }}
              placeholder="Una idea tuya…" className="flex-1 sm:w-64 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/60" />
            <button onClick={addManual} disabled={!manualTitle.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">
              <Plus className="w-3.5 h-3.5" /> Agregar a mano
            </button>
          </div>
        </div>

        {!itemsLoaded ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center space-y-2">
            <CalendarDays className="w-8 h-8 text-primary mx-auto" />
            <p className="font-semibold text-foreground">Tu calendario está vacío</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Empieza arriba: escribe tu tema, toca "Buscar ideas" y agrega las que te gusten. Con una pieza al día ya tienes un plan.
            </p>
            <button onClick={searchIdeas} disabled={searching || !seed.trim()}
              className="inline-flex items-center gap-2 rounded-lg gradient-brand px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50 mt-2">
              <Sparkles className="w-4 h-4" /> Buscar mis primeras ideas
            </button>
          </div>
        ) : view === "semana" ? weekView() : listView()}

        {onNavigate && (
          <button onClick={() => onNavigate("Dashboard")} className="text-sm text-muted-foreground hover:text-foreground">Volver al inicio</button>
        )}
      </div>
    </div>
  );
}
