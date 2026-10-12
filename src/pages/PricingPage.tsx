import { useEffect, useMemo, useRef, useState } from "react";
import { Calculator, Check, Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useBusinessProfile, type PriceScenario, type Pricing } from "@/lib/businessProfile";
import {
  calcScenario as calc, CURRENCIES, currentScenario, fmtMoney, fmtNum, fromUsd, parseAmount, PLATFORM_FEES,
} from "@/lib/pricing";
import { useLocalCurrency } from "@/lib/pricingCurrency";
import { measureRules } from "@/lib/pricingRules";

/**
 * Etapa 3 del recorrido "Mi negocio": ¿a cuánto lo vendo y cuánto me queda?
 * Inspirada en la "Precificação Tangível" de Ladeira, pero pensada para quien vende con anuncios:
 * el dato clave es cuánto puede pagar como máximo en anuncios por cada venta sin perder dinero
 * (el mismo umbral que usa el veredicto de la Mándala). Sin IA: no gasta créditos.
 * Los escenarios se guardan en el producto activo (products.pricing) y el precio del escenario que
 * vale (el elegido o, si no eligió, el primero) se copia a products.price: así la página de ventas,
 * el order bump y los anuncios lo leen sin pasos extra (12-oct-2026).
 * La moneda por defecto es la del país de la persona (user_age_country).
 */

// Comisiones por plataforma: compartidas con el Mapa del negocio (src/lib/pricing.ts).
const PLATFORMS = PLATFORM_FEES;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Escenario de arranque: ejemplos en dólares pasados a la moneda de la persona (aprox.). */
const newScenario = (cur: string, base?: Partial<PriceScenario>): PriceScenario => ({
  id: Math.random().toString(36).slice(2, 9),
  price: fromUsd(27, cur), salesPerDay: 3, adCostPerSale: fromUsd(12, cur), feePct: 5.2, feeFixed: round2(fromUsd(0.4, cur)),
  refundPct: 5, taxPct: 0, unitCost: 0, fixedMonthly: fromUsd(50, cur),
  ...base,
});

const PCT_FIELDS = new Set<keyof PriceScenario>(["feePct", "refundPct", "taxPct"]);
/** Lo que escribe la persona → número válido (nada negativo; los % hasta 100). */
const num = (k: keyof PriceScenario, v: string) => {
  const n = parseAmount(v);
  if (n === null || n < 0) return 0;
  return PCT_FIELDS.has(k) ? Math.min(100, n) : n;
};
/** Cómo se muestra un número dentro de un campo: 1.500 · 27,5. */
const inputText = (n: number) => fmtNum(n, 2);

