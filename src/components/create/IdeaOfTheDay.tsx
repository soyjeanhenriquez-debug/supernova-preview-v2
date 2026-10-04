import { useEffect, useMemo, useState } from "react";
import { Sparkles, Flame, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CreateFromIdeaSheet } from "@/components/create/CreateFromIdeaSheet";
import { type Offer, NICHE_LABEL, flagFor, MARKET_NAME } from "@/lib/offers";
import { ideaFromOffer, daysEvidence, fmtNum } from "@/lib/recommendTarget";
import { pickOfTheDay, dayKey } from "@/lib/sideHustles";

/**
 * "Tu idea de hoy" (arriba del Inicio): 1 oferta de la lista curada de ganadoras (is_winner), elegida
 * de forma fija para este día y este usuario, con su prueba real (días pagando anuncios) y el botón
 * "Crear con esta idea". Una sola consulta corta (límite 12); abrir la hoja es gratis.
 * Sin acceso al catálogo (vitrina) o sin datos, no se muestra.
 */
const COLS = "id, product_name, sample_title, page_name, sample_body, target_audience, mechanism, why_wins, price_hint, days_active, active_ads, niche, market";
type Row = Pick<Offer, "id" | "product_name" | "sample_title" | "page_name" | "sample_body" | "target_audience" | "mechanism"
  | "why_wins" | "price_hint" | "days_active" | "active_ads" | "niche" | "market">;

export function IdeaOfTheDay() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.from("offers").select(COLS)
      .eq("is_winner", true).eq("enrich_failed", false).is("excluded_reason", null)
      .order("winner_index", { ascending: false, nullsFirst: false })
      .limit(12)
      .then(({ data, error }) => { if (alive) setRows(error ? [] : ((data ?? []) as unknown as Row[])); });
    return () => { alive = false; };
  }, []);

  const pick = useMemo(() => (rows ? pickOfTheDay(rows, dayKey(), user?.id) : null), [rows, user?.id]);
  const idea = useMemo(() => (pick ? ideaFromOffer(pick) : null), [pick]);
  const input = useMemo(() => ({ source: "oferta" as const }), []);

  if (rows === null) return <div className="card-surface rounded-2xl h-[188px] animate-pulse" aria-hidden />;
  if (!pick || !idea) return null;

  const evidence = daysEvidence(pick.days_active);
  return (
    <section className="card-surface rounded-2xl p-5 sm:p-6">
      <p className="text-[10.5px] uppercase tracking-[0.18em] text-primary font-semibold flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5" /> Tu idea de hoy
      </p>
      <h3 className="font-display font-semibold text-[19px] sm:text-[21px] leading-snug text-foreground mt-2 line-clamp-2 break-words">{idea.title}</h3>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
        {evidence && <span className="inline-flex items-center gap-1 text-foreground"><Flame className="w-3.5 h-3.5 text-primary" /> Lleva {evidence}</span>}
        {pick.active_ads > 0 && <span>{fmtNum(pick.active_ads)} anuncios activos</span>}
        <span>{flagFor(pick.market)} {MARKET_NAME[pick.market] ?? pick.market}</span>
        {pick.niche && <span>{NICHE_LABEL[pick.niche] ?? pick.niche}</span>}
      </div>
      {pick.why_wins && <p className="text-[13px] text-foreground/85 mt-3 leading-relaxed line-clamp-2"><span className="text-muted-foreground">Por qué funciona:</span> {pick.why_wins}</p>}
      <div className="mt-4 flex flex-col sm:flex-row gap-2">
        <button onClick={() => setOpen(true)} className="h-12 sm:h-11 px-5 btn-primary-nova rounded-xl text-[14px] font-semibold inline-flex items-center justify-center gap-2">
          <Sparkles className="w-4 h-4" /> Crear con esta idea
        </button>
        <a href={`#/ofertas/${pick.id}`} className="h-11 px-4 rounded-xl border border-border text-[13px] font-semibold text-foreground hover:border-foreground/30 inline-flex items-center justify-center gap-1.5">
          Ver la oferta <ArrowRight className="w-4 h-4" />
        </a>
      </div>
      <p className="text-[11px] text-muted-foreground mt-3">Sale de las ofertas ganadoras del catálogo. Cada día te elegimos una. Antes de gastar, ves el costo.</p>
      {open && <CreateFromIdeaSheet idea={idea} input={input} onClose={() => setOpen(false)} />}
    </section>
  );
}
