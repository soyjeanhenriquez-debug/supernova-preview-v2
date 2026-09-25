import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { track } from "@/lib/analytics";
import { supabase } from "@/integrations/supabase/client";
import type { BusinessProfile, BusinessType } from "@/lib/businessProfile";
import { copyLabel, NICHE_LABEL, OFFER_TYPE_LABEL, type Offer } from "@/lib/offers";
import { FUNNEL_LABEL, loadOfferIntel, type OfferIntel } from "@/lib/offerIntel";
import {
  COUNTRIES, LANG_LABEL, QUICK_NICHES, cpaMaxUsd, originalPrice, toLocal,
  type CountryCode, type Gemelo,
} from "@/lib/gemelo";

/**
 * Negocio Gemelo en 3 toques (etapa 1 de "Mi negocio"): Elige una oferta que lleva muchos días
 * pagando anuncios → Clónala (misma oferta, adaptada a tu país) → Cobra (próxima fase).
 * Elegir y clonar son GRATIS: solo leen el catálogo y llenan la ficha del producto activo.
 */
type Props = {
  profile: BusinessProfile;
  savePatch: (patch: Partial<BusinessProfile>) => Promise<boolean>;
  onNavigate: (page: string) => void;
  /** Mantiene el flujo abierto mientras se muestra "listo" (la etapa 1 ya quedó hecha). */
  onKeep: (keep: boolean) => void;
};
type Step = "pick" | "clone" | "done";

const PAGE = 6;
// Solo lo que se pinta: pedir sample_body y enlaces largos subía la consulta de ~1 ms a ~230 ms (25-sep).
const COLS = "id,page_name,sample_title,product_name,niche,offer_type,language,price_hint,mechanism,why_wins,target_audience,copy_score,days_active,winner_score";
const TYPE_TO_BUSINESS: Record<string, BusinessType> = { infoproducto: "infoproducto", ecommerce: "ecommerce", servicio: "servicios" };
const nameOf = (o: Offer) => o.product_name || o.sample_title || o.page_name || "Oferta sin nombre";

