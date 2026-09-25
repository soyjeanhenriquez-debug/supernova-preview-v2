import { useEffect, useMemo, useState } from "react";
import { Calculator, ShieldCheck, ShoppingCart, ArrowUpRight, Info, Loader2, PlusCircle, Layers, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCredits, CREDIT_COSTS } from "@/hooks/useCredits";
import { fnHeaders, fnErrorMessage, readBilling } from "@/lib/fnAuth";
import type { Offer } from "@/lib/offers";
import { type OfferIntel, FUNNEL_LABEL } from "@/lib/offerIntel";
import { calcLtv, parsePriceText, TYPICAL_RATES, type LtvInputs } from "@/lib/ltv";
import { PLATFORM_FEES } from "@/lib/pricing";

/**
 * Pestaña "Números" de la ficha de una oferta: el Mapa del negocio.
 *  1) Lo que su checkout deja ver SIN pagar (precio real, garantía, order bumps, si tiene upsell).
 *  2) Cuánto vale un cliente de este embudo (LTV) y cuánto se puede pagar en anuncios por venta.
 * Los precios salen del checkout cuando los hay; las tasas son supuestos típicos que el usuario
 * ajusta. Es una estimación: nunca se presenta como promesa de ventas.
 */
export function BusinessMap({ o, intel, working }: { o: Offer; intel: OfferIntel | null; working: boolean }) {
  const co = intel?.checkout_data ?? null;
  const cur = co?.currency ?? "US$";
  const money = (n: number) => `${cur} ${n.toLocaleString("es-ES", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

  const defaults = useMemo<LtvInputs>(() => {
    // App gratis: lo que se cobra es la compra más barata dentro de la app.
    const appPrices = (co?.app?.in_app ?? []).map((x) => x.price).filter((p): p is number => typeof p === "number" && p > 0);
    const appEntry = co?.app && !co.price ? (appPrices.length ? Math.min(...appPrices) : co.app.in_app_min) : null;
    const price = appEntry || co?.price || parsePriceText(intel?.price_text) || parsePriceText(o.price_hint) || 27;
    const bumpPrices = (co?.bumps ?? []).map((b) => b.price).filter((p): p is number => typeof p === "number" && p > 0);
    const bumpPrice = bumpPrices.length ? Math.round(bumpPrices.reduce((a, b) => a + b, 0) / bumpPrices.length * 100) / 100 : 0;
    // Upsell: si el checkout dice que existe pero su precio no se ve, se propone el doble del
    // principal (marcado como propuesto). Si no existe, arranca en 0.
    const upsellPrice = co?.has_upsell ? Math.round(price * 2) : 0;
    const platform = PLATFORM_FEES.find((p) => p.label === (co?.platform ?? intel?.checkout_platform)) ?? PLATFORM_FEES[1];
    return {
      price, bumpPrice, bumpTakePct: bumpPrice ? TYPICAL_RATES.bumpTakePct : 0,
      upsellPrice, upsellTakePct: upsellPrice ? TYPICAL_RATES.upsellTakePct : 0,
      downsellPrice: upsellPrice ? Math.round(upsellPrice / 2) : 0, downsellTakePct: upsellPrice ? TYPICAL_RATES.downsellTakePct : 0,
      subPrice: 0, subTakePct: TYPICAL_RATES.subTakePct, subMonths: TYPICAL_RATES.subMonths,
      feePct: platform.feePct, feeFixed: platform.feeFixed, refundPct: TYPICAL_RATES.refundPct,
    };
  }, [co, intel?.price_text, intel?.checkout_platform, o.price_hint]);

  const [inp, setInp] = useState<LtvInputs>(defaults);
  // La ficha llega después de abrir la hoja: cuando aparecen datos reales, se recalcula desde ellos.
  useEffect(() => { setInp(defaults); }, [defaults]);
  const r = calcLtv(inp);
  const set = (k: keyof LtvInputs) => (v: number) => setInp((s) => ({ ...s, [k]: v }));
  const funnelGain = Math.max(0, r.net - r.netFrontOnly);

  // Escalera propuesta con IA (business-map): se lee la guardada; armarla o pedir otra cobra.
  const { applyServerCharge, canAfford } = useCredits();
  const [ladder, setLadder] = useState<Ladder | null>(null);
  const [ladderBusy, setLadderBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    setLadder(null);
    // Filtra por el propio usuario: el admin puede leer las de todos.
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase.from("business_maps").select("ladder")
        .eq("offer_id", o.id).eq("user_id", session.user.id).maybeSingle();
      if (alive && data?.ladder) setLadder(data.ladder as unknown as Ladder);
    })();
    return () => { alive = false; };
  }, [o.id]);

  const buildLadder = async (regenerate: boolean) => {
    if (!canAfford("business_map")) {
      toast.error(`Te faltan créditos: la escalera cuesta ${CREDIT_COSTS.business_map}`, { description: "Recarga créditos o espera a que se renueven." });
      return;
    }
    setLadderBusy(true);
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/business-map`, {
        method: "POST", headers: await fnHeaders(), body: JSON.stringify({ offer_id: o.id, regenerate }),
      });
      if (!resp.ok) throw new Error(await fnErrorMessage(resp, "No se pudo armar tu escalera"));
      const data = await resp.json();
      applyServerCharge("business_map", readBilling(resp), `Escalera · ${(co?.product_name ?? o.product_name ?? "oferta").slice(0, 40)}`);
      setLadder(data.ladder as Ladder);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo armar tu escalera");
    } finally {
      setLadderBusy(false);
    }
  };

  const applyLadder = (l: Ladder) => {
    const of = (t: StepType) => l.pasos.filter((p) => p.tipo === t);
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 100) / 100 : 0);
    const bumps = of("bump"), up = of("upsell")[0], down = of("downsell")[0], sub = of("suscripcion")[0], main = of("principal")[0];
    setInp((s) => ({
      ...s,
      price: main?.precio ?? s.price,
      bumpPrice: avg(bumps.map((b) => b.precio)), bumpTakePct: avg(bumps.map((b) => b.tasa_tipica_pct)),
      upsellPrice: up?.precio ?? 0, upsellTakePct: up?.tasa_tipica_pct ?? 0,
      downsellPrice: down?.precio ?? 0, downsellTakePct: down?.tasa_tipica_pct ?? 0,
      subPrice: sub?.precio ?? 0, subTakePct: sub?.tasa_tipica_pct ?? 0,
    }));
    toast.success("Listo: la calculadora usa tu escalera.");
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-display font-semibold text-[17px] text-foreground">Cuánto vale un cliente de esta oferta</h4>
        <p className="text-[12.5px] text-muted-foreground mt-1">
          Un embudo no vende solo el producto: suma order bump, upsell y downsell. Por eso cada cliente puede dejar
          bastante más que el precio de entrada, y eso decide cuánto puedes pagar en anuncios.
        </p>
      </div>

      {/* 1) Lo que se ve en su checkout */}
      <section className="rounded-2xl border border-border bg-secondary/20 p-3 sm:p-4 space-y-3">
        <h5 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
          <ShoppingCart className="w-3.5 h-3.5" /> {co?.app ? "Lo que vimos en su tienda de apps" : "Lo que vimos en su checkout"}
        </h5>
        {working && !co ? (
          <div className="flex items-center gap-2.5 text-[13px] text-muted-foreground py-1"><Loader2 className="w-4 h-4 animate-spin text-primary" /> Buscando su checkout…</div>
        ) : co?.app ? (
          <div className="space-y-2.5">
            <Row label="App" value={co.product_name ?? "—"} />
            <Row label="Descarga" value={co.price ? money(co.price) : "Gratis"} strong />
            <div>
              <div className="text-[12px] text-muted-foreground mb-1.5">Compras dentro de la app {co.app.in_app.length ? `(${co.app.in_app.length})` : ""}</div>
              {co.app.in_app.length ? (
                <ul className="space-y-1">
                  {co.app.in_app.map((x, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 text-[12.5px]">
                      <span className="text-foreground/90 min-w-0 line-clamp-2">{x.name}</span>
                      <span className="tabular-nums text-foreground shrink-0">{x.price !== null ? money(x.price) : "—"}</span>
                    </li>
                  ))}
                </ul>
              ) : co.app.in_app_min !== null && co.app.in_app_max !== null ? (
                <p className="text-[12.5px] text-foreground/90">De {money(co.app.in_app_min)} a {money(co.app.in_app_max)} por compra <span className="text-muted-foreground">(la tienda no muestra la lista)</span></p>
              ) : <p className="text-[12.5px] text-foreground/80">No se ven.</p>}
            </div>
            {co.app.rating !== null && (
              <Row label="Valoración" value={`${co.app.rating.toLocaleString("es-ES", { maximumFractionDigits: 1 })} ★ · ${(co.app.ratings_count ?? 0).toLocaleString("es-ES")} reseñas`} />
            )}
            {co.app.installs !== null && <Row label="Descargas" value={`más de ${co.app.installs.toLocaleString("es-ES")}`} />}
            <p className="text-[11px] text-muted-foreground">
              Datos públicos de {co.app.store}. Descargas y reseñas muestran demanda, no ventas. Los precios cambian según el país.
            </p>
          </div>
        ) : co ? (
          <div className="space-y-2.5">
            <Row label="Producto principal" value={co.product_name ?? "—"} />
            <Row label="Precio" value={co.price !== null ? `${money(co.price)}${co.subscription ? ` · suscripción${co.subscription.interval ? ` (${INTERVAL_LABEL[co.subscription.interval] ?? co.subscription.interval})` : ""}` : ""}` : "no visible"} strong />
            <Row label="Garantía" value={co.guarantee_days !== null ? `${co.guarantee_days} días` : "no indica"} icon={<ShieldCheck className="w-3.5 h-3.5" />} />
            <Row label="Upsell después de pagar" value={co.upsell_visible === false ? "No se ve desde este checkout" : co.has_upsell ? "Sí, tiene uno (su precio solo se ve comprando)" : "No tiene"} icon={<ArrowUpRight className="w-3.5 h-3.5" />} />
            <div>
              <div className="text-[12px] text-muted-foreground mb-1.5">Order bumps en el mismo pago {co.bumps.length ? `(${co.bumps.length})` : ""}</div>
              {co.bumps.length ? (
                <ul className="space-y-1">
                  {co.bumps.map((b, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 text-[12.5px]">
                      <span className="text-foreground/90 min-w-0 flex items-start gap-1.5"><PlusCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" /> <span className="line-clamp-2">{b.name}</span></span>
                      <span className="tabular-nums text-foreground shrink-0">{b.price !== null ? money(b.price) : "—"}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-[12.5px] text-foreground/80">No tiene. Es una oportunidad: tu versión puede sumar uno.</p>}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Datos públicos de su checkout de {co.platform}. El precio puede variar según el país desde donde se abre.
            </p>
          </div>
        ) : (
          <p className="text-[12.5px] text-foreground/80">
            {intel?.checkout_platform && !READABLE_CHECKOUTS.includes(intel.checkout_platform)
              ? `Cobra con ${intel.checkout_platform}: todavía no leemos ese checkout. `
              : intel?.funnel_type
                ? `No vimos su checkout: esta oferta lo esconde detrás de ${(FUNNEL_LABEL[intel.funnel_type] ?? "otro paso").toLowerCase()}. `
                : "No vimos su checkout. "}
            Pon abajo el precio que veas y calculamos igual.
          </p>
        )}
      </section>

      {/* 1b) Escalera propuesta con IA */}
      <section className="rounded-2xl border border-border p-3 sm:p-4 space-y-3">
        <h5 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5" /> Tu escalera para esta oferta
        </h5>
        {!ladder ? (
          <div className="space-y-2.5">
            <p className="text-[12.5px] text-foreground/85">
              La IA arma la escalera completa de tu versión: producto principal, order bump, upsell, downsell y, si encaja,
              una suscripción mensual. Copia lo que se ve en su checkout y propone lo que no, con precio y qué % suele tomarlo.
            </p>
            <button onClick={() => void buildLadder(false)} disabled={ladderBusy}
              className="w-full h-11 btn-primary-nova rounded-xl text-[13.5px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
              {ladderBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
              {ladderBusy ? "Armando tu escalera…" : <>Armar mi escalera <span className="opacity-70 font-medium">· {CREDIT_COSTS.business_map} ⚡</span></>}
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {ladder.resumen && <p className="text-[12.5px] text-foreground/85">{ladder.resumen}</p>}
            <ol className="space-y-2">
              {ladder.pasos.map((p, i) => (
                <li key={i} className="rounded-xl border border-border bg-secondary/20 p-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        {STEP_LABEL[p.tipo]}
                        <span className={`rounded px-1 text-[9.5px] ${p.origen === "real" ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>{p.origen}</span>
                      </div>
                      <div className="text-[13.5px] font-semibold text-foreground mt-0.5">{p.nombre}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[14px] font-semibold tabular-nums text-foreground">{`${ladder.moneda} ${p.precio.toLocaleString("es-ES", { maximumFractionDigits: 2 })}`}{p.tipo === "suscripcion" ? "/mes" : ""}</div>
                      <div className="text-[10.5px] text-muted-foreground">{p.tipo === "principal" ? "todos" : `~${p.tasa_tipica_pct}% lo toma`}</div>
                    </div>
                  </div>
                  {p.que_incluye && <p className="text-[12px] text-foreground/80 mt-1.5">{p.que_incluye}</p>}
                  {p.por_que && <p className="text-[11.5px] text-muted-foreground mt-1">Por qué: {p.por_que}</p>}
                </li>
              ))}
            </ol>
            {ladder.advertencias.length > 0 && (
              <ul className="space-y-1">
                {ladder.advertencias.map((a, i) => (
                  <li key={i} className="text-[11.5px] text-foreground/80 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" /> {a}</li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => applyLadder(ladder)} className="h-10 rounded-xl btn-primary-nova text-[12.5px] font-semibold flex items-center justify-center gap-1.5">
                <Calculator className="w-4 h-4" /> Usar en la calculadora
              </button>
              <button onClick={() => void buildLadder(true)} disabled={ladderBusy}
                className="h-10 rounded-xl border border-border text-[12.5px] font-semibold text-foreground hover:border-primary/50 flex items-center justify-center gap-1.5 disabled:opacity-60">
                {ladderBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Pedir otra · {CREDIT_COSTS.business_map} ⚡
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 2) Resultado */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Big label="Cada cliente paga en promedio" value={money(r.gross)} hint="sumando todo el embudo" />
        <Big label="Máximo por venta en anuncios" value={money(Math.max(0, r.net))} hint="para no perder dinero" accent />
        <Big label="Para ganar holgado" value={money(r.cpaRoas2)} hint="cada 1 en anuncios vuelve como 2" />
      </section>
      {funnelGain > 0.5 && (
        <p className="text-[12.5px] text-foreground/90 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
          Solo con el producto principal podrías pagar hasta <b className="tabular-nums">{money(Math.max(0, r.netFrontOnly))}</b> por venta.
          El embudo suma <b className="tabular-nums">{money(funnelGain)}</b> por cliente: más margen para anuncios.
        </p>
      )}

      {/* 3) Calculadora */}
      <section className="rounded-2xl border border-border p-3 sm:p-4 space-y-3">
        <h5 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
          <Calculator className="w-3.5 h-3.5" /> Ajusta los números
        </h5>
        <div className="grid grid-cols-2 gap-2">
          <Num label="Precio principal" value={inp.price} onChange={set("price")} prefix={cur} real={co?.price != null} />
          <Num label="Reembolsos" value={inp.refundPct} onChange={set("refundPct")} suffix="%" />
          <Num label={co?.bumps.length ? `Bump (prom. de ${co.bumps.length})` : "Order bump"} value={inp.bumpPrice} onChange={set("bumpPrice")} prefix={cur} real={!!co?.bumps.length} />
          <Num label="% que lo agrega" value={inp.bumpTakePct} onChange={set("bumpTakePct")} suffix="%" />
          <Num label="Upsell" value={inp.upsellPrice} onChange={set("upsellPrice")} prefix={cur} proposed={!!co?.has_upsell} />
          <Num label="% que lo compra" value={inp.upsellTakePct} onChange={set("upsellTakePct")} suffix="%" />
          <Num label="Downsell" value={inp.downsellPrice} onChange={set("downsellPrice")} prefix={cur} proposed={!!co?.has_upsell} />
          <Num label="% de los que dijeron no" value={inp.downsellTakePct} onChange={set("downsellTakePct")} suffix="%" />
          <Num label="Suscripción mensual" value={inp.subPrice} onChange={set("subPrice")} prefix={cur} />
          <Num label="% que se suscribe" value={inp.subTakePct} onChange={set("subTakePct")} suffix="%" />
          <Num label="Meses que se queda" value={inp.subMonths} onChange={set("subMonths")} />
          <label className="block">
            <span className="block text-[11px] text-muted-foreground mb-1">Plataforma de cobro</span>
            <select
              value={PLATFORM_FEES.find((p) => p.feePct === inp.feePct && p.feeFixed === inp.feeFixed)?.label ?? ""}
              onChange={(e) => { const p = PLATFORM_FEES.find((x) => x.label === e.target.value); if (p) setInp((s) => ({ ...s, feePct: p.feePct, feeFixed: p.feeFixed })); }}
              className="w-full h-10 rounded-lg border border-border bg-card px-2.5 text-[13px] text-foreground">
              {PLATFORM_FEES.map((p) => <option key={p.label} value={p.label}>{p.label}</option>)}
            </select>
          </label>
        </div>
        <div className="text-[11.5px] text-muted-foreground flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Los precios marcados <b className="text-foreground/80">real</b> salen de su checkout; los marcados <b className="text-foreground/80">propuesto</b> no se ven sin comprar y son una sugerencia.
            Las tasas (%) son típicas en infoproductos, no datos de esta oferta: ajústalas. Es una estimación, no una promesa de ventas.
          </span>
        </div>
        <button onClick={() => setInp(defaults)} className="text-[12px] text-muted-foreground hover:text-foreground underline underline-offset-2">Volver a los valores iniciales</button>
      </section>

      {/* Desglose */}
      <section className="rounded-2xl border border-border bg-secondary/20 p-3 sm:p-4 space-y-1.5 text-[12.5px]">
        <h5 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-1">De dónde sale cada cliente</h5>
        <Line label="Producto principal" v={r.parts.main} money={money} />
        <Line label="Order bump" v={r.parts.bump} money={money} />
        <Line label="Upsell" v={r.parts.upsell} money={money} />
        <Line label="Downsell" v={r.parts.downsell} money={money} />
        <Line label="Suscripción" v={r.parts.subscription} money={money} />
        <Line label="Comisión de la plataforma" v={-r.fees} money={money} />
        <Line label="Reembolsos" v={-r.refunds} money={money} />
        <div className="border-t border-border pt-1.5 mt-1.5"><Line label="Te queda por cliente" v={r.net} money={money} strong /></div>
      </section>
    </div>
  );
}

// Checkouts y tiendas que offer-intel sabe leer (supabase/functions/offer-intel).
const READABLE_CHECKOUTS = ["Hotmart", "Kiwify", "ThriveCart", "SamCart", "App Store", "Google Play"];
const INTERVAL_LABEL: Record<string, string> = {
  monthly: "mensual", month: "mensual", annually: "anual", yearly: "anual", year: "anual",
  weekly: "semanal", week: "semanal", quarterly: "trimestral", biannually: "semestral",
};

type StepType = "principal" | "bump" | "upsell" | "downsell" | "suscripcion";
interface Ladder {
  resumen: string;
  moneda: string;
  pasos: { tipo: StepType; nombre: string; que_incluye: string; precio: number; origen: "real" | "propuesto"; tasa_tipica_pct: number; por_que: string }[];
  advertencias: string[];
}
const STEP_LABEL: Record<StepType, string> = {
  principal: "Producto principal", bump: "Order bump", upsell: "Upsell", downsell: "Downsell", suscripcion: "Suscripción mensual",
};

function Row({ label, value, strong, icon }: { label: string; value: string; strong?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[12.5px]">
      <span className="text-muted-foreground flex items-center gap-1.5 shrink-0">{icon}{label}</span>
      <span className={`text-right ${strong ? "text-foreground font-semibold tabular-nums text-[14px]" : "text-foreground/90"}`}>{value}</span>
    </div>
  );
}

function Big({ label, value, hint, accent }: { label: string; value: string; hint: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-3 ${accent ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`font-display font-semibold text-[20px] tabular-nums mt-0.5 ${accent ? "text-primary" : "text-foreground"}`}>{value}</div>
      <div className="text-[10.5px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function Num({ label, value, onChange, prefix, suffix, real, proposed }: {
  label: string; value: number; onChange: (v: number) => void; prefix?: string; suffix?: string; real?: boolean; proposed?: boolean;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  return (
    <label className="block min-w-0">
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1 min-w-0">
        <span className="truncate">{label}</span>
        {real && <span className="shrink-0 rounded px-1 text-[9.5px] font-bold uppercase bg-primary/15 text-primary">real</span>}
        {proposed && !real && <span className="shrink-0 rounded px-1 text-[9.5px] font-bold uppercase bg-secondary text-muted-foreground">propuesto</span>}
      </span>
      <span className="flex items-center h-10 rounded-lg border border-border bg-card px-2.5 gap-1.5 focus-within:border-primary/50">
        {prefix && <span className="text-[11px] text-muted-foreground shrink-0">{prefix}</span>}
        <input
          inputMode="decimal" value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = parseFloat(e.target.value.replace(",", "."));
            onChange(Number.isFinite(n) && n >= 0 ? n : 0);
          }}
          className="w-full min-w-0 bg-transparent text-[13.5px] text-foreground tabular-nums outline-none" />
        {suffix && <span className="text-[11px] text-muted-foreground shrink-0">{suffix}</span>}
      </span>
    </label>
  );
}

function Line({ label, v, money, strong }: { label: string; v: number; money: (n: number) => string; strong?: boolean }) {
  if (!strong && Math.abs(v) < 0.005) return null;
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={strong ? "text-foreground font-semibold" : "text-muted-foreground"}>{label}</span>
      <span className={`tabular-nums ${strong ? "text-foreground font-semibold" : v < 0 ? "text-muted-foreground" : "text-foreground/90"}`}>
        {v < 0 ? `− ${money(-v)}` : money(v)}
      </span>
    </div>
  );
}
