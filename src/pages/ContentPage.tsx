import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, List, Loader2, PenLine, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusinessProfile } from "@/lib/businessProfile";

/**
 * Etapa 5 del recorrido "Mi negocio": calendario de contenido orgánico.
 * Nuestra versión del "Minerador de Palavras-Chave" de Ladeira: temas con demanda REAL
 * (autocompletado de Google y YouTube, edge function content-ideas, gratis con tope por usuario),
 * cada pieza conectada a una etapa de la Mándala (Atraer / Conectar / Convertir), con plataforma,
 * fecha y estado. Las piezas se guardan en content_items (RLS: cada quien sus filas).
 */

type Stage = "atraer" | "conectar" | "convertir";
type Platform = "reels" | "tiktok" | "youtube" | "blog" | "whatsapp";
type Status = "idea" | "guion" | "grabado" | "publicado";
type Item = {
  id: string; topic: string; title: string | null; stage: Stage; platform: Platform; status: Status;
  due: string | null; source: string | null; created_at: string;
};
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
const STATUSES: { id: Status; label: string }[] = [
  { id: "idea", label: "Idea" }, { id: "guion", label: "Guion" }, { id: "grabado", label: "Grabado" }, { id: "publicado", label: "Publicado" },
];
const DAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Tabla nueva, aún no está en los tipos generados de Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as any).from("content_items");

/** Fecha local como 'YYYY-MM-DD' (sin pasar por UTC). */
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = (d: Date) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -((x.getDay() + 6) % 7)); };
const prettyDate = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" });
const stageOf = (s: Stage) => STAGES.find(x => x.id === s) ?? STAGES[0];

/** Seed por defecto: las primeras palabras del producto (o de a quién ayuda). */
function defaultSeed(product: string, who: string) {
  const words = (product || who).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 3);
  while (words.length > 1 && /^(de|del|la|el|los|las|para|y|en|con|a|un|una)$/i.test(words[words.length - 1])) words.pop();
  return words.join(" ").toLowerCase();
}

