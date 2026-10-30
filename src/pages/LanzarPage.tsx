import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, ArrowRight, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdMediaPreview } from "@/components/AdMediaPreview";
import { AgenteFirma } from "@/components/agentes/AgenteFirma";
import { SiguientePaso } from "@/components/agentes/SiguientePaso";
import { nivelOferta } from "@/components/offers/offerUi";
import { AGENTES, type AgenteId } from "@/lib/agentes";
import { useFeatureAccess } from "@/lib/features";
import { type Offer, NICHE_LABEL, CANAL_CORTO, anunciosActivos, diasPagando, flagFor } from "@/lib/offers";

/**
 * Ulises, el agente de lanzamiento (29-oct-2026, misión de Jean: 2-3 preguntas, siempre algo usable y una pregunta
 * de avance). Elige contigo QUÉ lanzar con datos reales del catálogo y te deja el plan con el resto del equipo.
 *  · 3 preguntas, todas con "Decide tú" ya marcado: se puede pedir las opciones sin contestar nada.
 *  · Propone las 3 ofertas con más escala (anuncios activos) que cumplen lo elegido. Solo lee la base: es gratis.
 *  · Al elegir una, el plan: tu versión → Hefesto → Atenea → Hermes → Robin Hood → Zeus → Argos. Se guarda en este
 *    navegador para volver a él.
 */

type Canal = "whatsapp" | "pagina" | "all";
type Idioma = "es" | "pt" | "all";
const CANALES: { v: Canal; l: string }[] = [
  { v: "whatsapp", l: "💬 Por WhatsApp" }, { v: "pagina", l: "🔗 Con página de ventas" }, { v: "all", l: "Decide tú" },
];
const IDIOMAS: { v: Idioma; l: string }[] = [
  { v: "es", l: "Español" }, { v: "pt", l: "Portugués (para modelarla al español)" }, { v: "all", l: "Decide tú" },
];
const COLS = "id,page_id,page_name,product_name,market,language,niche,price_hint,active_ads,live_active_ads,live_capped,days_active,canal,cover_url,sample_ad_url,source_data,escala";
const ELEGIDA_KEY = "supernova:ulises-elegida";

type Paso = { agente: AgenteId | null; titulo: string; linea: string; hash: string; generador?: string };

function plan(o: Offer, canSee: (p: string) => boolean): Paso[] {
  const nombre = o.product_name || o.page_name || "tu oferta";
  const pasos: Paso[] = [
    { agente: null, titulo: "Haz tu versión", linea: `Tu oferta en español a partir de «${nombre}»: qué vendes, a quién y a qué precio.`, hash: `#/ofertas/${o.id}` },
    { agente: "producto", titulo: "Tu producto", linea: "El recetario, la guía o el curso que entregas, listo en PDF.", hash: "#/crear-producto" },
    { agente: "pagina", titulo: "Tu página de venta", linea: "Mientras Atenea llega: el texto de tu página, listo para pegar.", hash: "#/generadores", generador: "landing-copy" },
    { agente: "ventas", titulo: o.canal === "whatsapp" ? "Tus mensajes de WhatsApp" : "Tus mensajes para cerrar", linea: "Lo que respondes cuando alguien escribe, para cerrar la venta.", hash: "#/generadores", generador: "dm-script" },
    { agente: "anuncios", titulo: "Tus anuncios", linea: "Imágenes para tus anuncios, modeladas de los que ya funcionan.", hash: "#/creativos" },
    { agente: "reels", titulo: "Tu reel", linea: "El video que acompaña tus anuncios, con voz e imágenes.", hash: "#/con-tu-cara/reel-ia" },
    { agente: "resultados", titulo: "Mide y decide", linea: "A los 3 días: qué anuncio apagar y cuál escalar.", hash: "#/resultados" },
  ];
  return pasos.filter(p => p.hash !== "#/crear-producto" || canSee("Crear producto"));
}

function ir(p: Paso) {
  if (p.generador) {
    try { localStorage.setItem("supernova_generator_prefill", JSON.stringify({ generator: p.generador })); } catch { /* sin almacenamiento */ }
  }
  window.location.hash = p.hash;
  window.scrollTo({ top: 0 });
}

