import { useEffect, useMemo, useState } from "react";
import { Sparkles, Flame, ArrowRight, Lightbulb } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessProfile } from "@/lib/businessProfile";
import { useBusinessModel, type BusinessModel } from "@/lib/tools";
import { CreateFromIdeaSheet } from "@/components/create/CreateFromIdeaSheet";
import { type Offer } from "@/lib/offers";
import {
  SIDE_HUSTLES, HUSTLE_BY_ID, EXAMPLES_LIMIT, PROVEN_DAYS, startCost, evidenceLabel, type SideHustle,
} from "@/lib/sideHustles";
import {
  recommendTarget, targetInfo, ideaFromOffer, daysEvidence, type HustleKind, type IdeaDraft, type RecInput,
} from "@/lib/recommendTarget";

/**
 * Ideas de side hustle: 6 caminos para empezar de cero. Cada uno dice qué es, cuánto cuesta empezar
 * en créditos (la primera pieza que recomienda la IA) y la primera acción. Los ejemplos y cifras salen
 * SOLO de ofertas reales del catálogo: una consulta corta por categoría (límite 6, sin contar filas,
 * sin ILIKE), con más de 90 días pagando anuncios y replicables por una persona sola. Sin datos no se
 * enseña ninguna cifra. Mirar es gratis; lo que gasta lo dice el botón de la hoja antes de tocarlo.
 */
const COLS = "id, product_name, sample_title, page_name, sample_body, target_audience, mechanism, why_wins, price_hint, days_active";
type Row = Pick<Offer, "id" | "product_name" | "sample_title" | "page_name" | "sample_body" | "target_audience" | "mechanism"
  | "why_wins" | "price_hint" | "days_active">;

/** El camino que la IA recomienda según lo que la persona dijo que construye (Inicio). */
const MODEL_HUSTLE: Record<BusinessModel, HustleKind> = { low: "low_ticket", high: "marca", marca: "faceless" };

type Open = { idea: IdeaDraft; input: RecInput };
type LooseQuery = {
  eq(c: string, v: unknown): LooseQuery; in(c: string, v: unknown[]): LooseQuery; gte(c: string, v: unknown): LooseQuery;
  is(c: string, v: null): LooseQuery; order(c: string, o: { ascending: boolean }): LooseQuery;
  limit(n: number): PromiseLike<{ data: unknown; error: unknown }>;
};

