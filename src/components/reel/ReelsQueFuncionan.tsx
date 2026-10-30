import { useCallback, useEffect, useState } from "react";
import { Copy, ExternalLink, Loader2, Search, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ToolShell } from "@/components/tool/ToolShell";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { CREDIT_COSTS } from "@/hooks/useCredits";
import { REEL_URL_KEY, REELIA_REF_KEY } from "@/lib/intentHandoff";

/**
 * «Reels que funcionan» (30-oct-2026, Jean: no malgastar lo que ya se pagó en Apify). Biblioteca de reels reales con
 * sus vistas, gratis de mirar: tarjetas con el gancho como titular, filtros de un toque (idioma, si atrae o vende,
 * creador) y la ficha con el reel de Instagram, por qué funciona y su estructura. Hacer tu versión es «Analiza un Reel»
 * (cobra el servidor) o Reel Studio (solo deja el enlace puesto). Datos: public.reel_biblioteca (RLS: con acceso).
 */

type Lectura = { gancho?: string; gancho_es?: string; plantilla?: string; categoria?: string; estructura?: string[]; por_que?: string };
type Reel = {
  shortcode: string; url: string; owner: string | null; owner_name: string | null; caption: string | null; transcript: string | null;
  duration_s: number | null; views: number | null; likes: number | null; comments: number | null; posted_at: string | null;
  language: string | null; gancho: string | null; tema: string | null; tipo: string | null; intencion: string | null; lectura: Lectura | null;
};
type Orden = "views" | "posted_at" | "comments";
type Idioma = "all" | "es" | "en";
type Intencion = "all" | "atraccion" | "venta";

const COLS = "shortcode,url,owner,owner_name,caption,transcript,duration_s,views,likes,comments,posted_at,language,gancho,tema,tipo,intencion,lectura";
const PAGINA = 24;
const ORDENES: { v: Orden; l: string }[] = [{ v: "views", l: "Más vistos" }, { v: "posted_at", l: "Más recientes" }, { v: "comments", l: "Más comentados" }];
const IDIOMAS: { v: Idioma; l: string }[] = [{ v: "all", l: "Todos" }, { v: "es", l: "Español" }, { v: "en", l: "Inglés" }];
const INTENCIONES: { v: Intencion; l: string }[] = [{ v: "all", l: "Todos" }, { v: "atraccion", l: "Atraen público" }, { v: "venta", l: "Venden" }];

