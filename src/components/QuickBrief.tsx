import { useState } from "react";
import { ArrowRight, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { askAssist } from "@/lib/formAssist";
import type { BusinessProfile } from "@/lib/businessProfile";

/**
 * "La app no pregunta lo que puede deducir" (manual, 03-oct-2026). Reemplaza los muros de
 * "Primero completa tu ficha": UNA sola pregunta en la misma pantalla. Para quién es y qué logra
 * los propone la IA de ayuda (form-assist, gratis: no cobra créditos) y quedan en "Personalizar",
 * que es opcional. Si la IA de ayuda falla, se guardan textos neutros que se pueden cambiar en Mi ficha.
 */
interface Props {
  profile: BusinessProfile;
  savePatch: (patch: Partial<BusinessProfile>) => Promise<boolean>;
  /** Qué va a hacer la herramienta con esto, en pocas palabras ("escribir tu ebook"). */
  purpose: string;
}

const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60";

export function QuickBrief({ profile, savePatch, purpose }: Props) {
  const [product, setProduct] = useState(profile.product);
  const [who, setWho] = useState(profile.who);
  const [promise, setPromise] = useState(profile.promise);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const p = product.trim();
    if (p.length < 3) { toast.error("Escribe qué vendes, aunque sea en pocas palabras."); return; }
    setBusy(true);
    let w = who.trim(), pr = promise.trim();
    if (w.length < 3 || pr.length < 3) {
      try {
        const s = await askAssist("mandala-brief", { ...profile, product: p, who: w, promise: pr }, "");
        if (w.length < 3 && typeof s.who === "string") w = s.who.slice(0, 300);
        if (pr.length < 3 && typeof s.promise === "string") pr = s.promise.slice(0, 300);
      } catch { /* sin IA de ayuda: textos neutros abajo */ }
      if (w.length < 3) w = `Personas interesadas en ${p}`.slice(0, 300);
      if (pr.length < 3) pr = `Lograr lo que ofrece ${p}`.slice(0, 300);
    }
    const ok = await savePatch({ product: p, who: w, promise: pr });
    setBusy(false);
    if (!ok) toast.error("No se pudo guardar. Intenta de nuevo.");
  };

  return (
    <div className="card-surface rounded-2xl p-5 md:p-6 space-y-3 max-w-2xl">
      <label htmlFor="quick-brief" className="block font-display font-semibold text-[17px] text-foreground">¿Qué vendes o qué quieres vender?</label>
      <p className="text-[13px] text-muted-foreground -mt-1">Una línea basta. Lo usamos para {purpose} y queda guardado para las demás herramientas.</p>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex flex-col sm:flex-row gap-2">
        <input id="quick-brief" value={product} onChange={(e) => setProduct(e.target.value)} maxLength={300} autoFocus
          placeholder="Ej.: curso de repostería para vender desde casa" className={inputCls} />
        <button type="submit" disabled={busy}
          className="btn-primary-nova shrink-0 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Seguir <ArrowRight className="w-4 h-4" /></>}
        </button>
      </form>
      <button type="button" onClick={() => setMore(m => !m)} aria-expanded={more}
        className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
        <ChevronRight className={`w-3.5 h-3.5 transition-transform ${more ? "rotate-90" : ""}`} /> Personalizar (opcional)
      </button>
      {more && (
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={who} onChange={(e) => setWho(e.target.value)} maxLength={300} placeholder="Para quién es (si lo dejas vacío, lo proponemos)" className={inputCls} />
          <input value={promise} onChange={(e) => setPromise(e.target.value)} maxLength={300} placeholder="Qué logra quien lo compra (si lo dejas vacío, lo proponemos)" className={inputCls} />
        </div>
      )}
    </div>
  );
}