function Chips<T extends string>({ titulo, opciones, valor, cambiar }: { titulo: string; opciones: { v: T; l: string }[]; valor: T; cambiar: (v: T) => void }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[13px] font-semibold text-foreground">{titulo}</h3>
      <div className="flex flex-wrap gap-2">
        {opciones.map(o => (
          <button key={o.v} type="button" onClick={() => cambiar(o.v)} aria-pressed={valor === o.v}
            className={`min-h-[40px] px-3.5 rounded-full border text-[13px] inline-flex items-center gap-1.5 transition-colors ${valor === o.v ? "bg-foreground text-background border-foreground" : "border-border text-foreground hover:border-foreground/40"}`}>
            {valor === o.v && <Check className="w-3.5 h-3.5" />}{o.l}
          </button>
        ))}
      </div>
    </section>
  );
}

export function LanzarPage() {
  const { canSee } = useFeatureAccess();
  const [canal, setCanal] = useState<Canal>("all");
  const [tema, setTema] = useState("all");
  const [idioma, setIdioma] = useState<Idioma>("all");
  const [temas, setTemas] = useState<{ v: string; n: number }[]>([]);
  const [opciones, setOpciones] = useState<Offer[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [elegida, setElegida] = useState<Offer | null>(() => {
    try { const v = localStorage.getItem(ELEGIDA_KEY); return v ? (JSON.parse(v) as Offer) : null; } catch { return null; }
  });

  // Temas con ofertas dentro del canal elegido (los 8 con más ofertas).
  useEffect(() => {
    let vivo = true;
    supabase.rpc("offer_filter_options" as never, { p_canal: canal === "all" ? null : canal } as never).then(({ data }) => {
      if (!vivo || !data) return;
      const n = ((data as { nicho?: { v: string; n: number }[] }).nicho ?? []).filter(o => NICHE_LABEL[o.v] && o.v !== "otro" && o.v !== "entretenimiento");
      setTemas(n.slice(0, 8));
      if (tema !== "all" && !n.some(o => o.v === tema)) setTema("all");
    });
    return () => { vivo = false; };
  }, [canal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Las 3 con más escala que cumplen lo elegido. Sin IA: solo la base.
  useEffect(() => {
    let vivo = true;
    setCargando(true);
    (async () => {
      let q = supabase.from("offers").select(COLS).eq("is_primary", true).eq("enrich_failed", false)
        .or("excluded_reason.is.null,excluded_reason.eq.adult")
        .in("offer_type", ["infoproducto", "saas_app", "comunidad"]);
      if (canal !== "all") q = q.filter("canal", "eq", canal);
      if (tema !== "all") q = q.eq("niche", tema);
      // "Decide tú" = español o portugués: lo que se modela más fácil para LATAM (lo de EE. UU. en inglés queda fuera).
      q = idioma !== "all" ? q.eq("language", idioma) : q.in("language", ["es", "pt"]);
      const { data } = await q.order("escala" as never, { ascending: false }).order("days_active", { ascending: false }).limit(3);
      if (vivo) { setOpciones((data ?? []) as unknown as Offer[]); setCargando(false); }
    })();
    return () => { vivo = false; };
  }, [canal, tema, idioma]);

  const elegir = (o: Offer | null) => {
    setElegida(o);
    try { if (o) localStorage.setItem(ELEGIDA_KEY, JSON.stringify(o)); else localStorage.removeItem(ELEGIDA_KEY); } catch { /* sin almacenamiento */ }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const temaOpciones = useMemo(
    () => [...temas.map(t => ({ v: t.v, l: NICHE_LABEL[t.v] })), { v: "all", l: "Decide tú" }],
    [temas],
  );

  return (
    <div className="space-y-6 max-w-5xl">
      <header className="space-y-1">
        <AgenteFirma agente="lanzamiento" />
        <h1 className="font-display font-bold text-2xl text-foreground">Elige qué lanzar</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Tres preguntas y te propongo 3 negocios que ya venden, con sus anuncios reales. Eliges uno y te dejo el plan con todo el
          equipo. Mirar y elegir es gratis.
        </p>
      </header>

      {elegida ? (
        <section className="space-y-4">
          <div className="card-surface rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row gap-4">
            <div className="relative w-full sm:w-44 aspect-[4/5] sm:aspect-square rounded-xl overflow-hidden bg-secondary/40 shrink-0">
              <AdMediaPreview fill coverUrl={elegida.cover_url} adUrl={elegida.sample_ad_url ?? undefined} pageId={elegida.page_id}
                pageName={elegida.page_name ?? "Oferta"} title={elegida.product_name ?? undefined} />
            </div>
            <div className="min-w-0 space-y-1.5">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Vas a lanzar</p>
              <h2 className="font-display text-xl font-semibold text-foreground">{elegida.product_name || elegida.page_name}</h2>
              <p className="text-[13px] text-muted-foreground">
                {anunciosActivos(elegida).texto} anuncios · {nivelOferta(elegida).label} · {elegida.canal ? CANAL_CORTO[elegida.canal] : "Canal por revisar"}
                {elegida.price_hint ? ` · ${elegida.price_hint}` : ""}
              </p>
              <button onClick={() => elegir(null)} className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground pt-1">
                <RotateCcw className="w-3.5 h-3.5" /> Elegir otra
              </button>
            </div>
          </div>

          <ol className="space-y-2">
            {plan(elegida, canSee).map((p, i) => {
              const a = p.agente ? AGENTES[p.agente] : null;
              return (
                <li key={p.titulo}>
                  <button onClick={() => ir(p)} className="w-full card-surface rounded-xl px-4 py-3 flex items-center gap-3 text-left hover:border-foreground/30 transition-colors">
                    <span className="w-7 h-7 rounded-full bg-secondary text-foreground text-[12px] font-bold grid place-items-center shrink-0">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold text-foreground">{p.titulo}{a && <span className="font-normal text-muted-foreground"> · {a.emoji} {a.nombre}</span>}</span>
                      <span className="block text-[12.5px] text-muted-foreground">{p.linea}</span>
                    </span>
                    <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </button>
                </li>
              );
            })}
          </ol>

          <SiguientePaso agente="lanzamiento" hacia={canSee("Crear producto") ? undefined : "ventas"} />
        </section>
      ) : (
        <>
          <div className="card-surface rounded-2xl p-4 sm:p-5 space-y-5">
            <Chips titulo="1. ¿Cómo quieres vender?" opciones={CANALES} valor={canal} cambiar={(v) => setCanal(v as Canal)} />
            <Chips titulo="2. ¿De qué tema?" opciones={temaOpciones} valor={tema} cambiar={setTema} />
            <Chips titulo="3. ¿En qué idioma está lo que vas a modelar?" opciones={IDIOMAS} valor={idioma} cambiar={(v) => setIdioma(v as Idioma)} />
          </div>

          <section className="space-y-3">
            <h2 className="text-[13px] font-semibold text-foreground">Mis 3 propuestas · las que tienen más anuncios activos</h2>
            {cargando ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6"><Loader2 className="w-4 h-4 animate-spin" /> Buscando en el catálogo…</div>
            ) : !opciones?.length ? (
              <div className="card-surface rounded-xl p-5 text-sm text-muted-foreground">
                No hay ofertas con esa combinación. Cambia una respuesta a «Decide tú» y te propongo otras.
              </div>
            ) : (
              <div className="grid sm:grid-cols-3 gap-3">
                {opciones.map(o => (
                  <article key={o.id} className="card-surface rounded-2xl overflow-hidden flex flex-col">
                    <div className="relative aspect-[4/5] bg-secondary/40">
                      <AdMediaPreview fill coverUrl={o.cover_url} adUrl={o.sample_ad_url ?? undefined} pageId={o.page_id}
                        pageName={o.page_name ?? "Oferta"} title={o.product_name ?? undefined} />
                    </div>
                    <div className="p-3.5 space-y-2 flex-1 flex flex-col">
                      <p className="text-[11px] text-muted-foreground">{nivelOferta(o).label} · {flagFor(o.market)} {o.canal ? CANAL_CORTO[o.canal] : ""}</p>
                      <h3 className="text-[14.5px] font-semibold text-foreground leading-snug">{o.product_name || o.page_name}</h3>
                      <p className="text-[12.5px] text-muted-foreground">
                        {anunciosActivos(o).texto} anuncios · {o.days_active > 0 ? `${diasPagando(o)} días` : "días sin dato"}{o.price_hint ? ` · ${o.price_hint}` : ""}
                      </p>
                      <button onClick={() => elegir(o)} className="mt-auto w-full min-h-[44px] rounded-xl btn-primary-nova text-[13px] font-semibold">Lanzar esta</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