export function ContentPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { user } = useAuth();
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

  useEffect(() => {
    if (loaded && !seedTouched && !seed) setSeed(defaultSeed(profile.product, profile.who));
  }, [loaded, profile.product, profile.who, seed, seedTouched]);

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await table().select("id,topic,title,stage,platform,status,due,source,created_at")
      .eq("user_id", user.id).order("due", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }).limit(500);
    if (error) toast.error("No se pudo cargar tu calendario");
    setItems((data ?? []) as Item[]);
    setItemsLoaded(true);
  }, [user]);
  useEffect(() => { load(); }, [load]);

  const today = useMemo(() => new Date(), []);
  const monday = useMemo(() => addDays(mondayOf(today), weekOffset * 7), [today, weekOffset]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => ymd(addDays(monday, i))), [monday]);
  const thisWeek = useMemo(() => { const m = mondayOf(today); return [ymd(m), ymd(addDays(m, 6))]; }, [today]);
  const publishedThisWeek = items.filter(i => i.status === "publicado" && i.due && i.due >= thisWeek[0] && i.due <= thisWeek[1]).length;
  const plannedThisWeek = items.filter(i => i.due && i.due >= thisWeek[0] && i.due <= thisWeek[1]).length;

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
        body: { seed: q, platform: platform || undefined },
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
      if (!data.searches?.length) toast.message("Hoy no pudimos leer las búsquedas de Google; estas ideas las armó la IA.");
    } finally {
      setSearching(false);
    }
  };

  const insertItems = async (rows: Omit<Item, "id" | "created_at">[]) => {
    if (!user || !rows.length) return false;
    const { data, error } = await table().insert(rows.map(r => ({ ...r, user_id: user.id }))).select("id,topic,title,stage,platform,status,due,source,created_at");
    if (error) { toast.error("No se pudo guardar en tu calendario"); return false; }
    setItems(prev => [...prev, ...((data ?? []) as Item[])].sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999")));
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
    if (await insertItems([{ topic: t, title: t, stage: "atraer", platform: platform || "reels", status: "idea", due, source: "manual" }])) setManualTitle("");
  };

  const update = async (id: string, patch: Partial<Item>) => {
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)));
    const { error } = await table().update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error("No se pudo guardar el cambio"); load(); }
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
      <div className="flex flex-wrap items-center gap-1.5">
        <select value={it.stage} onChange={e => update(it.id, { stage: e.target.value as Stage })} aria-label="Etapa"
          className="rounded-md border px-1.5 py-1 text-[11px] font-semibold bg-background"
          style={{ color: stageOf(it.stage).color, borderColor: `${stageOf(it.stage).color}66` }}>
          {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select value={it.platform} onChange={e => update(it.id, { platform: e.target.value as Platform })} aria-label="Plataforma"
          className="rounded-md border border-border bg-background px-1.5 py-1 text-[11px] text-muted-foreground">
          {PLATFORMS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <select value={it.status} onChange={e => update(it.id, { status: e.target.value as Status })} aria-label="Estado"
          className={`rounded-md border px-1.5 py-1 text-[11px] bg-background ${it.status === "publicado" ? "border-emerald-500/50 text-emerald-400" : "border-border text-foreground"}`}>
          {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <input type="date" value={it.due ?? ""} onChange={e => update(it.id, { due: e.target.value || null })} aria-label="Fecha"
          className="rounded-md border border-border bg-background px-1.5 py-1 text-[11px] text-muted-foreground min-w-0" />
        <button onClick={() => writeScript(it)} className="inline-flex items-center gap-1 rounded-md border border-primary/40 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10">
          <PenLine className="w-3 h-3" /> Escribir guion
        </button>
        <button onClick={() => remove(it.id)} className="ml-auto p-1 text-muted-foreground hover:text-red-400" aria-label="Borrar"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );

  const weekView = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setWeekOffset(w => w - 1)} className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground" aria-label="Semana anterior"><ChevronLeft className="w-4 h-4" /></button>
        <p className="text-sm text-foreground font-medium">
          {weekOffset === 0 ? "Esta semana" : weekOffset === 1 ? "La próxima semana" : `Semana del ${prettyDate(weekDays[0])}`}
          <span className="text-muted-foreground font-normal"> · {prettyDate(weekDays[0])} – {prettyDate(weekDays[6])}</span>
        </p>
        <button onClick={() => setWeekOffset(w => w + 1)} className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground" aria-label="Semana siguiente"><ChevronRight className="w-4 h-4" /></button>
      </div>
      <div className="grid gap-2 lg:grid-cols-7">
        {weekDays.map((d, i) => {
          const dayItems = items.filter(it => it.due === d);
          const isToday = d === ymd(today);
          return (
            <div key={d} className={`rounded-xl border p-2 min-h-[90px] space-y-2 ${isToday ? "border-primary/60 bg-primary/5" : "border-border"}`}>
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
        <div>
          <p className="text-xs uppercase tracking-wider text-primary font-semibold">Mi negocio · Etapa 5</p>
          <h1 className="font-display font-bold text-2xl text-foreground flex items-center gap-2"><CalendarDays className="w-5 h-5 text-primary" /> Calendario de contenido</h1>
          <p className="text-sm text-muted-foreground max-w-2xl mt-1">
            Publica sin pagar anuncios para que la gente te encuentre. Cada pieza tiene un trabajo, igual que en la Mándala:{" "}
            {STAGES.map((s, i) => (
              <span key={s.id}><b style={{ color: s.color }}>{s.label}</b> ({s.desc}){i < 2 ? ", " : "."}</span>
            ))}
          </p>
        </div>
        {itemsLoaded && items.length > 0 && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-2.5 text-right">
            <p className="font-display font-bold text-2xl text-emerald-400 tabular-nums">{publishedThisWeek}</p>
            <p className="text-[11px] text-muted-foreground">publicadas esta semana{plannedThisWeek ? ` de ${plannedThisWeek}` : ""}</p>
          </div>
        )}
      </div>

      {/* Buscar ideas con demanda real */}
      <div className="card-surface rounded-2xl p-5 space-y-4">
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

      {/* Calendario */}
      <div className="card-surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-border p-0.5">
            <button onClick={() => setView("semana")} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${view === "semana" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>
              <CalendarDays className="w-3.5 h-3.5" /> Esta semana
            </button>
            <button onClick={() => setView("lista")} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${view === "lista" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>
              <List className="w-3.5 h-3.5" /> Lista
            </button>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
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
