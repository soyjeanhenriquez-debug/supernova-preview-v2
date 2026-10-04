import { useEffect, useState } from "react";
import { Check, Plus, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * "Elige tu presentador": las fotos de personaje del propio usuario (bucket privado "personajes",
 * carpeta <uid>/...), "La IA eligió por ti" (sin foto: la IA crea a la persona) o "Crear uno nuevo".
 * Solo se listan rutas de la carpeta del usuario; el servidor vuelve a comprobarlo.
 */
type Photo = { path: string; url: string };
const MAX = 8;

export function PresenterPicker({ uid, value, onChange, disabled }: {
  uid: string; value: string | null; onChange: (path: string | null) => void; disabled?: boolean;
}) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const store = supabase.storage.from("personajes");
        const { data: dirs } = await store.list(uid, { limit: 10, sortBy: { column: "updated_at", order: "desc" } });
        const paths: string[] = [];
        for (const d of dirs ?? []) {
          if (paths.length >= MAX) break;
          if (d.id) { if (/\.(webp|png|jpe?g)$/i.test(d.name)) paths.push(`${uid}/${d.name}`); continue; } // archivo suelto
          const { data: files } = await store.list(`${uid}/${d.name}`, { limit: 4, sortBy: { column: "created_at", order: "desc" } });
          for (const f of files ?? []) if (f.id && /\.(webp|png|jpe?g)$/i.test(f.name) && paths.length < MAX) paths.push(`${uid}/${d.name}/${f.name}`);
        }
        if (value && value.startsWith(`${uid}/`) && !paths.includes(value)) paths.unshift(value);
        const { data: signed } = paths.length ? await store.createSignedUrls(paths.slice(0, MAX), 3600) : { data: [] };
        if (alive) setPhotos((signed ?? []).flatMap(s => (s.signedUrl && s.path ? [{ path: s.path, url: s.signedUrl }] : [])));
      } catch { /* sin fotos: queda "La IA eligió por ti" */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const tile = (on: boolean) => `relative shrink-0 w-[72px] h-[96px] rounded-xl border overflow-hidden transition-colors ${on ? "border-foreground/60" : "border-border hover:border-foreground/30"}`;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Elige tu presentador</p>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <button type="button" disabled={disabled} onClick={() => onChange(null)} className={`${tile(value === null)} flex flex-col items-center justify-center gap-1 bg-card/40 px-1`}>
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-[10px] leading-tight text-center text-foreground">La IA eligió por ti</span>
          {value === null && <Check className="absolute top-1 right-1 w-3.5 h-3.5 text-foreground" />}
        </button>
        {photos.map(p => (
          <button type="button" key={p.path} disabled={disabled} onClick={() => onChange(p.path)} className={tile(value === p.path)} aria-label="Usar este presentador">
            <img src={p.url} alt="" className="w-full h-full object-cover" loading="lazy" />
            {value === p.path && <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-background/80 flex items-center justify-center"><Check className="w-3.5 h-3.5 text-foreground" /></span>}
          </button>
        ))}
        {loading && <div className={`${tile(false)} animate-pulse bg-card/60`} />}
        <button type="button" disabled={disabled} onClick={() => { window.location.hash = "#/personaje"; }} className={`${tile(false)} flex flex-col items-center justify-center gap-1 px-1`}>
          <Plus className="w-4 h-4 text-muted-foreground" />
          <span className="text-[10px] leading-tight text-center text-muted-foreground">Crear uno nuevo</span>
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">Sin foto, la IA crea una persona nueva. Con tu personaje, se ve igual en todos tus videos.</p>
    </div>
  );
}
