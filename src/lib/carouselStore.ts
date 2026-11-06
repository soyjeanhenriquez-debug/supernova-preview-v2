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
export function saveDraft(uid: string, pid: string, d: CarouselDraft | null) {
  // Un carrusel con contenido se guarda también en la base («Lo que creaste», 06-nov-2026): antes solo vivía en
  // este navegador. Lleva su id para actualizarse en vez de duplicarse.
  if (d && d.slides.length && !d.saveId) d.saveId = crypto.randomUUID();
  lsSet(lsKey("draft", uid, pid), d);
  if (d?.saveId) guardarEnBase(uid, pid, d);
}

/** Abre un carrusel guardado: lo deja como borrador del producto activo (Carrusel lo carga al abrir). */
export const abrirGuardado = (uid: string, pid: string, d: CarouselDraft) => lsSet(lsKey("draft", uid, pid), d);

// Sin la imagen firmada (vence) ni datos pesados: al abrir se vuelve a firmar desde su ruta.
const sinUrls = (d: CarouselDraft): CarouselDraft => ({
  ...d,
  slides: d.slides.map(s => ({ ...s, image: undefined, photo: undefined })),
});
const tituloDe = (d: CarouselDraft) => (d.covers[d.pick]?.title || d.slides[0]?.title || d.idea || "Carrusel").replace(/\*/g, "").slice(0, 120);

// Cada cambio guarda el borrador en el navegador al instante; a la base va 2 s después del último cambio.
const pendientes = new Map<string, ReturnType<typeof setTimeout>>();
function guardarEnBase(uid: string, pid: string, d: CarouselDraft) {
  const id = d.saveId!;
  clearTimeout(pendientes.get(id));
  pendientes.set(id, setTimeout(() => {
    pendientes.delete(id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (supabase as any).from("carousel_saves").upsert({
      id, user_id: uid, product_id: pid, title: tituloDe(d), draft: sinUrls(d), updated_at: new Date().toISOString(),
    }).then(({ error }: { error: { message: string } | null }) => { if (error) console.warn("carousel_saves:", error.message); });
  }, 2000));
}
