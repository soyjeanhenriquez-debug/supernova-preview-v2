import { supabase } from "@/integrations/supabase/client";

/**
 * Fotos que sube la persona para el estudio (su cara, su producto, su ropa…). Las comparten el Estudio de avatar
 * y "Anuncio en video" (22-oct-2026). Van a SU carpeta del bucket privado "personajes"; el servidor vuelve a
 * comprobar que la ruta es suya antes de usarla (avatar-studio, signRef).
 */
export type StudioRef = { bucket: "personajes" | "estudio-avatar"; path: string; url: string } | { stock: string; url: string };

/** Lo que se le manda al servidor: nunca la URL, solo la ruta propia o el id del avatar de SUPERNOVA. */
export const refForServer = (r: StudioRef) => ("stock" in r ? { stock: r.stock } : { bucket: r.bucket, path: r.path });

/** Foto del celular → WebP de máx. 1536 px (menos peso, misma calidad para la IA). */
export async function toWebp(file: Blob, flip = false): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, 1536 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  const ctx = c.getContext("2d")!;
  if (flip) { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error("No se pudo leer la imagen."))), "image/webp", 0.9));
}

export async function uploadStudioImage(uid: string, folder: string, file: Blob, name: string, flip = false): Promise<StudioRef> {
  const blob = await toWebp(file, flip);
  const path = `${uid}/${folder}/estudio-${name}-${Date.now()}.webp`;
  const up = await supabase.storage.from("personajes").upload(path, blob, { contentType: "image/webp", upsert: false });
  if (up.error) throw new Error("No se pudo subir la imagen. Intenta de nuevo.");
  const { data } = await supabase.storage.from("personajes").createSignedUrl(path, 3600);
  return { bucket: "personajes", path, url: data?.signedUrl ?? URL.createObjectURL(blob) };
}
