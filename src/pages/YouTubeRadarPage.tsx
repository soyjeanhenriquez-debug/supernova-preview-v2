import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Search, Sparkles, TrendingUp, Users, Eye, Clock, Smartphone, Clapperboard, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CreateFromIdeaSheet } from "@/components/create/CreateFromIdeaSheet";
import { ideaFromYt } from "@/lib/recommendTarget";

const SHORT_INPUT = { source: "nicho_yt", kind: "short" } as const;

/**
 * Radar de nichos de YouTube (03-oct-2026): con la API oficial de YouTube (función youtube-radar), los
 * videos de los últimos 30 días con más vistas por nicho, idioma y formato. "Veces sus suscriptores"
 * dice si el nicho empuja a canales pequeños; el ingreso es SIEMPRE un estimado con rango. Gratis.
 * "Crear mi versión" lleva al Creador de videos con este video como referencia (tema y estructura,
 * nunca su texto).
 */
export type YtItem = {
  id: string; title: string; channel: string; channel_id: string; published_at: string; thumb: string | null;
  views: number; subs: number; seconds: number; x_subs: number | null; income_est: [number, number];
};
type Lang = "es" | "en" | "pt";
type Kind = "long" | "short";

const NICHES = ["Historia", "Curiosidades", "Finanzas personales", "Mascotas", "Espiritualidad", "Salud", "Misterio", "Motivación", "Biografías", "Religión", "Tecnología", "Cocina fácil"];
export const YT_REF_KEY = "supernova.yt.ref";

