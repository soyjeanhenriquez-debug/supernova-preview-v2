import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useFormAssist } from "@/lib/formAssist";
import { AssistButton } from "@/components/AssistButton";
import {
  profileReady, BUSINESS_TYPES, COPY_LEVELS, FIELD_MAX, PROFILE_EXAMPLES, tooLong, type BusinessProfile,
} from "@/lib/businessProfile";
import { charCount, CURRENCIES, offerMissing, OFFER_STATUSES, PRICE_MODES, type OfferStatus, type PriceMode } from "@/lib/brandDna";
import { currentScenario, parseAmount } from "@/lib/pricing";

/**
 * Formulario de "Mi negocio" (una sola vez; lo usan todas las herramientas). Vive en la página
 * Mi negocio (src/pages/MyBusinessPage.tsx). Guarda SOLO sus campos con savePatch, así no pisa lo
 * que guardan la calculadora, la matriz o el plan. Se guarda solo: 0,8 s después de dejar de escribir,
 * al salir del campo y al cerrar la pestaña.
 * El precio va con la moneda de la calculadora (o la del país de la persona) y, si ya hizo números
 * en "Precio y ganancia", cambiarlo aquí cambia también el escenario de la calculadora: un solo
 * precio en toda la app.
 */
const TEXT_KEYS = ["product", "who", "promise", "price", "proof"] as const;
const EXTRA_KEYS = ["problem", "delivers", "differentiator", "limitations", "next_action"] as const;
type TextKey = typeof TEXT_KEYS[number] | typeof EXTRA_KEYS[number];
/** Moneda de la calculadora (símbolo) → código de la oferta. */
const ISO: Record<string, string> = { "US$": "USD", "RD$": "DOP", "COP$": "COP", "MX$": "MXN", "€": "EUR" };
const inputCls = "rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60";

