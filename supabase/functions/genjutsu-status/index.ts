// SUPERNOVA — Genjutsu: consulta al proveedor los trabajos pendientes de Jean y actualiza status y
// result_url. { job_id? } → si no viene, revisa hasta 10 pendientes. SOLO Jean (compuerta en el servidor).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { admin, json } from "../_shared/media.ts";
import { owner, poll, type Provider } from "../_shared/genjutsu.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const uid = await owner(req);
    if (!uid) return json({ error: "No encontrado." }, 404);
    const raw = await req.text();
    if (raw.length > 2000) return json({ error: "Solicitud demasiado grande." }, 413);
    const b = raw ? JSON.parse(raw) : {};
    const db = admin();
    let q = db.from("genjutsu_jobs").select("id,provider,task_id,status").eq("user_id", uid).not("task_id", "is", null)
      .in("status", ["queued", "in_progress"]).order("created_at", { ascending: false }).limit(10);
    if (typeof b.job_id === "string" && /^[0-9a-f-]{36}$/.test(b.job_id)) q = q.eq("id", b.job_id);
    const { data: jobs, error } = await q;
    if (error) return json({ error: "No se pudo leer." }, 500);

    const out = await Promise.all((jobs ?? []).map(async j => {
      const r = await poll(j.provider as Provider, j.task_id as string);
      if (!r) return { id: j.id, status: j.status };
      if (r.status !== j.status || r.resultUrl || r.error) {
        await db.from("genjutsu_jobs").update({
          status: r.status, result_url: r.resultUrl ?? null, error: r.error ? r.error.slice(0, 500) : null, updated_at: new Date().toISOString(),
        }).eq("id", j.id).eq("user_id", uid);
      }
      return { id: j.id, status: r.status, result_url: r.resultUrl ?? null, error: r.error ?? null };
    }));
    return json({ jobs: out });
  } catch (e) {
    console.error("genjutsu-status:", e instanceof Error ? e.message : "error");
    return json({ error: "Error inesperado." }, 500);
  }
});