/** 7.307.076 → «7,3 M»; 668.050 → «668 mil». */
export function cifra(n: number | null | undefined): string {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("es", { maximumFractionDigits: 1 })} M`;
  if (n >= 10_000) return `${Math.round(n / 1000).toLocaleString("es")} mil`;
  return n.toLocaleString("es");
}

const primeraFrase = (t: string | null) => (t ?? "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0] ?? "";

/**
 * El titular de la tarjeta: el gancho leído, o la primera frase de lo que se dice, o el texto de la publicación.
 * En los reels de pura música la transcripción sale con pocas palabras sueltas: ahí manda el texto de la publicación.
 */
export function titular(r: Pick<Reel, "gancho" | "transcript" | "caption">): string {
  const corto = (t: string) => t.split(" ").length < 4;
  let frase = primeraFrase(r.gancho || r.transcript);
  if (!frase || corto(frase)) frase = primeraFrase(r.caption) || frase;
  return (frase.length > 140 ? `${frase.slice(0, 137)}…` : frase) || "Reel sin texto";
}

const chip = (on: boolean) =>
  `shrink-0 min-h-[36px] rounded-full border px-3.5 text-[13px] transition-colors ${on ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60"}`;

function Segmento<T extends string>({ opciones, valor, cambiar, label }: { opciones: { v: T; l: string }[]; valor: T; cambiar: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-border p-0.5">
      {opciones.map(o => (
        <button key={o.v} type="button" role="radio" aria-checked={valor === o.v} onClick={() => cambiar(o.v)}
          className={`min-h-[32px] rounded-full px-3 text-[12px] transition-colors ${valor === o.v ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

export function ReelsQueFuncionan({ onHome, onNavigate }: { onHome: () => void; onNavigate: (page: string) => void }) {
  const movil = useIsMobile();
  const [reels, setReels] = useState<Reel[]>([]);
  const [cargando, setCargando] = useState(true);
  const [hayMas, setHayMas] = useState(false);
  const [orden, setOrden] = useState<Orden>("views");
  const [idioma, setIdioma] = useState<Idioma>("all");
  const [intencion, setIntencion] = useState<Intencion>("all");
  const [creador, setCreador] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [buscaYa, setBuscaYa] = useState("");
  const [creadores, setCreadores] = useState<{ owner: string; n: number }[]>([]);
  const [total, setTotal] = useState(0);
  const [abierto, setAbierto] = useState<Reel | null>(null);

  // La búsqueda espera a que dejes de escribir.
  useEffect(() => { const t = setTimeout(() => setBuscaYa(busca.trim()), 350); return () => clearTimeout(t); }, [busca]);

  // Creadores con más reels (una sola vez; 532 filas, solo la columna owner).
  useEffect(() => {
    void supabase.from("reel_biblioteca" as never).select("owner").limit(2000).then(({ data }) => {
      const c = new Map<string, number>();
      const filas = (data ?? []) as { owner: string | null }[];
      setTotal(filas.length);
      for (const r of filas) if (r.owner) c.set(r.owner, (c.get(r.owner) ?? 0) + 1);
      setCreadores([...c.entries()].map(([owner, n]) => ({ owner, n })).sort((a, b) => b.n - a.n).slice(0, 14));
    });
  }, []);

  const cargar = useCallback(async (desde: number) => {
    setCargando(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any).from("reel_biblioteca").select(COLS);
    if (idioma !== "all") q = q.eq("language", idioma);
    if (intencion !== "all") q = q.eq("intencion", intencion);
    if (creador) q = q.eq("owner", creador);
    if (buscaYa) {
      const t = buscaYa.replace(/[%,()]/g, " ").slice(0, 60);
      q = q.or(`gancho.ilike.%${t}%,tema.ilike.%${t}%,caption.ilike.%${t}%,owner.ilike.%${t}%`);
    }
    const { data, error } = await q.order(orden, { ascending: false, nullsFirst: false }).range(desde, desde + PAGINA);
    setCargando(false);
    if (error) { toast.error("No se pudo cargar la biblioteca. Inténtalo de nuevo."); return; }
    const filas = (data ?? []) as Reel[];
    setHayMas(filas.length > PAGINA);
    const pagina = filas.slice(0, PAGINA);
    setReels(prev => (desde === 0 ? pagina : [...prev, ...pagina]));
  }, [idioma, intencion, creador, buscaYa, orden]);

  useEffect(() => { void cargar(0); }, [cargar]);

  const hacerVersion = (r: Reel) => {
    try { sessionStorage.setItem(REEL_URL_KEY, r.url); } catch { /* sin almacenamiento */ }
    window.location.hash = "#/con-tu-cara/reel";
    window.scrollTo({ top: 0 });
  };
  const enReelStudio = (r: Reel) => {
    try { sessionStorage.setItem(REELIA_REF_KEY, r.url); } catch { /* sin almacenamiento */ }
    window.location.hash = "#/con-tu-cara/reel-ia";
    window.scrollTo({ top: 0 });
  };
  const copiar = (texto: string, aviso: string) => {
    void navigator.clipboard.writeText(texto).then(() => toast.success(aviso)).catch(() => toast.error("No se pudo copiar."));
  };

  return (
    <ToolShell toolId="reels-que-funcionan" agente="reels" onNavigate={onNavigate}
      crumbs={[{ label: "Crear" }, { label: "Con tu cara", onClick: onHome }, { label: "Reels que funcionan" }]}
      title="Reels que funcionan"
      line={total ? `${total.toLocaleString("es")} reels reales con sus vistas. Mirarlos es gratis; elige uno y haz tu versión.` : "Reels reales con sus vistas. Mirarlos es gratis; elige uno y haz tu versión."}
      onBack={onHome}>
      <div className="space-y-4">
        {/* Buscar y filtrar: todo a un toque, sin menús escondidos. */}
        <div className="space-y-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={busca} onChange={e => setBusca(e.target.value.slice(0, 80))} placeholder="Busca un tema, un gancho o una cuenta"
              className="h-11 w-full rounded-2xl border border-border bg-transparent pl-10 pr-3 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/60" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Segmento label="Idioma" opciones={IDIOMAS} valor={idioma} cambiar={v => setIdioma(v as Idioma)} />
            <Segmento label="Para qué" opciones={INTENCIONES} valor={intencion} cambiar={v => setIntencion(v as Intencion)} />
            <select value={orden} onChange={e => setOrden(e.target.value as Orden)} aria-label="Ordenar"
              className="min-h-[36px] rounded-full border border-border bg-transparent px-3 text-[12px] text-foreground sm:ml-auto">
              {ORDENES.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </div>
          {creadores.length > 0 && (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Creadores">
              <button type="button" onClick={() => setCreador("")} className={chip(!creador)}>Todas las cuentas</button>
              {creadores.map(c => (
                <button key={c.owner} type="button" onClick={() => setCreador(creador === c.owner ? "" : c.owner)} className={chip(creador === c.owner)}>
                  @{c.owner} <span className="opacity-60">{c.n}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tarjetas: el gancho manda. */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {reels.map(r => {
            const pct = r.views && r.likes ? (r.likes / r.views) * 100 : 0;
            return (
              <button key={r.shortcode} type="button" onClick={() => setAbierto(r)}
                className="card-surface group flex min-h-[176px] flex-col rounded-2xl p-4 text-left transition-colors hover:border-primary/50">
                <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <span className="truncate">@{r.owner ?? "instagram"}</span>
                  {r.duration_s ? <span className="shrink-0">· {Math.round(r.duration_s)} s</span> : null}
                  {r.intencion === "venta" && <span className="ml-auto shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px]">Vende</span>}
                </span>
                <span className="mt-2 line-clamp-4 font-display text-[17px] font-semibold leading-snug text-foreground">{titular(r)}</span>
                <span className="mt-auto flex flex-wrap items-end gap-x-3 gap-y-1 pt-4">
                  <span className="font-display text-[20px] font-semibold text-foreground">{cifra(r.views)}</span>
                  <span className="pb-0.5 text-[12px] text-muted-foreground">vistas{pct >= 1 ? ` · ${pct.toLocaleString("es", { maximumFractionDigits: 1 })} % le dio me gusta` : ""}</span>
                  {r.tema && <span className="ml-auto max-w-full truncate pb-0.5 text-[12px] text-muted-foreground">{r.tema}</span>}
                </span>
              </button>
            );
          })}
        </div>

        {cargando && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
        {!cargando && !reels.length && (
          <p className="rounded-2xl border border-border p-6 text-center text-[14px] text-muted-foreground">No hay reels con esos filtros. Prueba con otro idioma o quita la búsqueda.</p>
        )}
        {!cargando && hayMas && (
          <div className="flex justify-center">
            <button type="button" onClick={() => void cargar(reels.length)} className="min-h-[44px] rounded-full border border-border px-6 text-[14px] text-foreground hover:bg-secondary/60">Ver más</button>
          </div>
        )}
      </div>

      <Sheet open={!!abierto} onOpenChange={o => { if (!o) setAbierto(null); }}>
        <SheetContent side={movil ? "bottom" : "right"} className={movil ? "max-h-[92dvh] overflow-y-auto rounded-t-3xl" : "w-full overflow-y-auto sm:max-w-xl"}>
          {abierto && <Ficha r={abierto} onVersion={() => hacerVersion(abierto)} onStudio={() => enReelStudio(abierto)} onCopiar={copiar} />}
        </SheetContent>
      </Sheet>
    </ToolShell>
  );
}

function Ficha({ r, onVersion, onStudio, onCopiar }: { r: Reel; onVersion: () => void; onStudio: () => void; onCopiar: (t: string, aviso: string) => void }) {
  const l = r.lectura ?? {};
  const [verTexto, setVerTexto] = useState(false);
  return (
    <div className="space-y-5 pb-4">
      <SheetHeader className="space-y-1 text-left">
        <SheetTitle className="font-display text-[20px] leading-snug">{titular(r)}</SheetTitle>
        <SheetDescription className="text-[13px]">
          @{r.owner ?? "instagram"} · {cifra(r.views)} vistas · {cifra(r.likes)} me gusta · {cifra(r.comments)} comentarios
          {r.posted_at ? ` · ${new Date(r.posted_at).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })}` : ""}
        </SheetDescription>
      </SheetHeader>

      {/* El reel original, con el reproductor oficial de Instagram: gratis y siempre al día. */}
      <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-2xl border border-border bg-black">
        <iframe title={`Reel de @${r.owner ?? "instagram"}`} src={`https://www.instagram.com/reel/${r.shortcode}/embed/`}
          className="aspect-[9/16] w-full" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={onVersion}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-[14px] font-semibold text-primary-foreground">
          <Sparkles className="h-4 w-4" /> Hacer mi versión
        </button>
        <button type="button" onClick={onStudio}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-border px-4 text-[14px] text-foreground hover:bg-secondary/60">
          <Wand2 className="h-4 w-4" /> Recrearlo en Reel Studio
        </button>
      </div>
      <p className="-mt-3 text-[12px] text-muted-foreground">
        «Hacer mi versión» lo analiza y te da el guion para grabar ({CREDIT_COSTS.reel_analyze} créditos). En Reel Studio ves el total antes de crear.
      </p>

      {(l.por_que || l.estructura?.length) ? (
        <section className="space-y-3 rounded-2xl border border-border p-4">
          {l.por_que && (<div><p className="text-[12px] uppercase tracking-wider text-muted-foreground">Por qué funciona</p><p className="mt-1 text-[14px] text-foreground">{l.por_que}</p></div>)}
          {!!l.estructura?.length && (
            <div>
              <p className="text-[12px] uppercase tracking-wider text-muted-foreground">Cómo está armado</p>
              <ol className="mt-1 space-y-1">
                {l.estructura.map((p, i) => (
                  <li key={i} className="flex gap-2 text-[14px] text-foreground"><span className="w-4 shrink-0 text-muted-foreground">{i + 1}</span>{p}</li>
                ))}
              </ol>
            </div>
          )}
          <p className="text-[12px] text-muted-foreground">{[r.tipo === "nicho" ? "Le habla a quien ya sabe del tema" : r.tipo ? "Atrae gente nueva" : "", r.intencion === "venta" ? "vende algo" : r.intencion ? "no vende: atrae público" : ""].filter(Boolean).join(" · ")}</p>
        </section>
      ) : null}

      {l.plantilla && (
        <section className="space-y-1">
          <p className="text-[12px] uppercase tracking-wider text-muted-foreground">El gancho, para tu tema</p>
          <div className="flex items-start gap-2 rounded-2xl border border-border p-3">
            <p className="flex-1 text-[14px] text-foreground">{l.plantilla}</p>
            <button type="button" onClick={() => onCopiar(l.plantilla!, "Gancho copiado.")} aria-label="Copiar gancho" className="rounded-full p-2 text-muted-foreground hover:text-foreground"><Copy className="h-4 w-4" /></button>
          </div>
        </section>
      )}

      {(r.transcript || r.caption) && (
        <section>
          <button type="button" onClick={() => setVerTexto(v => !v)} className="text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            {verTexto ? "Ocultar lo que dice" : r.transcript ? "Ver lo que dice (transcripción)" : "Ver el texto de la publicación"}
          </button>
          {verTexto && <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">{r.transcript || r.caption}</p>}
        </section>
      )}

      <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ExternalLink className="h-3.5 w-3.5" /> Abrir en Instagram
      </a>
    </div>
  );
}