export function BusinessProfileForm({ profile, setProfile, savePatch, currency }: {
  profile: BusinessProfile;
  setProfile: (updater: (p: BusinessProfile) => BusinessProfile) => void;
  savePatch: (patch: Partial<BusinessProfile>, opts?: { typing?: boolean }) => Promise<boolean>;
  /** Moneda por defecto (la del país de la persona) si todavía no usó la calculadora. */
  currency?: string;
}) {
  const cur = profile.pricing?.currency || currency || "US$";
  const pricingRef = useRef(profile.pricing);
  pricingRef.current = profile.pricing;
  /** Si el patch cambia el precio y hay calculadora, el escenario que vale toma el mismo precio. */
  const withPricing = (patch: Partial<BusinessProfile>): Partial<BusinessProfile> => {
    if (typeof patch.price !== "string" || !/^[\d.,\s]+$/.test(patch.price.trim())) return patch;
    const n = parseAmount(patch.price);
    const pr = pricingRef.current;
    const c = currentScenario(pr);
    if (!pr || !c || n === null || n <= 0 || n === c.scenario.price) return patch;
    return { ...patch, pricing: { ...pr, scenarios: pr.scenarios.map(s => (s.id === c.scenario.id ? { ...s, price: n } : s)) } };
  };
  const assist = useFormAssist("mandala-brief");
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<number | null>(null);
  const showSaved = () => {
    setSaved(true);
    if (savedTimer.current) window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(false), 2000);
  };
  const persist = (patch: Partial<BusinessProfile>) => {
    // Un texto que pasa su tope no se manda (la base lo rechazaría) ni se recorta: el campo lo avisa.
    if (Object.entries(patch).some(([k, v]) => tooLong(k, v))) return Promise.resolve(false);
    return savePatch(withPricing(patch)).then(ok => { if (!ok) toast.error("No se guardó, revisa tu conexión."); else showSaved(); return ok; });
  };

  // ---------- Autoguardado mientras se escribe ----------
  const pending = useRef<Partial<BusinessProfile>>({});
  const timer = useRef<number | null>(null);
  const savePatchRef = useRef(savePatch);
  savePatchRef.current = savePatch;
  const withPricingRef = useRef(withPricing);
  withPricingRef.current = withPricing;
  const flush = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const patch = pending.current;
    if (!Object.keys(patch).length) return;
    pending.current = {};
    if (Object.entries(patch).some(([k, v]) => tooLong(k, v))) {
      // Lo que pasa el tope se queda en pantalla (con su aviso); lo demás sí se guarda.
      for (const [k, v] of Object.entries(patch)) if (tooLong(k, v)) delete (patch as Record<string, unknown>)[k];
      if (!Object.keys(patch).length) return;
    }
    void savePatchRef.current(withPricingRef.current(patch), { typing: true }).then(ok => {
      if (!ok) toast.error("No se guardó, revisa tu conexión.");
      else showSaved();
    });
  }, []);
  const queue = (k: TextKey | "store_url", v: string) => {
    if (tooLong(k, v)) return; // se avisa en el campo; no se guarda ni se recorta
    pending.current = { ...pending.current, [k]: v };
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 800);
  };
  // Cerrar la pestaña, cambiar de app en el móvil o salir de la pantalla: se guarda lo pendiente.
  useEffect(() => {
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
      flush();
      if (savedTimer.current) window.clearTimeout(savedTimer.current);
    };
  }, [flush]);

  // Con la ficha a medias, la IA completa solo lo vacío; con la ficha llena, propone otra entera.
  const fill = async () => {
    const replaceAll = profileReady(profile);
    if (replaceAll && !window.confirm("Esto reemplaza tu ficha actual. ¿Seguir?")) return;
    flush();
    try {
      const sug = await assist.generate(replaceAll ? { business_type: profile.business_type } : profile);
      const patch: Partial<BusinessProfile> = {};
      const before: Partial<BusinessProfile> = {};
      TEXT_KEYS.forEach(k => {
        const raw = typeof sug[k] === "string" ? [...(sug[k] as string)].slice(0, FIELD_MAX[k] ?? 300).join("") : "";
        const v = k === "price" ? raw.replace(/[^\d.,]/g, "") : raw;
        if (v && (replaceAll || !profile[k].trim())) { patch[k] = v; before[k] = profile[k]; }
      });
      if (!(await persist(patch))) return;
      // "Deshacer" vuelve a la ficha que había antes del ejemplo.
      toast.success("Listo: revísalo y cámbialo a tu gusto.", {
        duration: 8000,
        action: { label: "Deshacer", onClick: () => { void persist(before).then(ok => { if (ok) toast.success("Volvió tu ficha anterior"); }); } },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo escribir el ejemplo. Prueba otra vez.");
    }
  };

  const examples = PROFILE_EXAMPLES[profile.business_type === "ecommerce" ? "ecommerce" : "default"];
  const ph = (k: TextKey) => {
    const v = assist.suggestion?.[k];
    return typeof v === "string" && v ? `Ej.: ${v}` : (examples as Record<string, string>)[k] ?? "";
  };
  const text = (k: TextKey | "store_url", label: string, opts: { placeholder?: string; inputMode?: "decimal" | "url"; multiline?: boolean } = {}) => {
    const max = FIELD_MAX[k];
    const n = charCount(profile[k] ?? "");
    const over = max != null && n > max;
    const props = {
      value: profile[k] ?? "", placeholder: opts.placeholder ?? (k === "store_url" ? "" : ph(k as TextKey)), "aria-invalid": over,
      onChange: (e: { target: { value: string } }) => { const v = e.target.value; setProfile(p => ({ ...p, [k]: v })); queue(k, v); },
      onBlur: (e: { target: { value: string } }) => {
        // Al salir del campo: guarda ya, sin esperar al autoguardado (si cabe en su tope).
        const patch = { ...pending.current, [k]: e.target.value } as Partial<BusinessProfile>;
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = null;
        pending.current = {};
        void persist(patch);
      },
      className: `${inputCls} ${over ? "border-destructive" : ""}`,
    };
    return (
      <label key={k} className="flex flex-col gap-1 text-xs text-muted-foreground">
        {label}
        {opts.multiline ? <textarea rows={2} {...props} className={`${props.className} resize-y min-h-[64px]`} /> : <input inputMode={opts.inputMode} {...props} />}
        {max != null && max > 40 && (
          <span className={`flex justify-between gap-2 text-[11px] ${over ? "text-destructive" : "text-muted-foreground/80"}`}>
            <span role={over ? "alert" : undefined}>{over ? `Te pasaste por ${n - max}. Acórtalo y se guarda solo.` : ""}</span>
            <span className="tabular-nums">{n}/{max}</span>
          </span>
        )}
      </label>
    );
  };
  // ---------- Oferta: estado y precio estructurado (19-oct-2026) ----------
  const missing = offerMissing(profile);
  const offerCur = profile.price_currency || ISO[cur] || "USD";
  const [amountText, setAmountText] = useState(profile.price_amount != null ? String(profile.price_amount).replace(".", ",") : "");
  const setPrice = (patch: Partial<Pick<BusinessProfile, "price_amount" | "price_currency" | "price_mode">>) => {
    const next = { price_currency: offerCur, price_mode: profile.price_mode ?? "unico" as PriceMode, ...patch };
    setProfile(p => ({ ...p, ...next }));
    // El precio en texto sigue para las herramientas que ya lo leen (y la calculadora).
    const amount = "price_amount" in patch ? patch.price_amount : profile.price_amount;
    void persist({ ...next, ...(amount != null && "price_amount" in patch ? { price: String(amount).replace(".", ",") } : {}) });
  };
  const setStatus = (st: OfferStatus) => {
    if ((st === "validacion" || st === "disponible") && missing.length) { toast.error(`Para eso falta: ${missing.join(", ")}.`); return; }
    setProfile(p => ({ ...p, offer_status: st }));
    void persist({ offer_status: st });
  };
  const ecommerce = profile.business_type === "ecommerce";

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">¿Qué tipo de negocio tienes?</p>
        <div className="flex flex-wrap gap-2">
          {BUSINESS_TYPES.map(t => (
            <button key={t.id} type="button" onClick={() => persist({ business_type: t.id })}
              className={`rounded-full border px-3 py-1.5 text-xs ${profile.business_type === t.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Qué vendes, para quién y qué logra. Todo sale de aquí.</p>
          <div className="flex items-center gap-3">
            <span aria-live="polite" className={`inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}>
              <Check className="w-3 h-3 text-emerald-400" /> Guardado
            </span>
            <AssistButton onClick={fill} loading={assist.loading} filled={profileReady(profile)} />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {text("product", ecommerce ? "Qué producto vendes" : "Qué vendes", { multiline: true })}
          {text("who", "Para quién, exactamente", { multiline: true })}
          {text("promise", ecommerce ? "Qué problema resuelve o qué logra" : "Qué resultado concreto promete", { multiline: true })}
          <fieldset className="flex flex-col gap-1 text-xs text-muted-foreground">
            <legend className="mb-1">Precio</legend>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input inputMode="decimal" aria-label="Importe" placeholder="99" value={amountText}
                onChange={e => setAmountText(e.target.value)}
                onBlur={e => { const n = e.target.value.trim() === "" ? null : parseAmount(e.target.value); setPrice({ price_amount: n != null && n >= 0 ? n : null }); }}
                className={inputCls} />
              <select aria-label="Moneda" value={offerCur} onChange={e => setPrice({ price_currency: e.target.value })} className={inputCls}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <select aria-label="Forma de pago" value={profile.price_mode ?? "unico"} onChange={e => setPrice({ price_mode: e.target.value as PriceMode })} className={inputCls}>
              {PRICE_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            {profile.price && profile.price_amount == null && <span className="text-[11px]">Tenías escrito: «{profile.price}». Pon el importe en número.</span>}
          </fieldset>
        </div>
        {text("proof", ecommerce ? "Envío, garantía o pago contra entrega (opcional)" : "Pruebas o testimonios que se puedan comprobar (opcional)", { multiline: true })}
        {ecommerce && text("store_url", "Enlace de tu tienda o del producto (opcional)", { placeholder: "https://tutienda.myshopify.com/products/…", inputMode: "url" })}
        <details className="group rounded-xl border border-border px-3 py-2">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between text-[13px] text-foreground">
            Más sobre tu oferta (opcional) <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2 grid sm:grid-cols-2 gap-3 pb-2">
            {text("problem", "Qué problema tiene antes de comprar", { multiline: true, placeholder: "Ej.: Sabe hacer algo valioso pero no sabe cómo venderlo." })}
            {text("delivers", "Qué recibe después de comprar", { multiline: true, placeholder: "Ej.: 4 clases en vivo y una plantilla." })}
            {text("differentiator", "Qué la hace distinta", { multiline: true, placeholder: "Ej.: Trabajas sobre tu propia oferta, no sobre ejemplos." })}
            {text("limitations", "Límites y lo que NO garantiza", { multiline: true, placeholder: "Ej.: No garantiza ventas; depende de tu ejecución." })}
            {text("next_action", "Qué debe hacer quien se interese", { placeholder: "Ej.: Escribir TALLER por WhatsApp." })}
          </div>
        </details>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">Estado de esta oferta</p>
        <div role="radiogroup" aria-label="Estado de la oferta" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {OFFER_STATUSES.map(st => {
            const blocked = (st.id === "validacion" || st.id === "disponible") && missing.length > 0;
            return (
              <button key={st.id} type="button" role="radio" aria-checked={profile.offer_status === st.id} onClick={() => setStatus(st.id)}
                aria-disabled={blocked} title={blocked ? `Falta: ${missing.join(", ")}` : st.line}
                className={`min-h-[44px] rounded-lg border p-2 text-left ${profile.offer_status === st.id ? "border-primary bg-primary/10" : "border-border hover:border-foreground/30"} ${blocked ? "opacity-60" : ""}`}>
                <span className={`block text-xs font-semibold ${profile.offer_status === st.id ? "text-primary" : "text-foreground"}`}>{st.label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">{OFFER_STATUSES.find(x => x.id === profile.offer_status)?.line}{missing.length ? ` Para publicarla falta: ${missing.join(", ")}.` : ""}</p>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">¿Qué tono quieres en tus anuncios? Lo usan todas las herramientas y lo cambias cuando quieras.</p>
        <div className="grid sm:grid-cols-3 gap-2">
          {COPY_LEVELS.map(l => (
            <button key={l.id} type="button" onClick={() => persist({ copy_level: l.id })}
              className={`rounded-lg border p-2.5 text-left ${profile.copy_level === l.id ? "border-primary bg-primary/10" : "border-border hover:border-foreground/30"}`}>
              <span className={`block text-xs font-semibold ${profile.copy_level === l.id ? "text-primary" : "text-foreground"}`}>{l.id} · {l.label}</span>
              <span className="block text-[11px] text-muted-foreground mt-0.5 leading-snug">{l.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