/** 1977 → "1.977" (toLocaleString("es") no agrupa números de 4 cifras). */
const num = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString("es", { maximumFractionDigits: 1 })} M` : n >= 1000 ? `${Math.round(n / 1000).toLocaleString("es")} mil` : n.toLocaleString("es");
const ago = (iso: string) => { const d = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)); return d === 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`; };
const dur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function YouTubeRadarPage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const [kind, setKind] = useState<Kind>("long");
  const [lang, setLang] = useState<Lang>("es");
  const [q, setQ] = useState(NICHES[0]);
  const [input, setInput] = useState("");
  const [items, setItems] = useState<YtItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "Hacer un Short de esto": hoja de crear con este video como referencia (tema, nunca su texto).
  const [shortOf, setShortOf] = useState<YtItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data, error: err } = await supabase.functions.invoke("youtube-radar", { body: { q, lang, kind } });
    if (err) {
      const ctx = (err as { context?: Response }).context;
      const msg = ctx ? await ctx.json().then((b: { error?: string }) => b?.error).catch(() => null) : null;
      setError(msg || "No se pudo consultar YouTube ahora."); setItems([]);
    } else setItems((data?.items ?? []) as YtItem[]);
    setLoading(false);
  }, [q, lang, kind]);
  useEffect(() => { void load(); }, [load]);

  // "Crear un video de este nicho": el Creador se abre con la idea puesta (no gasta nada solo;
  // la persona ve el precio del guion y decide). Contrato de src/lib/creativeSeed.ts.
  const createFromNiche = () => {
    const top = items?.[0];
    try {
      sessionStorage.setItem("supernova.seed", JSON.stringify({
        v: 1, source: "nicho_yt", target: "youtube", at: Date.now(), autostart: false,
        title: `Un video de ${q.toLowerCase()} con un ángulo propio`.slice(0, 80),
        product: `Video de ${q}`, who: `Personas que ven videos de ${q} en YouTube`, promise: "",
        ...(top ? { hook: top.title.slice(0, 140) } : {}),
        aspect: kind === "short" ? "9:16" : "16:9",
      }));
    } catch { /* sin almacenamiento: abre el Creador vacío */ }
    onNavigate("Creador YouTube");
  };

  const createVersion = (it: YtItem) => {
    try { sessionStorage.setItem(YT_REF_KEY, JSON.stringify({ ...it, lang, kind })); } catch { /* sin almacenamiento */ }
    onNavigate("Creador YouTube");
  };

  const chip = (on: boolean) => `shrink-0 h-8 px-3 rounded-full border text-[12px] transition-colors ${on ? "border-foreground/40 text-foreground bg-card" : "border-border text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="max-w-[1280px] mx-auto space-y-5 py-4">
      <div>
        <h1 className="font-display font-bold text-2xl text-foreground">Nichos de YouTube</h1>
        <p className="text-sm text-muted-foreground mt-1">Los videos con más vistas de los últimos 30 días en cada tema, con datos oficiales de YouTube. Elige un nicho, mira qué funciona y haz tu propia versión. Mirar es gratis.</p>
      </div>

      <details className="rounded-xl border border-border/70 px-4 py-3 text-[12px] text-muted-foreground max-w-3xl">
        <summary className="cursor-pointer text-[13px] text-foreground inline-flex items-center gap-1.5"><HelpCircle className="w-4 h-4 text-muted-foreground" /> Cómo leer estos datos</summary>
        <ul className="mt-2 space-y-1.5">
          <li><span className="text-foreground">Vistas:</span> las que cuenta YouTube hoy para ese video, publicado en los últimos 30 días.</li>
          <li><span className="text-foreground">Veces sus suscriptores:</span> vistas divididas entre los suscriptores del canal. Si un canal de 700 suscriptores tiene 490 mil vistas, YouTube lo está mostrando a gente nueva: ese tema le abre la puerta a canales pequeños.</li>
          <li><span className="text-foreground">Pago aproximado de YouTube:</span> un rango estimado de lo que YouTube paga por esas vistas en ese idioma, solo si el canal cobra anuncios. Cada canal cobra distinto y no es lo que tú vas a ganar.</li>
          <li><span className="text-foreground">Qué hacer:</span> toca "Crear mi versión" para modelar la estructura de un video (tu guion es original, nunca su texto) o "Crear un video de este nicho" para empezar desde tu propia idea.</li>
        </ul>
      </details>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setKind("long")} className={chip(kind === "long")}>Videos largos</button>
        <button onClick={() => setKind("short")} className={chip(kind === "short")}>Shorts</button>
        <span className="w-px h-5 bg-border mx-1" />
        {([["es", "Español"], ["en", "Inglés"], ["pt", "Portugués"]] as [Lang, string][]).map(([l, label]) => (
          <button key={l} onClick={() => setLang(l)} className={chip(lang === l)}>{label}</button>
        ))}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); if (input.trim().length >= 2) setQ(input.trim()); }} className="flex gap-2 max-w-xl">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={input} onChange={e => setInput(e.target.value.slice(0, 80))} placeholder="Busca un nicho: perros, romanos, ahorro…"
            className="w-full rounded-full border border-border bg-background pl-9 pr-3 h-10 text-sm text-foreground focus:outline-none focus:border-primary/60" />
        </div>
        <button type="submit" className="h-10 px-4 rounded-full border border-border text-[13px] text-foreground hover:border-foreground/30">Buscar</button>
      </form>
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {NICHES.map(n => <button key={n} onClick={() => { setQ(n); setInput(""); }} className={chip(q === n)}>{n}</button>)}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-[300px] rounded-2xl border border-border/60 bg-card/30 animate-pulse" />)}
        </div>
      ) : error ? (
        <p className="rounded-xl border border-border px-4 py-5 text-[13px] text-muted-foreground">{error}</p>
      ) : items && items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-5 text-[13px] text-muted-foreground">No encontramos videos de "{q}" en los últimos 30 días. Prueba con otra palabra.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {(items ?? []).map(it => (
            <div key={it.id} className="rounded-2xl border border-border bg-card/40 overflow-hidden flex flex-col">
              <a href={`https://www.youtube.com/watch?v=${it.id}`} target="_blank" rel="noopener noreferrer" className="relative block aspect-video bg-black">
                {it.thumb && <img src={it.thumb} alt="" loading="lazy" className="w-full h-full object-cover" />}
                <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[11px] text-white">{dur(it.seconds)}</span>
              </a>
              <div className="p-4 flex-1 flex flex-col gap-2">
                <p className="text-[13px] font-medium text-foreground leading-snug line-clamp-2">{it.title}</p>
                <p className="text-[11px] text-muted-foreground truncate">{it.channel} · {it.subs ? `${fmt(it.subs)} suscriptores` : "suscriptores ocultos"} · {ago(it.published_at)}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> {fmt(it.views)} vistas</span>
                  {it.x_subs !== null && it.x_subs >= 1 && (
                    <span className="inline-flex items-center gap-1 text-foreground" title="Vistas de este video divididas entre los suscriptores del canal: más alto = YouTube lo muestra a gente nueva">
                      <TrendingUp className="w-3.5 h-3.5 text-primary" /> {it.x_subs >= 1000 ? num(it.x_subs) : it.x_subs.toLocaleString("es")} veces sus suscriptores
                    </span>
                  )}
                </div>
                <div className="rounded-lg bg-secondary/40 px-3 py-2 text-[11px] text-muted-foreground" title="Rango aproximado de lo que paga YouTube por cada 1.000 vistas en este idioma, si el canal cobra anuncios. No es un dato del canal ni lo que tú vas a ganar.">
                  Pago aproximado de YouTube por estas vistas: <span className="text-foreground font-medium">US${num(it.income_est[0])}–{num(it.income_est[1])}</span> <span className="whitespace-nowrap">(estimado)</span>
                </div>
                <div className="mt-auto flex gap-2 pt-1">
                  <button onClick={() => createVersion(it)} className="btn-primary-nova flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold">
                    <Sparkles className="w-3.5 h-3.5" /> Crear mi versión
                  </button>
                  <a href={`https://www.youtube.com/watch?v=${it.id}`} target="_blank" rel="noopener noreferrer" aria-label="Ver en YouTube" className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
                <button onClick={() => setShortOf(it)} className="h-10 rounded-lg border border-border text-[12px] font-semibold text-foreground hover:border-foreground/30 inline-flex items-center justify-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5" /> Hacer un Short de esto
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && (items?.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[14px] text-foreground font-medium">¿Te gusta el nicho "{q}"?</p>
            <p className="text-[12px] text-muted-foreground">Abre el Creador con este tema listo: escribe tu idea, ves el precio del guion antes de gastar y luego lo conviertes en video.</p>
          </div>
          <button onClick={createFromNiche} className="btn-primary-nova h-11 px-5 rounded-xl text-[14px] font-semibold inline-flex items-center justify-center gap-2 shrink-0"><Clapperboard className="w-4 h-4" /> Crear un video de este nicho</button>
        </div>
      )}

      {shortOf && <CreateFromIdeaSheet idea={ideaFromYt(shortOf, q, true)} input={SHORT_INPUT} onClose={() => setShortOf(null)} />}

      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5"><Users className="w-3 h-3" /><Clock className="w-3 h-3" /> Datos oficiales de YouTube; cada búsqueda se actualiza cada 6 horas. El pago es un estimado con rangos aproximados por idioma: cada canal cobra distinto y no es una promesa de ingresos.</p>
    </div>
  );
}