export function IdeasPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { model } = useBusinessModel();
  const { profile } = useBusinessProfile();
  const [examples, setExamples] = useState<Partial<Record<HustleKind, Row[]>>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Open | null>(null);

  useEffect(() => {
    let alive = true;
    const withData = SIDE_HUSTLES.filter((h) => h.offers);
    Promise.all(withData.map(async (h) => {
      // Filtros por columna dinámica: el tipo generado de Supabase no los sigue (se vuelve infinito).
      let q = (supabase.from("offers").select(COLS) as unknown as LooseQuery)
        .eq("is_primary", true).eq("enrich_failed", false).is("excluded_reason", null)
        .gte("days_active", PROVEN_DAYS).gte("copy_score", 4);
      for (const [col, v] of Object.entries(h.offers!.eq ?? {})) q = q.eq(col, v);
      for (const [col, v] of Object.entries(h.offers!.in ?? {})) q = q.in(col, v);
      const { data, error } = await q.order("days_active", { ascending: false }).limit(EXAMPLES_LIMIT);
      return [h.id, error ? [] : ((data ?? []) as unknown as Row[])] as const;
    })).then((pairs) => {
      if (!alive) return;
      setExamples(Object.fromEntries(pairs));
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const recommended = HUSTLE_BY_ID[MODEL_HUSTLE[model]];
  const ordered = useMemo(() => [recommended, ...SIDE_HUSTLES.filter((h) => h.id !== recommended.id)], [recommended]);

  /** Idea de un ejemplo real, recomendada según el camino (p. ej. marca personal → carrusel). */
  const openExample = (h: SideHustle, o: Row) => {
    setOpen({ idea: { ...ideaFromOffer(o), source: "side_hustle" }, input: { source: "side_hustle", hustle: h.id } });
  };

  /** Primera acción del camino: la idea más probada, o tu producto, o elegir una idea. */
  const start = (h: SideHustle) => {
    const top = examples[h.id]?.[0];
    if (top) return openExample(h, top);
    const product = profile.product.trim();
    if (product) {
      return setOpen({
        idea: {
          source: "side_hustle", title: product.slice(0, 80), product,
          who: profile.who.trim() || `Personas interesadas en ${product}`,
          promise: profile.promise.trim() || `Lograr lo que ofrece ${product}`,
          price: profile.price.trim() || undefined,
        },
        input: { source: "side_hustle", hustle: h.id },
      });
    }
    if (h.explore) onNavigate?.(h.explore.page);
  };
  const startLabel = (h: SideHustle) =>
    examples[h.id]?.length ? "Crear con la idea más probada"
      : profile.product.trim() ? "Crear con mi producto"
      : h.explore ? h.explore.label : null;

  const recTarget = targetInfo(recommendTarget({ source: "side_hustle", hustle: recommended.id }).target);

  return (
    <div className="max-w-[1180px] mx-auto space-y-6 py-2">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Encontrar</p>
        <h1 className="page-heading font-display text-2xl text-foreground mt-1">Ideas de side hustle</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          Elige un camino para empezar desde cero. Cada uno te dice qué es, cuánto cuesta empezar y qué hacer primero. Mirar es gratis.
        </p>
      </div>

      {/* La IA eligió por ti: el único botón ámbar de la pantalla */}
      <section className="rounded-2xl border border-primary/40 bg-primary/5 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" /> La IA eligió por ti
        </p>
        <h2 className="font-display font-semibold text-[19px] text-foreground mt-2">{recommended.title}</h2>
        <p className="text-[13px] text-foreground/85 mt-1 leading-relaxed">{recommended.what}</p>
        <p className="text-[12px] text-muted-foreground mt-2">Primera pieza: {recTarget.label.toLowerCase()} · {recTarget.costLabel}</p>
        {startLabel(recommended) && (
          <button onClick={() => start(recommended)} disabled={loading}
            className="mt-4 w-full sm:w-auto h-12 px-5 btn-primary-nova rounded-xl text-[14px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
            <Sparkles className="w-4 h-4" /> {loading ? "Buscando ideas reales…" : startLabel(recommended)}
          </button>
        )}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {ordered.map((h) => {
          const rows = examples[h.id] ?? [];
          const label = h.offers ? evidenceLabel(rows.length) : null;
          const cost = startCost(h.id);
          const action = startLabel(h);
          return (
            <article key={h.id} className="card-surface rounded-2xl p-5 flex flex-col min-w-0">
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-lg bg-secondary text-foreground flex items-center justify-center shrink-0"><Lightbulb className="w-4 h-4" /></span>
                <div className="min-w-0">
                  <h3 className="font-display font-semibold text-[16px] text-foreground leading-snug">{h.title}</h3>
                  <p className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed">{h.what}</p>
                </div>
              </div>

              <p className="mt-3 text-[12px] text-foreground">Empezar cuesta <span className="font-semibold tabular-nums">{cost.label.startsWith("guion") ? `${cost.credits} créditos (el guion)` : cost.label}</span></p>
              <ol className="mt-2 space-y-1 text-[12.5px] text-foreground/85">
                {h.steps.map((s, i) => (
                  <li key={s} className="flex gap-2"><span className="text-muted-foreground tabular-nums">{i + 1}.</span><span>{s}</span></li>
                ))}
              </ol>

              {h.offers && (
                <div className="mt-4 border-t border-border/60 pt-3">
                  {loading ? (
                    <div className="space-y-2" aria-hidden>{[0, 1].map((i) => <div key={i} className="h-10 rounded-lg bg-secondary/40 animate-pulse" />)}</div>
                  ) : label ? (
                    <>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5"><Flame className="w-3.5 h-3.5 text-primary" /> {label}</p>
                      <ul className="mt-2 space-y-1.5">
                        {rows.slice(0, 3).map((o) => (
                          <li key={o.id}>
                            <button onClick={() => openExample(h, o)}
                              className="w-full min-h-[44px] rounded-lg border border-border px-3 py-2 text-left flex items-center gap-2 hover:border-foreground/30 transition-colors">
                              <span className="min-w-0 flex-1">
                                <span className="block text-[12.5px] font-medium text-foreground truncate">{o.product_name || o.sample_title || o.page_name}</span>
                                <span className="block text-[11px] text-muted-foreground truncate">{daysEvidence(o.days_active)}{o.price_hint ? ` · ${o.price_hint}` : ""}</span>
                              </span>
                              <span className="shrink-0 text-[11.5px] text-muted-foreground inline-flex items-center gap-1">Crear <ArrowRight className="w-3 h-3" /></span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="text-[11.5px] text-muted-foreground">Hoy no hay ejemplos probados en el catálogo para este camino.</p>
                  )}
                </div>
              )}

              {action && (
                <div className="mt-auto pt-4">
                  <button onClick={() => start(h)} disabled={loading && !!h.offers}
                    className="w-full h-11 rounded-xl border border-border text-[13px] font-semibold text-foreground hover:border-foreground/30 inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
                    {action} <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground max-w-3xl">
        Los ejemplos son ofertas reales de la Biblioteca de Anuncios de Meta que llevan más de {PROVEN_DAYS} días pagando anuncios. Que algo se anuncie
        mucho tiempo es una buena señal, no una garantía de ventas.
      </p>

      {open && <CreateFromIdeaSheet idea={open.idea} input={open.input} onClose={() => setOpen(null)} />}
    </div>
  );
}