export function GemeloFlow({ profile, savePatch, onNavigate, onKeep }: Props) {
  const saved = profile.journey?.gemelo ?? null;
  const [step, setStep] = useState<Step>("pick");
  const [niche, setNiche] = useState("all");
  const [limit, setLimit] = useState(PAGE);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Offer | null>(null);
  const [intel, setIntel] = useState<OfferIntel | null>(null);
  const [reading, setReading] = useState(false);
  const [country, setCountry] = useState<CountryCode>(saved?.country ?? "RD");
  const [imp, setImp] = useState(saved?.improvements ?? { lang: true, pay: true, wa: true });
  const [who, setWho] = useState("");
  const [promise, setPromise] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // Las ganadoras con más días pagando anuncios: la mejor prueba de que venden.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    let q = supabase.from("offers").select(COLS).eq("is_winner", true).eq("enrich_failed", false).is("excluded_reason", null);
    if (niche !== "all") q = q.eq("niche", niche);
    q.order("days_active", { ascending: false }).order("winner_score", { ascending: false }).range(0, limit).then(({ data, error }) => {
      if (!alive) return;
      if (error) console.error("offers:", error.message);
      const rows = (data ?? []) as unknown as Offer[];
      setOffers(rows.slice(0, limit));
      setHasMore(rows.length > limit);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [niche, limit]);

  // Al clonar se lee la ficha de la oferta (precio real del checkout y embudo). Es gratis.
  useEffect(() => {
    if (step !== "clone" || !sel) return;
    const ctrl = new AbortController();
    setIntel(null);
    setReading(true);
    loadOfferIntel(sel.id, { signal: ctrl.signal }).then(({ intel }) => {
      if (ctrl.signal.aborted) return;
      setIntel(intel);
      setReading(false);
    });
    setWho(sel.target_audience ?? "");
    setPromise(sel.mechanism || sel.why_wins || "");
    return () => ctrl.abort();
  }, [step, sel]);

  const price = useMemo(() => (sel ? originalPrice(sel, intel) : null), [sel, intel]);

  const next = () => {
    if (!sel) { setErr("Toca la oferta que te guste."); return; }
    setErr("");
    track("gemelo_clonar", { offer_id: sel.id, nicho: sel.niche, dias: sel.days_active });
    setStep("clone");
  };

  const clone = async () => {
    if (!sel || saving) return;
    if (who.trim().length < 3 || promise.trim().length < 3) { setErr("Completa para quién es y qué promete."); return; }
    const product = nameOf(sel);
    const current = profile.product.trim();
    if (current && current !== product
      && !window.confirm(`Tu ficha ya tiene un producto: «${current.slice(0, 80)}». ¿Reemplazarlo por este gemelo?`)) return;
    setSaving(true);
    setErr("");
    const gemelo: Gemelo = {
      offer_id: sel.id, offer_name: product, country, improvements: imp,
      price_usd: price?.usd != null ? Math.round(price.usd * 100) / 100 : null, cloned_at: new Date().toISOString(),
    };
    onKeep(true); // la etapa 1 queda hecha: sin esto el flujo se cerraría antes de mostrar "listo"
    const ok = await savePatch({
      product, who: who.trim(), promise: promise.trim(),
      price: price?.usd != null ? String(Math.round(price.usd)) : "", proof: "",
      business_type: profile.business_type ?? TYPE_TO_BUSINESS[sel.offer_type ?? ""] ?? null,
      journey: { ...(profile.journey ?? {}), gemelo },
    });
    setSaving(false);
    if (!ok) { onKeep(false); toast.error("No se pudo guardar tu gemelo. Intenta de nuevo."); return; }
    track("gemelo_guardado", { offer_id: sel.id, pais: country, con_precio: price?.usd != null, idioma: imp.lang, pagos_locales: imp.pay, whatsapp: imp.wa });
    setStep("done");
  };

  const finish = (page?: string) => { onKeep(false); if (page) onNavigate(page); };

  const stepIdx = step === "pick" ? 0 : 1;
  return (
    <div className="rounded-2xl border border-border bg-background/40 p-4 sm:p-6 space-y-6">
      {/* Cabecera: volver + los 3 toques */}
      <div className="flex items-center justify-between gap-3">
        <div className="w-9">
          {step === "clone" && (
            <button onClick={() => { setStep("pick"); setErr(""); }} aria-label="Volver a elegir"
              className="w-9 h-9 rounded-full border border-border bg-card grid place-items-center text-foreground hover:border-foreground/30 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
        </div>
        <ol className="flex items-center gap-1.5" aria-label="Pasos">
          {["Elige", "Clona", "Cobra"].map((l, i) => {
            const on = step !== "done" && i === stepIdx;
            const done = step === "done" ? i < 2 : i < stepIdx;
            return (
              <li key={l} className={`flex items-center gap-2 h-8 pl-1 pr-3 rounded-full text-[13px] font-semibold border transition-colors ${on ? "bg-card border-foreground/15 text-foreground" : "border-transparent " + (done ? "text-foreground/80" : "text-muted-foreground/60")}`}>
                <span className={`w-6 h-6 rounded-full grid place-items-center text-[11px] ${on ? "bg-primary text-primary-foreground" : done ? "bg-success text-black" : "bg-secondary text-muted-foreground"}`}>
                  {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </span>
                {l}{i === 2 && <span className="hidden sm:inline text-[10px] font-medium text-muted-foreground/70">· pronto</span>}
              </li>
            );
          })}
        </ol>
        <div className="w-9" />
      </div>

      {step === "pick" && (
        <div key="pick" className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">¿Qué quieres vender?</h2>
              <p className="text-sm sm:text-[15px] text-muted-foreground mt-1.5 max-w-xl">Estas ofertas llevan más días pagando anuncios. Nadie paga tanto tiempo por algo que no vende.</p>
            </div>
            <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1" role="tablist" aria-label="Nicho">
              {QUICK_NICHES.map(n => (
                <button key={n.id} role="tab" aria-selected={niche === n.id} onClick={() => { setNiche(n.id); setLimit(PAGE); setSel(null); }}
                  className={`shrink-0 h-9 px-4 rounded-full text-[13px] font-semibold border transition-colors ${niche === n.id ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  {n.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {loading && offers.length === 0
              ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[124px] rounded-2xl bg-card border border-border animate-pulse" />)
              : offers.map(o => <OfferPick key={o.id} o={o} selected={sel?.id === o.id} onPick={() => { setSel(o); setErr(""); track("gemelo_oferta_elegida", { offer_id: o.id, nicho: o.niche, dias: o.days_active }); }} />)}
          </div>
          {!loading && offers.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay ofertas ganadoras en este nicho. Prueba con otro.</p>}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4 text-[13px]">
              {hasMore && <button onClick={() => setLimit(l => l + PAGE)} className="text-foreground font-semibold hover:text-primary">Ver más</button>}
              <button onClick={() => onNavigate("Ofertas")} className="text-muted-foreground hover:text-foreground">Todas las ofertas →</button>
              <button onClick={() => onNavigate("Mi negocio")} className="text-muted-foreground hover:text-foreground">Ya sé qué vender →</button>
            </div>
          </div>
        </div>
      )}

      {step === "clone" && sel && (
        <div key="clone" className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">Tu negocio gemelo</h2>
            <p className="text-sm sm:text-[15px] text-muted-foreground mt-1.5">Copiamos lo que ya funciona de «{nameOf(sel)}» y lo adaptamos a tu país.</p>
          </div>
          <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-3">
            <CloneTable o={sel} intel={intel} reading={reading} priceText={price?.text ?? null}
              localPrice={price?.usd != null ? toLocal(price.usd, country) : null} country={country} imp={imp}
              who={who} setWho={setWho} promise={promise} setPromise={setPromise} />
            <div className="space-y-3">
              <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                <p className="text-[13px] text-muted-foreground">¿Dónde vas a vender?</p>
                <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-background" role="radiogroup" aria-label="País">
                  {(Object.keys(COUNTRIES) as CountryCode[]).map(cc => (
                    <button key={cc} role="radio" aria-checked={country === cc} onClick={() => setCountry(cc)} title={COUNTRIES[cc].name}
                      className={`h-9 rounded-lg text-[13px] font-bold transition-colors ${country === cc ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{cc}</button>
                  ))}
                </div>
                {reading ? (
                  <div className="h-[92px] rounded-xl bg-secondary/40 animate-pulse" />
                ) : price?.usd != null ? (
                  <>
                    <div>
                      <p key={country} className="font-display text-4xl font-semibold tracking-tight text-foreground tabular-nums animate-in fade-in duration-300">{toLocal(price.usd, country)}</p>
                      <p className="text-[13px] text-muted-foreground mt-1">El mismo precio de la original ({price.text}), en tu moneda. Aprox.</p>
                    </div>
                    <p className="rounded-xl bg-background px-3.5 py-3 text-[13px] text-foreground/85 leading-relaxed">
                      Puedes pagar hasta <b className="text-foreground">{toLocal(Math.max(0, cpaMaxUsd(price.usd)), country)}</b> en anuncios por cada venta sin perder (CPA máximo). La cuenta exacta la haces en "Precio".
                    </p>
                  </>
                ) : (
                  <p className="text-[13px] text-muted-foreground leading-relaxed">
                    {price ? `La original cobra ${price.text}. No sabemos en qué moneda, así que no lo convertimos: ` : "Esta oferta no deja ver su precio. "}
                    lo defines en el paso "Precio", sin inventar.
                  </p>
                )}
              </div>
              <div className="rounded-2xl border border-border bg-card px-5 py-1.5">
                {([["lang", "Traducir a español LATAM"], ["pay", `Pagos de ${COUNTRIES[country].name}`], ["wa", "Entrega por WhatsApp"]] as const).map(([k, label]) => (
                  <button key={k} role="switch" aria-checked={imp[k]} onClick={() => setImp(v => ({ ...v, [k]: !v[k] }))}
                    className="w-full flex items-center justify-between gap-3 py-3 text-left text-[14px] text-foreground border-b border-border/60 last:border-0">
                    {label}
                    <span className={`w-[46px] h-7 rounded-full p-[3px] flex transition-colors duration-300 ${imp[k] ? "bg-success justify-end" : "bg-secondary justify-start"}`}>
                      <span className="w-[22px] h-[22px] rounded-full bg-white shadow-sm" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {step === "done" && sel && (
        <div key="done" className="py-6 flex flex-col items-center text-center gap-4 animate-in fade-in zoom-in-95 duration-500">
          <span className="w-16 h-16 rounded-full bg-success grid place-items-center animate-in zoom-in-50 duration-500"><Check className="w-8 h-8 text-black" strokeWidth={3} /></span>
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">Tu negocio gemelo está listo</h2>
            <p className="text-sm sm:text-[15px] text-muted-foreground mt-1.5 max-w-lg">Tu ficha ya tiene «{nameOf(sel)}», para quién es, qué promete{price?.usd != null ? ` y su precio (${toLocal(price.usd, country)} aprox.)` : ""}.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <button onClick={() => finish()} className="h-12 px-5 rounded-full border border-border bg-card text-[14px] font-semibold text-foreground hover:border-foreground/30">Ver mi negocio</button>
            <button onClick={() => finish("Validar")} className="h-12 px-6 rounded-full btn-primary-nova text-[15px] inline-flex items-center gap-2">Siguiente: comprueba que se vende <ArrowRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {step !== "done" && (
        <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-border">
          <p className={`text-[13px] ${err ? "text-destructive" : "text-muted-foreground"}`} role={err ? "alert" : undefined}>
            {err || (step === "pick"
              ? sel ? "Buena elección. Ahora la clonamos, gratis." : "Toca la oferta que te guste."
              : "Revisa lo que se copia. Cambia el país o las mejoras si quieres.")}
          </p>
          {step === "pick" ? (
            <button onClick={next} className={`h-12 px-6 rounded-full text-[15px] font-semibold inline-flex items-center justify-center gap-2 transition-all duration-300 ${sel ? "btn-primary-nova" : "bg-card border border-border text-muted-foreground"}`}>
              Clonar esta oferta <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={clone} disabled={saving} className="h-12 px-6 rounded-full btn-primary-nova text-[15px] inline-flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Guardar mi gemelo <span className="opacity-70 font-medium">· gratis</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Tarjeta de oferta: el anillo muestra los días pagando anuncios (lleno = un año o más). */
function OfferPick({ o, selected, onPick }: { o: Offer; selected: boolean; onPick: () => void }) {
  const C = 2 * Math.PI * 26;
  const fill = Math.min(o.days_active / 365, 1) * C;
  const copy = copyLabel(o.copy_score);
  return (
    <button onClick={onPick} aria-pressed={selected}
      className={`group text-left flex items-center gap-4 p-4 sm:p-5 rounded-2xl border transition-all duration-300 hover:-translate-y-0.5 ${selected ? "border-primary bg-primary/[0.07]" : "border-border bg-card hover:border-foreground/20"}`}>
      <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0" aria-label={`${o.days_active} días pagando anuncios`}>
        <circle cx="32" cy="32" r="26" fill="none" stroke="hsl(var(--secondary))" strokeWidth="5" />
        <circle cx="32" cy="32" r="26" fill="none" stroke="hsl(var(--primary))" strokeWidth="5" strokeLinecap="round"
          strokeDasharray={`${fill} ${C}`} transform="rotate(-90 32 32)" className="transition-all duration-700" />
        <text x="32" y="33" textAnchor="middle" className="fill-foreground font-display" fontSize={o.days_active >= 1000 ? 13 : 15} fontWeight="600">{o.days_active}</text>
        <text x="32" y="45" textAnchor="middle" className="fill-muted-foreground" fontSize="8.5">días</text>
      </svg>
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <p className="font-display text-[16px] font-semibold text-foreground leading-snug line-clamp-2">{nameOf(o)}</p>
          <span className={`shrink-0 w-6 h-6 rounded-full grid place-items-center transition-all duration-300 ${selected ? "bg-primary scale-100" : "scale-0"}`}>
            <Check className="w-3.5 h-3.5 text-primary-foreground" strokeWidth={3} />
          </span>
        </div>
        <p className="text-[13px] text-muted-foreground line-clamp-1">
          {[o.niche ? NICHE_LABEL[o.niche] : null, o.offer_type ? OFFER_TYPE_LABEL[o.offer_type]?.split(" (")[0] : null].filter(Boolean).join(" · ")}
        </p>
        <span className={`inline-block text-[11px] font-semibold rounded-full px-2 py-0.5 ${copy.cls}`}>{copy.label}</span>
      </div>
    </button>
  );
}

/** "La original → Tu versión": lo que se copia igual y lo que se mejora (en ámbar). */
function CloneTable({ o, intel, reading, priceText, localPrice, country, imp, who, setWho, promise, setPromise }: {
  o: Offer; intel: OfferIntel | null; reading: boolean; priceText: string | null; localPrice: string | null;
  country: CountryCode; imp: { lang: boolean; pay: boolean; wa: boolean };
  who: string; setWho: (v: string) => void; promise: string; setPromise: (v: string) => void;
}) {
  const lang = LANG_LABEL[o.language ?? ""] ?? "Su idioma";
  const funnel = intel?.funnel_type ? FUNNEL_LABEL[intel.funnel_type] ?? intel.funnel_type : null;
  const platform = intel?.checkout_data?.platform || intel?.checkout_platform || null;
  const kind = o.offer_type ? OFFER_TYPE_LABEL[o.offer_type]?.split(" (")[0] : null;
  const rows: { k: string; a: string; b: React.ReactNode; hot?: boolean }[] = [
    { k: "Producto", a: kind ?? "—", b: "El mismo formato" },
    { k: "Para quién", a: o.target_audience || "No lo dice", b: <Field value={who} onChange={setWho} placeholder="¿Para quién es?" /> },
    { k: "Promesa", a: o.mechanism || o.why_wins || "No lo dice", b: <Field value={promise} onChange={setPromise} placeholder="¿Qué logra quien lo compra?" /> },
    { k: "Precio", a: reading ? "Leyendo…" : priceText ?? "No lo muestra", b: reading ? "…" : localPrice ?? "Lo pones en \"Precio\"", hot: !!localPrice },
    { k: "Embudo", a: reading ? "Leyendo…" : funnel ?? "Sin leer", b: "El mismo embudo" },
    { k: "Idioma", a: lang, b: imp.lang ? "Español LATAM" : lang, hot: imp.lang && o.language !== "es" },
    { k: "Cobro", a: reading ? "Leyendo…" : platform ?? "Tarjeta", b: imp.pay ? COUNTRIES[country].pay : "Solo tarjeta", hot: imp.pay },
    { k: "Entrega", a: "Correo o su plataforma", b: imp.wa ? "Por WhatsApp, al instante" : "Correo", hot: imp.wa },
  ];
  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:px-6">
      <div className="hidden sm:grid grid-cols-[110px_minmax(0,1fr)_20px_minmax(0,1fr)] gap-3 pb-3 border-b border-border text-[11px] tracking-[0.14em] uppercase">
        <span /><span className="text-muted-foreground">La original</span><span /><span className="text-primary">Tu versión</span>
      </div>
      {rows.map(r => (
        <div key={r.k} className="grid grid-cols-[90px_minmax(0,1fr)] sm:grid-cols-[110px_minmax(0,1fr)_20px_minmax(0,1fr)] gap-x-3 gap-y-1 py-3 border-b border-border/60 last:border-0 items-center text-[14px]">
          <span className="text-muted-foreground text-[13px]">{r.k}</span>
          <span className="text-foreground/70 line-clamp-2">{r.a}</span>
          <ArrowRight className="hidden sm:block w-4 h-4 text-muted-foreground/60" />
          <span className={`col-start-2 sm:col-start-auto font-semibold transition-colors duration-300 ${r.hot ? "text-primary" : "text-foreground"}`}>{r.b}</span>
        </div>
      ))}
    </div>
  );
}

function Field({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} maxLength={300} aria-label={placeholder}
      className="w-full bg-transparent border-b border-dashed border-border focus:border-primary outline-none py-0.5 font-semibold text-foreground placeholder:text-muted-foreground/60 placeholder:font-normal" />
  );
}
