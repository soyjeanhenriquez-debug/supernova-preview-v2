import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { useFormAssist } from "@/lib/formAssist";
import { AssistButton } from "@/components/AssistButton";
import {
  profileReady, BUSINESS_TYPES, COPY_LEVELS, PROFILE_EXAMPLES, PRICE_MAX, type BusinessProfile,
} from "@/lib/businessProfile";

/**
 * Formulario de "Mi negocio" (una sola vez; lo usan todas las herramientas). Vive en la página
 * Mi negocio (src/pages/MyBusinessPage.tsx). Guarda SOLO sus campos con savePatch, así no pisa lo
 * que guardan la calculadora, la matriz o el plan. Se guarda solo: 0,8 s después de dejar de escribir,
 * al salir del campo y al cerrar la pestaña.
 */
const TEXT_KEYS = ["product", "who", "promise", "price", "proof"] as const;
type TextKey = typeof TEXT_KEYS[number];
const inputCls = "rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60";

export function BusinessProfileForm({ profile, setProfile, savePatch }: {
  profile: BusinessProfile;
  setProfile: (updater: (p: BusinessProfile) => BusinessProfile) => void;
  savePatch: (patch: Partial<BusinessProfile>, opts?: { typing?: boolean }) => Promise<boolean>;
}) {
  const assist = useFormAssist("mandala-brief");
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<number | null>(null);
  const showSaved = () => {
    setSaved(true);
    if (savedTimer.current) window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(false), 2000);
  };
  const persist = (patch: Partial<BusinessProfile>) =>
    savePatch(patch).then(ok => { if (!ok) toast.error("No se pudo guardar tu negocio"); else showSaved(); return ok; });

  // ---------- Autoguardado mientras se escribe ----------
  const pending = useRef<Partial<BusinessProfile>>({});
  const timer = useRef<number | null>(null);
  const savePatchRef = useRef(savePatch);
  savePatchRef.current = savePatch;
  const flush = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const patch = pending.current;
    if (!Object.keys(patch).length) return;
    pending.current = {};
    void savePatchRef.current(patch, { typing: true }).then(ok => {
      if (!ok) toast.error("No se pudo guardar tu negocio");
      else showSaved();
    });
  }, []);
  const queue = (k: TextKey | "store_url", v: string) => {
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
        const raw = typeof sug[k] === "string" ? (sug[k] as string).slice(0, 300) : "";
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
    return typeof v === "string" && v ? `Ej.: ${v}` : examples[k];
  };
  const text = (k: TextKey | "store_url", label: string, opts: { placeholder?: string; inputMode?: "decimal" | "url" } = {}) => (
    <label key={k} className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <input value={profile[k]} placeholder={opts.placeholder ?? (k === "store_url" ? "" : ph(k))} inputMode={opts.inputMode}
        maxLength={k === "price" ? PRICE_MAX : 300}
        onChange={e => { const v = e.target.value; setProfile(p => ({ ...p, [k]: v })); queue(k, v); }}
        onBlur={e => {
          // Al salir del campo: guarda ya (y lo recorta), sin esperar al autoguardado.
          const patch = { ...pending.current, [k]: e.target.value } as Partial<BusinessProfile>;
          if (timer.current) window.clearTimeout(timer.current);
          timer.current = null;
          pending.current = {};
          void persist(patch);
        }}
        className={inputCls} />
    </label>
  );
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
          {text("product", ecommerce ? "Qué producto vendes" : "Qué vendes")}
          {text("who", "Para quién")}
          {text("promise", ecommerce ? "Qué problema resuelve o qué logra" : "Qué resultado promete")}
          {text("price", "Precio (USD)", { inputMode: "decimal" })}
        </div>
        {text("proof", ecommerce ? "Envío, garantía o pago contra entrega (opcional)" : "Prueba o garantía (opcional)")}
        {ecommerce && text("store_url", "Enlace de tu tienda o del producto (opcional)", { placeholder: "https://tutienda.myshopify.com/products/…", inputMode: "url" })}
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
