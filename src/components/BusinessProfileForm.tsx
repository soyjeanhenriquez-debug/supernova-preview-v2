import { toast } from "sonner";
import { useFormAssist } from "@/lib/formAssist";
import { AssistButton } from "@/components/AssistButton";
import {
  profileReady, BUSINESS_TYPES, COPY_LEVELS, PROFILE_EXAMPLES, type BusinessProfile,
} from "@/lib/businessProfile";

/**
 * Formulario de "Mi negocio" (una sola vez; lo usan todas las herramientas). Vive en la página
 * Mi negocio (src/pages/MyBusinessPage.tsx). Guarda SOLO sus campos con savePatch, así no pisa lo
 * que guardan la calculadora, la matriz o el plan.
 */
const TEXT_KEYS = ["product", "who", "promise", "price", "proof"] as const;
type TextKey = typeof TEXT_KEYS[number];
const inputCls = "rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60";

export function BusinessProfileForm({ profile, setProfile, savePatch }: {
  profile: BusinessProfile;
  setProfile: (updater: (p: BusinessProfile) => BusinessProfile) => void;
  savePatch: (patch: Partial<BusinessProfile>) => Promise<boolean>;
}) {
  const assist = useFormAssist("mandala-brief");
  const persist = (patch: Partial<BusinessProfile>) =>
    savePatch(patch).then(ok => { if (!ok) toast.error("No se pudo guardar tu negocio"); });

  // Con la ficha a medias, la IA completa solo lo vacío; con la ficha llena, propone otra entera.
  const fill = async () => {
    try {
      const sug = await assist.generate(profileReady(profile) ? { business_type: profile.business_type } : profile);
      const replaceAll = profileReady(profile);
      const patch: Partial<BusinessProfile> = {};
      TEXT_KEYS.forEach(k => {
        const raw = typeof sug[k] === "string" ? (sug[k] as string).slice(0, 300) : "";
        const v = k === "price" ? raw.replace(/[^\d.,]/g, "") : raw;
        if (v && (replaceAll || !profile[k].trim())) patch[k] = v;
      });
      await persist(patch);
      toast.success("Listo: revísalo y cámbialo a tu gusto.");
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
        maxLength={k === "price" ? 30 : 300}
        onChange={e => { const v = e.target.value; setProfile(p => ({ ...p, [k]: v })); }}
        onBlur={e => persist({ [k]: e.target.value } as Partial<BusinessProfile>)}
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
          <AssistButton onClick={fill} loading={assist.loading} filled={profileReady(profile)} />
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
