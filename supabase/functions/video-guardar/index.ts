// SUPERNOVA — Guarda los videos terminados en nuestro almacenamiento (06-nov-2026, pedido de Jean).
//
// Por qué: los enlaces de los proveedores (APIMart getapib.org) caducan en unos días; los del 30-oct ya
// daban 403. Cindy hizo 20 tomas (≈1.700 créditos) que se iban a perder. Cada 10 min (cron
// supernova-video-guardar) se copian los video_jobs "done" de los últimos 8 días cuyo result_url aún es
// del proveedor al bucket público `videos-creados` (ruta uid/job.mp4, sin adivinar: dos UUID) y
// result_url pasa a ser ese enlace. Sirve para todas las funciones que generan video (video-studio,
// avatar-studio, avatar-talk, video-generate) sin tocarlas. No gasta IA: solo espacio.
// Si el enlace ya caducó, se deja como está (se reintenta hasta que sale de la ventana de 8 días).
//
// verify_jwt = false (lo invoca pg_cron). Compuerta: secreto de cron.
import { createClient } from "npm:@supabase/supabase-js@2.117.1";

const BUCKET = "videos-creados";
const MAX_BYTES = 50 * 1024 * 1024; // límite por archivo del plan Free de Supabase
const POR_VUELTA = 12;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const secret = req.headers.get("x-cron-secret");
  const { data: okSecret } = secret ? await admin.rpc("verify_cron_secret", { p_secret: secret }) : { data: false };
  if (okSecret !== true) return json(401, { error: "No autorizado" });

  const ownPrefix = `${url}/storage/v1/`;
  const { data: jobs, error } = await admin.from("video_jobs")
    .select("id,user_id,result_url")
    .eq("status", "done")
    .like("result_url", "https://%")
    .not("result_url", "like", `${ownPrefix}%`)
    .gte("created_at", new Date(Date.now() - 8 * 864e5).toISOString())
    .order("created_at", { ascending: false })
    .limit(POR_VUELTA);
  if (error) {
    console.error("video-guardar: consulta", error.message);
    return json(500, { error: "No se pudo leer video_jobs" });
  }

  const out = { guardados: 0, caducados: 0, fallidos: 0 };
  for (const j of jobs ?? []) {
    try {
      const r = await fetch(j.result_url, { signal: AbortSignal.timeout(30_000) });
      if (!r.ok) {
        await r.body?.cancel();
        if (r.status === 403 || r.status === 404 || r.status === 410) out.caducados++; else out.fallidos++;
        continue;
      }
      const len = Number(r.headers.get("content-length") ?? "");
      if (Number.isFinite(len) && len > MAX_BYTES) { await r.body?.cancel(); out.fallidos++; continue; }
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) { out.fallidos++; continue; }
      const path = `${j.user_id}/${j.id}.mp4`;
      const up = await admin.storage.from(BUCKET).upload(path, buf, { contentType: "video/mp4", upsert: true });
      if (up.error) { console.error("video-guardar: subir", j.id, up.error.message); out.fallidos++; continue; }
      const publicUrl = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      // Solo si nadie lo cambió entre medias.
      const { error: upErr } = await admin.from("video_jobs").update({ result_url: publicUrl })
        .eq("id", j.id).eq("result_url", j.result_url);
      if (upErr) { console.error("video-guardar: actualizar", j.id, upErr.message); out.fallidos++; continue; }
      out.guardados++;
    } catch (e) {
      console.error("video-guardar:", j.id, e instanceof Error ? e.message : e);
      out.fallidos++;
    }
  }
  return json(200, { ok: true, revisados: jobs?.length ?? 0, ...out });
});
