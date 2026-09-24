import { useEffect, useMemo, useRef, useState } from "react";
import { Calculator, Check, Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useBusinessProfile, type PriceScenario, type Pricing } from "@/lib/businessProfile";
import { calcScenario as calc, PLATFORM_FEES } from "@/lib/pricing";

/**
 * Etapa 3 del recorrido "Mi negocio": ¿a cuánto lo vendo y cuánto me queda?
 * Inspirada en la "Precificação Tangível" de Ladeira, pero pensada para quien vende con anuncios:
 * el dato clave es cuánto puede pagar como máximo en anuncios por cada venta sin perder dinero
 * (el mismo umbral que usa el veredicto de la Mándala). Sin IA: no gasta créditos.
 * Los escenarios se guardan en business_profile.pricing.
 */

const CURRENCIES = ["US$", "RD$", "MX$", "COL$", "S/", "ARS$", "CLP$", "€", "R$"];

// Comisiones por plataforma: compartidas con el Mapa del negocio (src/lib/pricing.ts).
const PLATFORMS = PLATFORM_FEES;

const newScenario = (base?: Partial<PriceScenario>): PriceScenario => ({
  id: Math.random().toString(36).slice(2, 9),
  price: 27, salesPerDay: 3, adCostPerSale: 12, feePct: 5.2, feeFixed: 0.4,
  refundPct: 5, taxPct: 0, unitCost: 0, fixedMonthly: 50,
  ...base,
});


const num = (v: string) => { const n = parseFloat(v.replace(",", ".")); return Number.isFinite(n) && n >= 0 ? n : 0; };

