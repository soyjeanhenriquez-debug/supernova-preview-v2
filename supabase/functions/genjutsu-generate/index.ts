// SUPERNOVA — Genjutsu: crea un video con Seedance 2.0 reference-to-video (Higgsfield o APIMart).
// SOLO Jean (compuerta en el servidor, ver _shared/genjutsu.ts). Sin créditos.
// { mode, prompt?, ref_video_path, image_paths[≤9], duration, aspect_ratio, provider } → fila en genjutsu_jobs
// con el task_id del proveedor. Los archivos van con URL firmada de 1 h; las llaves nunca salen.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { admin, json } from "../_shared/media.ts";
import { MODE_PROMPT, owner, ownPath, providerReady, signed, submit, type Provider } from "../_shared/genjutsu.ts";

const ASPECTS: Record<Provider, string[]> = {
  higgsfield: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
  apimart: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const uid = await owner(req);
    if (!uid) return json({ error: "No encontrado." }, 404);
    const raw = await req.text();
    if (raw.length > 8000) return json({ error: "Solicitud demasiado grande." }, 413);
    const b = raw ? JSON.parse(raw) : {};
    const provider: Provider | null = b.provider === "higgsfield" || b.provider === "apimart" ? b.provider : null;
    if (!provider) return json({ error: "Proveedor inválido." }, 400);
    const mode: "movimiento" | "objetos" = b.mode === "objetos" ? "objetos" : "movimiento";
    const extra = typeof b.prompt === "string" ? b.prompt.trim().slice(0, 3000) : "";
    const prompt = `${MODE_PROMPT[mode]}${extra ? `\n${extra}` : ""}`;
    const video = ownPath(uid, b.ref_video_path);
    if (!video || !/\.(mp4|mov)$/i.test(video)) return json({ error: "Falta el video de referencia (mp4 o mov)." }, 400);
    const rawImgs: unknown[] = Array.isArray(b.image_paths) ? b.image_paths : b.image_path ? [b.image_path] : [];
    if (rawImgs.length > 9) return json({ error: "Máximo 9 imágenes." }, 400);
    const images = rawImgs.map(p => ownPath(uid, p));
    if (images.some(p => !p || !/\.(jpe?g|png|webp)$/i.test(p))) return json({ error: "Imagen inválida." }, 400);
    if (mode === "objetos" && !images.length) return json({ error: "Para intercambiar un objeto, sube su imagen." }, 400);
    const duration = Math.round(Number(b.duration));
    if (!(duration >= 4 && duration <= 15)) return json({ error: "La duración va de 4 a 15 segundos." }, 400);
    const aspect = String(b.aspect_ratio ?? "");
    if (!ASPECTS[provider].includes(aspect)) return json({ error: `Formato no válido para ${provider}.` }, 400);
    if (!providerReady(provider)) {
      return json({ error: provider === "higgsfield" ? "Faltan HF_API_KEY_ID y HF_API_KEY_SECRET en los secrets de Supabase." : "Falta APIMART_API_KEY en los secrets de Supabase." }, 503);
    }

    const [videoUrl, ...imageUrls] = await Promise.all([signed(video), ...images.map(p => signed(p as string))]);
    if (!videoUrl || imageUrls.some(u => !u)) return json({ error: "No se encontró el archivo subido." }, 400);

    const db = admin();
    const { data: job, error } = await db.from("genjutsu_jobs").insert({
      user_id: uid, provider, mode, status: "queued", prompt, ref_video_path: video, image_path: images[0] ?? null, image_paths: images,
    }).select("id").single();
    if (error || !job) { console.error("genjutsu-generate: insert", error?.message); return json({ error: "No se pudo guardar el trabajo." }, 500); }

    const sent = await submit(provider, { prompt, videoUrl, imageUrls: imageUrls as string[], duration, aspect, idempotency: job.id });
    if ("error" in sent) {
      await db.from("genjutsu_jobs").update({ status: "failed", error: sent.error.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", job.id);
      return json({ error: sent.error, job_id: job.id }, 502);
    }
    await db.from("genjutsu_jobs").update({ task_id: sent.taskId, updated_at: new Date().toISOString() }).eq("id", job.id);
    return json({ job_id: job.id, task_id: sent.taskId, status: "queued" });
  } catch (e) {
    console.error("genjutsu-generate:", e instanceof Error ? e.message : "error");
    return json({ error: "Error inesperado." }, 500);
  }
});
