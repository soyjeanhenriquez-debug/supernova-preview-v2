import { useEffect, useRef, useState } from "react";
import { ChevronRight, ImagePlus, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MAX_COLORS, MAX_KIT_REFS, kitReferences, saveBrandKit, sanitizeKit, uploadReference, type BrandKit } from "@/lib/brandKit";

/**
 * "Tu marca (opcional)": fotos del producto o logo (hasta 3) + colores + estilo. Todo es opcional y
 * gratis; las fotos se usan como referencia en cada imagen para que tu producto se vea igual.
 */
export function BrandKitPanel({ uid, productId, kit, onChange, useRefs, setUseRefs, disabled }: {
  uid: string; productId: string; kit: BrandKit; onChange: (k: BrandKit) => void;
  useRefs: boolean; setUseRefs: (v: boolean) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [style, setStyle] = useState(kit.style);
  const fileRef = useRef<HTMLInputElement>(null);
  const refs = kitReferences(kit);
  const refsKey = refs.join("|");

  useEffect(() => { setStyle(kit.style); }, [kit.style]);

  // Miniaturas firmadas de las fotos (bucket privado).
  useEffect(() => {
    if (!open || !refsKey) return;
    const paths = refsKey.split("|");
    let alive = true;
    void supabase.storage.from("creativos").createSignedUrls(paths, 3600).then(({ data }) => {
      if (!alive) return;
      const map: Record<string, string> = {};
      for (const s of data ?? []) if (s.path && s.signedUrl) map[s.path] = s.signedUrl;
      setThumbs(map);
    });
    return () => { alive = false; };
  }, [open, refsKey]);

  const persist = async (next: BrandKit) => {
    const clean = sanitizeKit(next, uid);
    onChange(clean);
    const ok = await saveBrandKit(uid, productId, clean);
    if (!ok) toast.error("No se pudo guardar tu marca. Intenta de nuevo.");
    return ok;
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (refs.length >= MAX_KIT_REFS) { toast.error(`Máximo ${MAX_KIT_REFS} fotos. Quita una primero.`); return; }
    setBusy(true);
    try {
      const path = await uploadReference(uid, productId, f);
      if (await persist({ ...kit, ref_paths: [...kit.ref_paths, path] })) { setUseRefs(true); toast.success("Foto lista. Se usará en tus próximas imágenes."); }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir la foto.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeRef = (p: string) => {
    void persist({ ...kit, logo_path: kit.logo_path === p ? null : kit.logo_path, ref_paths: kit.ref_paths.filter(x => x !== p) });
    // La foto queda en tu carpeta; solo deja de usarse. (No se borra nada sin pedirlo.)
  };

  const setColor = (i: number, c: string) => {
    const colors = [...kit.colors]; colors[i] = c;
    onChange({ ...kit, colors });
  };

  const summary = [refs.length ? `${refs.length} foto${refs.length > 1 ? "s" : ""}` : "", kit.colors.length ? `${kit.colors.length} color${kit.colors.length > 1 ? "es" : ""}` : "", kit.style ? "estilo" : ""].filter(Boolean).join(" · ");

  return (
    <div className="rounded-xl border border-border">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="w-full min-h-[44px] flex items-center gap-2 px-4 py-2.5 text-left">
        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="text-[13px] text-foreground">Tu marca y tu producto</span>
        <span className="text-[12px] text-muted-foreground truncate">{summary || "opcional · gratis"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4">
          <div className="space-y-2">
            <p className="text-[12px] text-muted-foreground">Sube la foto de tu producto o tu logo. La IA lo usa como referencia para que se vea igual en cada imagen.</p>
            <div className="flex flex-wrap gap-2">
              {refs.map(p => (
                <div key={p} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border bg-secondary/30">
                  {thumbs[p] && <img src={thumbs[p]} alt="Tu foto de referencia" className="w-full h-full object-cover" />}
                  <button type="button" onClick={() => removeRef(p)} disabled={disabled} aria-label="Quitar foto"
                    className="absolute top-0.5 right-0.5 w-6 h-6 rounded-full bg-background/80 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {refs.length < MAX_KIT_REFS && (
                <button type="button" onClick={() => fileRef.current?.click()} disabled={busy || disabled}
                  className="w-16 h-16 rounded-lg border border-dashed border-border flex flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-60">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                  {busy ? "Subiendo" : "Subir"}
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => void onFile(e.target.files?.[0])} />
            </div>
            {refs.length > 0 && (
              <label className="flex items-center gap-2 text-[12px] text-muted-foreground cursor-pointer select-none">
                <input type="checkbox" checked={useRefs} onChange={e => setUseRefs(e.target.checked)} className="accent-[hsl(var(--primary))]" />
                Usar mis fotos en estas imágenes
              </label>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-[12px] text-muted-foreground">Colores de tu marca (hasta {MAX_COLORS})</p>
            <div className="flex flex-wrap items-center gap-2">
              {kit.colors.map((c, i) => (
                <div key={i} className="relative">
                  <input type="color" value={c} aria-label={`Color ${i + 1}`} disabled={disabled}
                    onChange={e => setColor(i, e.target.value)} onBlur={() => void persist(kit)}
                    className="w-10 h-10 rounded-lg border border-border bg-transparent cursor-pointer p-0.5" />
                  <button type="button" aria-label="Quitar color" disabled={disabled}
                    onClick={() => void persist({ ...kit, colors: kit.colors.filter((_, j) => j !== i) })}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-background border border-border flex items-center justify-center text-muted-foreground hover:text-foreground">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {kit.colors.length < MAX_COLORS && (
                <button type="button" disabled={disabled} onClick={() => void persist({ ...kit, colors: [...kit.colors, "#f5a524"] })}
                  className="w-10 h-10 rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground hover:text-foreground" aria-label="Añadir color">
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="brand-style" className="text-[12px] text-muted-foreground">Estilo (opcional)</label>
            <input id="brand-style" value={style} maxLength={200} disabled={disabled}
              onChange={e => setStyle(e.target.value)} onBlur={() => { if (style.trim() !== kit.style) void persist({ ...kit, style }); }}
              placeholder="Ej.: minimalista, cálido, fotos claras y naturales"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60" />
          </div>
        </div>
      )}
    </div>
  );
}