export function PricingPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { profile, savePatch, loaded } = useBusinessProfile();
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [active, setActive] = useState<string>("");
  // Se sube al elegir una plataforma: vuelve a montar los campos para que muestren la comisión nueva.
  const [rev, setRev] = useState(0);
  const saveTimer = useRef<number | null>(null);

  // Arranca con lo guardado o con un escenario armado desde "Mi negocio".
  useEffect(() => {
    if (!loaded || pricing) return;
    const saved = profile.pricing;
    if (saved?.scenarios?.length) { setPricing(saved); setActive(saved.chosen ?? saved.scenarios[0].id); return; }
    const p = num(profile.price) || 27;
    const first = newScenario({
      price: p, adCostPerSale: Math.round(p * 0.45 * 100) / 100,
      unitCost: profile.business_type === "ecommerce" ? Math.round(p * 0.3 * 100) / 100 : 0,
    });
    // Nada queda "elegido" hasta que el usuario toca "Usar este precio" (es lo que marca la etapa 3).
    setPricing({ currency: "US$", scenarios: [first], chosen: null });
    setActive(first.id);
  }, [loaded, profile, pricing]);

  // Guardado automático (1 s después del último cambio).
  const persist = (next: Pricing) => {
    setPricing(next);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      savePatch({ pricing: next }).then(ok => { if (!ok) toast.error("No se pudo guardar la calculadora"); });
    }, 1000);
  };

  const scenario = pricing?.scenarios.find(s => s.id === active) ?? pricing?.scenarios[0];
  const r = useMemo(() => (scenario ? calc(scenario) : null), [scenario]);
  if (!pricing || !scenario || !r) return <div className="text-sm text-muted-foreground p-6">Cargando…</div>;

  const cur = pricing.currency;
  const money = (n: number) => Number.isFinite(n)
    ? `${n < 0 ? "−" : ""}${cur}${Math.abs(n).toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "—";
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
    const next = { ...pricing, chosen: scenario.id };
    setPricing(next);
    savePatch({ pricing: next, price: String(scenario.price) }).then(ok => ok ? toast.success(`Listo: tu precio es ${money(scenario.price)}`, { description: "Siguiente paso: construye tu producto.", action: onNavigate ? { label: "Ir →", onClick: () => onNavigate("Plan") } : undefined }) : toast.error("No se pudo guardar"));
  };

  // Funciones de render (no componentes): así el input no se vuelve a montar y no pierde el foco al teclear.
  const field = (k: keyof PriceScenario, label: string, help?: string, suffix?: string) => (
    <label key={k} className="flex flex-col gap-1 text-xs text-muted-foreground">
      <span className="text-foreground font-medium">{label}</span>
      <div className="flex items-center gap-1.5">
        {!suffix && <span className="text-muted-foreground">{cur}</span>}
        <input key={`${scenario.id}-${k}-${rev}`} defaultValue={String(scenario[k])} inputMode="decimal"
          onChange={e => setField(k, num(e.target.value))}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60" />
        {suffix && <span className="text-muted-foreground">{suffix}</span>}
      </div>
      {help && <span className="leading-snug">{help}</span>}
    </label>
  );

  const loses = r.perSale <= 0;
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
        <select value={cur} onChange={e => persist({ ...pricing, currency: e.target.value })} aria-label="Moneda"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
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
                const on = scenario.feePct === p.feePct && scenario.feeFixed === p.feeFixed;
                return (
                  <button key={p.label} title={p.hint}
                    onClick={() => { persist({ ...pricing, scenarios: pricing.scenarios.map(s => (s.id === scenario.id ? { ...s, feePct: p.feePct, feeFixed: p.feeFixed } : s)) }); setRev(v => v + 1); }}
                    className={`rounded-full border px-3 py-1.5 text-xs ${on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {field("feePct", "Comisión de la plataforma", "Valores aproximados: revisa los de tu plataforma y ajústalos.", "%")}
              {field("feeFixed", "Cargo fijo por venta")}
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            {field("refundPct", "Reembolsos", "Entre 3% y 10% es normal.", "%")}
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
              {loses
                ? `Así pierdes dinero en cada venta. Sube el precio o paga menos de ${money(r.beforeAds)} en anuncios por venta.`
                : `Es el ${Math.round(r.margin * 100)}% del precio. Puedes pagar hasta ${money(r.beforeAds)} en anuncios por venta sin perder.`}
            </p>
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
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Al mes, con {scenario.salesPerDay} ventas al día</p>
            {row(`Ventas (${r.salesMonth.toLocaleString("es")})`, money(r.revenueMonth))}
            {row("Gasto en anuncios", money(-r.adsMonth))}
            {row("Costos fijos", money(-scenario.fixedMonthly))}
            {row("Ganancia del mes", money(r.profitMonth), true, r.profitMonth > 0 ? "good" : "bad")}
            {row("Ganancia del año", money(r.profitYear))}
            <p className="text-xs text-muted-foreground mt-3 leading-snug">
              {Number.isFinite(r.breakEvenPerDay)
                ? `Para cubrir tus costos fijos necesitas ${r.breakEvenPerDay < 1 ? "menos de 1 venta" : `${Math.ceil(r.breakEvenPerDay)} ventas`} al día.`
                : "Con este precio no se cubren los costos fijos: cada venta pierde dinero."}
              {Number.isFinite(r.minRoas) && ` Tus anuncios tienen que devolver al menos ${r.minRoas.toFixed(1)} veces lo que gastas (ROAS mínimo).`}
            </p>
            <p className="text-[11px] text-muted-foreground/80 mt-2">Es una simulación con tus supuestos, no una promesa de ventas.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={useThisPrice}
              className="inline-flex items-center gap-2 rounded-lg gradient-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground">
              <Check className="w-4 h-4" /> Usar este precio en Mi negocio
            </button>
            <button onClick={() => { navigator.clipboard.writeText(`Precio ${money(scenario.price)} · Te queda ${money(r.perSale)} por venta · Máximo en anuncios ${money(r.beforeAds)} por venta · Ganancia mes ${money(r.profitMonth)}`); toast.success("Copiado"); }}
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
                    <td className="text-right tabular-nums">{s.salesPerDay}</td>
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
