import { supabase } from "@/integrations/supabase/client";
import { sanitizeDesign, type CarouselDesign, type CarouselDraft } from "@/lib/carousel";

/**
 * Dónde vive el sistema de diseño del carrusel: columna `carousel` de brand_kits (una fila por
 * usuario y producto, RLS: solo lo propio), para que TODOS los carruseles del producto se vean como
 * una sola marca (la prueba de la cuadrícula). Si la columna aún no existe, se usa el navegador.
 * El último borrador se guarda solo en el navegador (comodidad: no se pierde al recargar).
 */
// La columna aún no está en los tipos generados de Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as any).from("brand_kits");
const lsKey = (k: string, uid: string, pid: string) => `sn-carousel-${k}:${uid}:${pid}`;

function lsGet(key: string): unknown {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
function lsSet(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* sin almacenamiento: no pasa nada */ }
}

/** null = todavía no eligió su sistema (se muestra el paso de diseño abierto). */
export async function loadDesign(uid: string, pid: string): Promise<CarouselDesign | null> {
  try {
    const { data, error } = await table().select("carousel").eq("user_id", uid).eq("product_id", pid).maybeSingle();
    if (!error && data?.carousel) return sanitizeDesign(data.carousel);
  } catch { /* cae al navegador */ }
  const local = lsGet(lsKey("design", uid, pid));
  return local ? sanitizeDesign(local) : null;
}

export async function saveDesign(uid: string, pid: string, d: CarouselDesign): Promise<void> {
  const clean = sanitizeDesign(d);
  lsSet(lsKey("design", uid, pid), clean);
  try {
    await table().upsert({ user_id: uid, product_id: pid, carousel: clean, updated_at: new Date().toISOString() }, { onConflict: "user_id,product_id" });
  } catch { /* queda en el navegador */ }
}

export function loadDraft(uid: string, pid: string): CarouselDraft | null {
  const d = lsGet(lsKey("draft", uid, pid)) as CarouselDraft | null;
  return d && Array.isArray(d.slides) && Array.isArray(d.covers) ? d : null;
}
export const saveDraft = (uid: string, pid: string, d: CarouselDraft | null) => lsSet(lsKey("draft", uid, pid), d);
