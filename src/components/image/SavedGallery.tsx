import { useCallback, useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type SavedImage = { path: string; url: string };

const PAGE = 12;
const SOFT_LIMIT = 200;

/**
 * "Tus imágenes": 12 por página con "Ver más" (bucket privado "creativos", carpeta del producto).
 * En modo selección sirve para elegir la imagen a variar. Aviso suave desde 200 imágenes: el
 * almacenamiento es limitado. No borra nada por su cuenta.
 */
export function SavedGallery({ folder, refreshKey, selectable, selected, onSelect, onOpen }: {
  folder: string; refreshKey: number;
  selectable?: boolean; selected?: string | null; onSelect?: (img: SavedImage) => void;
  onOpen?: (img: SavedImage) => void;
}) {
  const [items, setItems] = useState<SavedImage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [many, setMany] = useState(false);

  const fetchPage = useCallback(async (offset: number): Promise<SavedImage[]> => {
    const { data } = await supabase.storage.from("creativos").list(folder, { limit: PAGE + 1, offset, sortBy: { column: "created_at", order: "desc" } });
    const files = (data ?? []).filter(f => f.name.endsWith(".webp"));
    setHasMore((data ?? []).length > PAGE);
    const names = files.slice(0, PAGE).map(f => `${folder}/${f.name}`);
    if (!names.length) return [];
    const { data: signed } = await supabase.storage.from("creativos").createSignedUrls(names, 3600);
    return (signed ?? []).filter(s => s.signedUrl && s.path).map(s => ({ path: s.path as string, url: s.signedUrl }));
  }, [folder]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void fetchPage(0).then(list => { if (alive) { setItems(list); setLoading(false); } });
    // ¿Ya hay 200 o más? Una consulta de 1 elemento en la posición 200.
    void supabase.storage.from("creativos").list(folder, { limit: 1, offset: SOFT_LIMIT - 1 }).then(({ data }) => { if (alive) setMany((data ?? []).length > 0); });
    return () => { alive = false; };
  }, [fetchPage, folder, refreshKey]);

  const more = async () => {
    setLoading(true);
    const next = await fetchPage(items.length);
    setItems(list => [...list, ...next.filter(n => !list.some(l => l.path === n.path))]);
    setLoading(false);
  };

  if (!items.length && !loading) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-[11px] uppercase tracking-[0.18em] font-semibold text-foreground">{selectable ? "Elige la imagen que quieres variar" : "Tus imágenes"}</h2>
      {many && (
        <p className="text-[12px] text-muted-foreground">Tienes más de 200 imágenes en este producto. Descarga las que vas a usar: el espacio de guardado es limitado.</p>
      )}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        {items.map(s => {
          const isSel = selectable && selected === s.path;
          return (
            <button key={s.path} type="button"
              onClick={() => (selectable ? onSelect?.(s) : onOpen?.(s))}
              title={selectable ? "Elegir" : "Descargar"} aria-pressed={selectable ? isSel : undefined}
              className={`relative rounded-lg overflow-hidden border aspect-square bg-secondary/30 ${isSel ? "border-primary ring-1 ring-primary" : "border-border"}`}>
              <img src={s.url} alt="" loading="lazy" className="w-full h-full object-cover" />
              {isSel && <span className="absolute top-1 right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center"><Check className="w-4 h-4" /></span>}
            </button>
          );
        })}
      </div>
      {hasMore && (
        <button type="button" onClick={() => void more()} disabled={loading}
          className="min-h-[40px] inline-flex items-center gap-2 rounded-lg border border-border px-4 text-[13px] text-muted-foreground hover:text-foreground disabled:opacity-60">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />} Ver más
        </button>
      )}
    </section>
  );
}
