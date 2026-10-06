import { supabase } from "@/integrations/supabase/client";

/**
 * Kit de marca (tabla brand_kits, una fila por usuario y producto; plan ATLAS, LUMEN 04-oct-2026).
 * Colores (≤ 5, hex), estilo (≤ 200), logo y fotos de referencia (≤ 3, rutas del bucket privado
 * "creativos" del propio usuario). Se añade a cada prompt para que la serie se vea igual; las fotos
 * van como `reference_paths` a generate-ad-creative (que vuelve a validarlas). RLS: solo lo propio.
 */
export type BrandKit = { colors: string[]; style: string; logo_path: string | null; ref_paths: string[] };
export const EMPTY_KIT: BrandKit = { colors: [], style: "", logo_path: null, ref_paths: [] };
export const MAX_COLORS = 5;
export const MAX_KIT_REFS = 3;
export const MAX_REF_BYTES = 2 * 1024 * 1024;

const HEX = /^#[0-9a-f]{6}$/i;

/** Ruta propia y segura dentro de "creativos". */
export function ownPath(p: unknown, uid: string): p is string {
  return typeof p === "string" && p.length <= 300 && p.startsWith(`${uid}/`) && !p.includes("..") && !p.includes("//") && /^[A-Za-z0-9._\-/]+$/.test(p);
}

/** Limpia lo que venga de la base o de la pantalla antes de guardarlo o usarlo. */
export function sanitizeKit(x: Partial<BrandKit> | null | undefined, uid: string): BrandKit {
  const colors = Array.from(new Set((x?.colors ?? []).filter(c => typeof c === "string" && HEX.test(c)).map(c => c.toLowerCase()))).slice(0, MAX_COLORS);
  const style = typeof x?.style === "string" ? x.style.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  const logo_path = ownPath(x?.logo_path, uid) ? x!.logo_path! : null;
  const ref_paths = Array.from(new Set((x?.ref_paths ?? []).filter(p => ownPath(p, uid)))).slice(0, MAX_KIT_REFS);
  return { colors, style, logo_path, ref_paths };
}

/** Fotos que se mandan como referencia: logo primero y luego las del producto, máximo 3 en total. */
export function kitReferences(kit: BrandKit): string[] {
  return Array.from(new Set([kit.logo_path, ...kit.ref_paths].filter((p): p is string => !!p))).slice(0, MAX_KIT_REFS);
}

export const kitIsEmpty = (k: BrandKit) => !k.colors.length && !k.style && !k.logo_path && !k.ref_paths.length;

// La tabla aún no está en los tipos generados de Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as any).from("brand_kits");

export async function loadBrandKit(uid: string, productId: string): Promise<BrandKit> {
  const { data, error } = await table().select("colors,style,logo_path,ref_paths").eq("user_id", uid).eq("product_id", productId).maybeSingle();
  if (error || !data) return EMPTY_KIT;
  return sanitizeKit(data as Partial<BrandKit>, uid);
}

export async function saveBrandKit(uid: string, productId: string, kit: BrandKit): Promise<boolean> {
  const k = sanitizeKit(kit, uid);
  const { error } = await table().upsert(
    { user_id: uid, product_id: productId, ...k, style: k.style || null, updated_at: new Date().toISOString() },
    { onConflict: "user_id,product_id" },
  );
  return !error;
}

/** Foto del producto o logo → WebP ≤ 1280 px y ≤ 2 MB, en <uid>/<producto>/refs/. Devuelve la ruta. */
export async function uploadReference(uid: string, productId: string, file: File): Promise<string> {
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) throw new Error("Sube una foto en JPG, PNG o WebP.");
  if (file.size > 15 * 1024 * 1024) throw new Error("La foto pesa demasiado (máximo 15 MB).");
  const blob = await toWebp(file, 1280);
  if (blob.size > MAX_REF_BYTES) throw new Error("La foto sigue pesando más de 2 MB. Prueba con otra.");
  const path = `${uid}/${productId}/refs/${Date.now()}.webp`;
  const { error } = await supabase.storage.from("creativos").upload(path, blob, { contentType: "image/webp", upsert: false });
  if (error) throw new Error("No se pudo subir la foto. Intenta de nuevo.");
  return path;
}

/** Lo que acepta la carpeta "creativos" (límite del bucket: 2 MB); se deja margen. */
const MAX_UPLOAD = 1.9 * 1024 * 1024;
const encode = (c: HTMLCanvasElement, type: string, q: number) =>
  new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error("No se pudo preparar la imagen."))), type, q));

/**
 * Cualquier imagen (archivo o data URL) → WebP comprimido, de menos de 2 MB.
 * Safari y Chrome del iPhone (WebKit) no saben crear WebP: devuelven un PNG que, en una foto, pasa de
 * 2 MB y la carpeta lo rechaza (error del 06-oct-2026 en la portada del carrusel). En ese caso se usa
 * JPEG y se baja la calidad hasta que quepa. Las imágenes se muestran igual con cualquiera de los dos.
 */
export async function toWebp(src: Blob | string, max = 1080, quality = 0.86): Promise<Blob> {
  const url = typeof src === "string" ? src : URL.createObjectURL(src);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * scale)); c.height = Math.max(1, Math.round(img.height * scale));
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("No se pudo preparar la imagen.");
    ctx.drawImage(img, 0, 0, c.width, c.height);
    let out = await encode(c, "image/webp", quality);
    if (out.type === "image/webp" && out.size <= MAX_UPLOAD) return out;
    for (const q of [quality, 0.78, 0.68, 0.56]) {
      out = await encode(c, "image/jpeg", q);
      if (out.size <= MAX_UPLOAD) return out;
    }
    return out;
  } finally {
    if (typeof src !== "string") URL.revokeObjectURL(url);
  }
}