export function PricingPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { profile, savePatch, loaded } = useBusinessProfile();
  const local = useLocalCurrency();
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [active, setActive] = useState<string>("");
  // Se sube al elegir una plataforma: vuelve a montar los campos para que muestren la comisión nueva.
  const [rev, setRev] = useState(0);
  const saveTimer = useRef<number | null>(null);

  // Arranca con lo guardado o con un escenario armado desde "Mi negocio" (en la moneda de su país).
  useEffect(() => {
    if (!loaded || pricing) return;
    const saved = profile.pricing;
    if (saved?.scenarios?.length) {
      let next: Pricing = { ...saved, currency: saved.currency || local.currency };
      // La ficha tiene un precio distinto (lo cambió en Mi negocio): la calculadora lo toma, para
      // que el máximo por venta y el veredicto de los anuncios usen el precio de verdad.
      const fromFicha = /^[\d.,\s]+$/.test(profile.price.trim()) ? parseAmount(profile.price) : null;
      const cur = currentScenario(next);
      if (cur && fromFicha !== null && fromFicha > 0 && fromFicha !== cur.scenario.price) {
        next = { ...next, scenarios: next.scenarios.map(s => (s.id === cur.scenario.id ? { ...s, price: fromFicha } : s)) };
        void savePatch({ pricing: next });
      }
      setPricing(next);
      setActive(next.chosen ?? next.scenarios[0].id);
      return;
    }
    if (!local.ready) return; // un instante: esperamos el país para no arrancar en dólares
    const cur = saved?.currency || local.currency;
    const fromProfile = parseAmount(profile.price);
    const p = fromProfile !== null && fromProfile > 0 ? fromProfile : fromUsd(27, cur);
    const first = newScenario(cur, {
      price: p, adCostPerSale: round2(p * 0.45),
      unitCost: profile.business_type === "ecommerce" ? round2(p * 0.3) : 0,
    });
    // Nada queda "elegido" hasta que el usuario toca "Usar este precio" (es lo que marca la etapa 3).
    setPricing({ currency: cur, scenarios: [first], chosen: null });
    setActive(first.id);
  }, [loaded, profile, pricing, local.ready, local.currency]);

  /**
   * El precio que va al producto (products.price): el del escenario elegido o, si no eligió, el del
   * primero. Solo se escribe si cambió, así no se pisa un precio escrito a mano con el mismo número
   * ("US$9/mes · reto de entrada US$5").
   */
  const pricePatch = (next: Pricing): { price?: string } => {
    const cur = currentScenario(next);
    if (!cur || !(cur.scenario.price > 0)) return {};
    return parseAmount(profile.price) === cur.scenario.price ? {} : { price: String(round2(cur.scenario.price)) };
  };

  // Guardado automático (1 s después del último cambio).
  const persist = (next: Pricing) => {
    setPricing(next);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      savePatch({ pricing: next, ...pricePatch(next) }).then(ok => { if (!ok) toast.error("No se pudo guardar la calculadora"); });
    }, 1000);
  };

  const scenario = pricing?.scenarios.find(s => s.id === active) ?? pricing?.scenarios[0];
  const r = useMemo(() => (scenario ? calc(scenario) : null), [scenario]);
  if (!pricing || !scenario || !r) return <div className="text-sm text-muted-foreground p-6">Cargando…</div>;

  const cur = pricing.currency;
  const money = (n: number) => fmtMoney(n, cur);
  const setField = (k: keyof PriceScenario, v: number) =>
    persist({ ...pricing, scenarios: pricing.scenarios.map(s => (s.id === scenario.id ? { ...s, [k]: v } : s)) });
  const addScenario = () => {
    if (pricing.scenarios.length >= 3) return;
    const s = { ...scenario, id: Math.random().toString(36).slice(2, 9), price: Math.round(scenario.price * 1.3) };
    persist({ ...pricing, scenarios: [...pricing.scenarios, s] });
    setActive(s.id);
  };
  const removeScenario = (id: string) => {
    const rest = pricing.scenarios.filter(s => s.id !== id);
    if (!rest.length) return;
    persist({ ...pricing, scenarios: rest, chosen: pricing.chosen === id ? rest[0].id : pricing.chosen });
    setActive(rest[0].id);
  };
  const useThisPrice = () => {
    // Un guardado automático pendiente traería el "elegido" anterior y pisaría este.
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    if (!(scenario.price > 0)) { toast.error("Pon el precio de tu producto primero"); return; }
    const next = { ...pricing, chosen: scenario.id };
    setPricing(next);
    savePatch({ pricing: next, price: String(round2(scenario.price)) }).then(ok => ok ? toast.success(`Listo: tu precio es ${fmtMoney(scenario.price, cur, { short: true })}`, { description: "Siguiente paso: construye tu producto.", action: onNavigate ? { label: "Ir →", onClick: () => onNavigate("Plan") } : undefined }) : toast.error("No se pudo guardar"));
  };

  // Funciones de render (no componentes): así el input no se vuelve a montar y no pierde el foco al teclear.
  const field = (k: keyof PriceScenario, label: string, help?: string, suffix?: string) => (
    <label key={k} className="flex flex-col gap-1 text-xs text-muted-foreground">
      <span className="text-foreground font-medium">{label}</span>
      <div className="flex items-center gap-1.5">
        {!suffix && <span className="text-muted-foreground">{cur}</span>}
        <input key={`${scenario.id}-${k}-${rev}`} defaultValue={inputText(Number(scenario[k]) || 0)} inputMode="decimal"
          aria-label={label}
          onChange={e => setField(k, num(k, e.target.value))}
          // Al salir del campo se ve cómo lo entendió la app: "1500" → "1.500", "-5" → "0".
          onBlur={e => { e.target.value = inputText(num(k, e.target.value)); }}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60" />
        {suffix && <span className="text-muted-foreground">{suffix}</span>}
      </div>
      {help && <span className="leading-snug">{help}</span>}
    </label>
  );

  const loses = r.perSale <= 0;
  const noPrice = !(scenario.price > 0);
  const noMargin = !noPrice && r.beforeAds <= 0;
  // Con varios escenarios y ninguno elegido, el producto usa el primero: se dice claro.
  const productUses = currentScenario(pricing);
  const productIdx = productUses ? pricing.scenarios.findIndex(s => s.id === productUses.scenario.id) : -1;
  const row = (label: string, value: string, strong?: boolean, tone?: "good" | "bad") => (
    <div key={label} className={`flex justify-between gap-3 py-1.5 ${strong ? "border-t border-border mt-1 pt-2.5 font-semibold" : ""}`}>
      <span className={strong ? "text-foreground" : "text-muted-foreground"}>{label}</span>
      <span className={`tabular-nums ${tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-red-400" : "text-foreground"}`}>{value}</span>
    </div>
  );

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-primary font-semibold">Mi negocio · Etapa 3</p>
          <h1 className="font-display font-bold text-2xl text-foreground flex items-center gap-2"><Calculator className="w-5 h-5 text-primary" /> Precio y ganancia</h1>
          <p className="text-sm text-muted-foreground max-w-2xl mt-1">
            Cuánto te queda por venta y cuánto puedes pagar en anuncios sin perder. Gratis.
          </p>
        </div>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          Tu moneda
          <select value={cur} onChange={e => persist({ ...pricing, currency: e.target.value })} aria-label="Moneda"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
            {(CURRENCIES.includes(cur) ? CURRENCIES : [cur, ...CURRENCIES]).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>

      {/* Escenarios */}
      <div className="flex flex-wrap items-center gap-2">
        {pricing.scenarios.map((s, i) => (
          <div key={s.id} className={`inline-flex items-center rounded-lg border ${s.id === scenario.id ? "border-primary bg-primary/10" : "border-border"}`}>
            <button onClick={() => setActive(s.id)} className={`px-3 py-2 text-xs font-semibold ${s.id === scenario.id ? "text-primary" : "text-muted-foreground"}`}>
              {pricing.chosen === s.id && <Check className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />}Escenario {String.fromCharCode(65 + i)} · {money(s.price)}
            </button>
            {pricing.scenarios.length > 1 && (
              <button onClick={() => removeScenario(s.id)} className="pr-2 text-muted-foreground hover:text-red-400" aria-label="Borrar escenario"><Trash2 className="w-3.5 h-3.5" /></button>
            )}
          </div>
        ))}
        {pricing.scenarios.length < 3 && (
          <button onClick={addScenario} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
            <Plus className="w-3.5 h-3.5" /> Probar otro precio
          </button>
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-5 items-start">
        {/* Datos */}
        <div className="card-surface rounded-2xl p-5 space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            {field("price", "Precio de tu producto")}
            {field("salesPerDay", "Ventas que esperas por día", "Si empiezas, pon algo modesto: 1 a 5.", "al día")}
            {field("adCostPerSale", "Lo que pagas en anuncios por cada venta", "Si aún no lo sabes, empieza con la mitad del precio. La Mándala te lo dirá con tus números reales.")}
            {field("unitCost", "Lo que te cuesta cada venta", profile.business_type === "ecommerce" ? "Producto + envío + empaque." : "En un producto digital suele ser 0.")}
          </div>

          <div className="space-y-2">
            <p className="text-xs text-foreground font-medium">¿Dónde cobras?</p>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map(p => {
                const on = scenario.feePct === p.feePct && scenario.feeFixed === round2(fromUsd(p.feeFixed, cur));
                return (
                  <button key={p.label} title={p.hint}
                    onClick={() => { persist({ ...pricing, scenarios: pricing.scenarios.map(s => (s.id === scenario.id ? { ...s, feePct: p.feePct, feeFixed: round2(fromUsd(p.feeFixed, cur)) } : s)) }); setRev(v => v + 1); }}
                    className={`rounded-full border px-3 py-1.5 text-xs ${on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {field("feePct", "Comisión de la plataforma", "Valores aproximados: revisa los de tu plataforma y ajústalos.", "%")}
              {field("feeFixed", "Cargo fijo por venta", cur === "US$" ? undefined : `En ${cur}. Las plataformas lo cobran en dólares: es un aproximado.`)}
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            {field("refundPct", "Reembolsos", "Entre 3 % y 10 % es normal.", "%")}
            {field("taxPct", "Impuestos", "Depende de tu país. Si no sabes, pon 0 y pregúntale a un contador.", "%")}
            {field("fixedMonthly", "Costos fijos al mes", "Herramientas, SUPERNOVA, dominio…")}
          </div>
        </div>

        {/* Resultado */}
        <div className="space-y-4 lg:sticky lg:top-4">
          <div className={`rounded-2xl border p-5 ${loses ? "border-red-500/40 bg-red-500/5" : "border-emerald-500/30 bg-emerald-500/5"}`}>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Te queda de cada venta</p>
            <p className={`font-display font-bold text-3xl tabular-nums ${loses ? "text-red-400" : "text-emerald-400"}`}>{money(r.perSale)}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {noPrice
                ? "Pon el precio de tu producto para ver la cuenta."
                : noMargin
                  ? "Aun sin pagar anuncios pierdes en cada venta: comisiones, reembolsos, impuestos y costos se comen el precio. Sube el precio o baja costos."
                  : loses
                    ? `Así pierdes dinero en cada venta. Sube el precio o paga menos de ${money(r.beforeAds)} en anuncios por venta.`
                    : `Es el ${fmtNum(r.margin * 100, 0)} % del precio. Puedes pagar hasta ${money(r.beforeAds)} en anuncios por venta sin perder.`}
            </p>
            {pricing.scenarios.length > 1 && productIdx >= 0 && (
              <p className="text-[11px] text-muted-foreground mt-2">
                {productUses?.chosen
                  ? `Tu producto usa el escenario ${String.fromCharCode(65 + productIdx)}.`
                  : `Mientras no elijas, tu producto usa el escenario ${String.fromCharCode(65 + productIdx)}.`}
              </p>
            )}
          </div>

          <div className="card-surface rounded-2xl p-5 text-sm">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Cada venta, paso a paso</p>
            {row("Precio", money(scenario.price))}
            {row("− Comisión de la plataforma", money(-r.fee))}
            {row("− Reembolsos (promedio)", money(-r.refunds))}
            {row("− Impuestos", money(-r.taxes))}
            {row("− Lo que cuesta la venta", money(-scenario.unitCost))}
            {row("= Máximo para anuncios", money(r.beforeAds), true)}
            {row("− Anuncios", money(-scenario.adCostPerSale))}
            {row("= Te queda", money(r.perSale), true, loses ? "bad" : "good")}
          </div>

          <div className="card-surface rounded-2xl p-5 text-sm">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Al mes, con {fmtNum(scenario.salesPerDay, 1)} {scenario.salesPerDay === 1 ? "venta" : "ventas"} al día</p>
            {row(`Ventas (${fmtNum(r.salesMonth, 0)})`, money(r.revenueMonth))}
            {row("Gasto en anuncios", money(-r.adsMonth))}
            {row("Costos fijos", money(-scenario.fixedMonthly))}
            {row("Ganancia del mes", money(r.profitMonth), true, r.profitMonth > 0 ? "good" : "bad")}
            {row("Ganancia del año", money(r.profitYear))}
            <p className="text-xs text-muted-foreground mt-3 leading-snug">
              {!Number.isFinite(r.breakEvenPerDay)
                ? "Con estos números no se cubren los costos fijos: cada venta pierde dinero."
                : scenario.fixedMonthly <= 0
                  ? "No anotaste costos fijos: cada venta ya te deja ganancia."
                  : `Para cubrir tus costos fijos necesitas ${r.breakEvenPerDay < 1 ? "menos de 1 venta" : `${fmtNum(Math.ceil(r.breakEvenPerDay), 0)} ventas`} al día.`}
              {Number.isFinite(r.minRoas) && ` Tus anuncios tienen que devolver al menos ${fmtNum(r.minRoas, 1)} veces lo que gastas (eso se llama ROAS: retorno de lo que inviertes en anuncios).`}
            </p>
            <p className="text-[11px] text-muted-foreground/80 mt-2">Es una cuenta con tus supuestos, no una promesa de ventas.</p>
          </div>

          {!noPrice && !noMargin && (
            <div className="card-surface rounded-2xl p-5 text-sm">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Cuando publiques anuncios</p>
              <ul className="space-y-1.5 text-muted-foreground leading-snug">
                {measureRules(`tu máximo por venta (${money(r.beforeAds)})`).map(t => <li key={t}>· {t}</li>)}
              </ul>
              <p className="text-[11px] text-muted-foreground/80 mt-2">Son las mismas reglas que usa Resultados para decirte qué apagar o escalar.</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button onClick={useThisPrice}
              className="btn-primary-nova inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold">
              <Check className="w-4 h-4" /> Usar este precio en Mi negocio
            </button>
            <button onClick={() => { void navigator.clipboard?.writeText(`Precio ${money(scenario.price)} · Te queda ${money(r.perSale)} por venta · Máximo en anuncios ${money(r.beforeAds)} por venta · Ganancia mes ${money(r.profitMonth)}`); toast.success("Copiado"); }}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground">
              <Copy className="w-4 h-4" /> Copiar
            </button>
            {onNavigate && pricing.chosen && (
              <button onClick={() => onNavigate("Plan")} className="inline-flex items-center gap-2 rounded-lg border border-primary/50 px-4 py-2.5 text-sm text-primary hover:bg-primary/10">
                Siguiente paso: construye y lanza →
              </button>
            )}
            {onNavigate && (
              <button onClick={() => onNavigate("Dashboard")} className="text-sm text-muted-foreground hover:text-foreground px-2">Volver al inicio</button>
            )}
          </div>
        </div>
      </div>

      {pricing.scenarios.length > 1 && (
        <div className="card-surface rounded-2xl p-5 overflow-x-auto">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Comparar precios</p>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr><th className="text-left py-1 font-medium">Escenario</th><th className="text-right font-medium">Precio</th><th className="text-right font-medium">Ventas/día</th><th className="text-right font-medium">Te queda por venta</th><th className="text-right font-medium">Máx. en anuncios</th><th className="text-right font-medium">Ganancia/mes</th></tr>
            </thead>
            <tbody>
              {pricing.scenarios.map((s, i) => {
                const c = calc(s);
                return (
                  <tr key={s.id} className="border-t border-border">
                    <td className="py-2">{String.fromCharCode(65 + i)}{pricing.chosen === s.id ? " ✓" : ""}</td>
                    <td className="text-right tabular-nums">{money(s.price)}</td>
                    <td className="text-right tabular-nums">{fmtNum(s.salesPerDay, 1)}</td>
                    <td className={`text-right tabular-nums ${c.perSale > 0 ? "text-emerald-400" : "text-red-400"}`}>{money(c.perSale)}</td>
                    <td className="text-right tabular-nums">{money(c.beforeAds)}</td>
                    <td className={`text-right tabular-nums ${c.profitMonth > 0 ? "text-emerald-400" : "text-red-400"}`}>{money(c.profitMonth)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
