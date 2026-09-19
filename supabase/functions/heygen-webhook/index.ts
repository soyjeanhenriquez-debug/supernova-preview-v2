// SUPERNOVA — Media Studio: aviso de HeyGen cuando un video termina (o falla).
//
// El aviso por `callback_url` no viene firmado, así que su CONTENIDO no se usa:
// solo sirve de timbre. Con el video_id se busca un job que NOSOTROS creamos y se
// pregunta el estado REAL a HeyGen (GET /v3/videos/{id}) con nuestra llave — el
// mismo patrón que stripe-webhook. Un aviso falso, en el peor caso, provoca una
// consulta de más: no puede completar un job con un enlace ajeno ni disparar un
// reembolso de un video que en realidad sí se generó.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const HEYGEN_API = "https://api.heygen.com";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// La URL del video se muestra en la app: solo https y de un dominio de HeyGen.
function safeHeygenUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 2000) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && /(^|\.)heygen\.(ai|com)$/i.test(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  // Tolerante a variaciones de forma del aviso (v2 y v3 usan event_data.video_id).
  const eventData = (payload?.event_data ?? payload?.data ?? payload ?? {}) as Record<string, unknown>;
  const videoId = (eventData?.video_id ?? payload?.video_id) as unknown;
  if (typeof videoId !== "string" || !/^[A-Za-z0-9_-]{4,100}$/.test(videoId)) {
    return json(200, { ok: true, skipped: "no video_id" });
  }

  const { data: job } = await admin.from("media_generation_jobs")
    .select("id, status").eq("heygen_video_id", videoId).maybeSingle();
  if (!job) return json(200, { ok: true, skipped: "job desconocido" });
  // Estado final: nada que hacer (tampoco se gasta una consulta a HeyGen).
  if (job.status === "completed" || job.status === "failed") {
    return json(200, { ok: true, video_id: videoId, status: job.status, skipped: "sin cambios" });
  }

  const key = Deno.env.get("HEYGEN_API_KEY");
  if (!key) return json(200, { ok: true, skipped: "sin llave de HeyGen: no se puede verificar" });

  // Estado real según HeyGen
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  let v: Record<string, unknown> = {};
  try {
    const r = await fetch(`${HEYGEN_API}/v3/videos/${encodeURIComponent(videoId)}`, {
      headers: { "x-api-key": key, Accept: "application/json" }, signal: ctrl.signal,
    });
    if (!r.ok) {
      console.error("heygen-webhook: no se pudo verificar el video", r.status);
      // 5xx → HeyGen reintenta el aviso; el cliente además re-sincroniza por su cuenta.
      return json(502, { error: "No se pudo verificar el video" });
    }
    v = ((await r.json().catch(() => ({})))?.data ?? {}) as Record<string, unknown>;
  } catch (e) {
    console.error("heygen-webhook: HeyGen no respondió:", e instanceof Error ? e.name : e);
    return json(504, { error: "HeyGen no respondió" });
  } finally {
    clearTimeout(timer);
  }

  const now = new Date().toISOString();
  const url = safeHeygenUrl(v.video_url);

  if (v.status === "completed" && url) {
    const { error } = await admin.from("media_generation_jobs")
      .update({ status: "completed", video_url: url, error: null, updated_at: now })
      .eq("id", job.id).in("status", ["pending", "processing"]);
    if (error) { console.error("heygen-webhook: error actualizando job:", error.message); return json(500, { error: "DB error" }); }
    return json(200, { ok: true, video_id: videoId, status: "completed" });
  }

  if (v.status === "failed") {
    const reason = String(v.failure_message ?? v.failure_code ?? "HeyGen no pudo generar el video").slice(0, 500);
    const { data: moved, error } = await admin.from("media_generation_jobs")
      .update({ status: "failed", error: reason, updated_at: now })
      .eq("id", job.id).in("status", ["pending", "processing"]).select("id");
    if (error) { console.error("heygen-webhook: error actualizando job:", error.message); return json(500, { error: "DB error" }); }
    // El video no existe: se devuelven los Media Credits (una sola vez, en la base).
    if (moved?.length) await admin.rpc("refund_media_job", { p_job_id: job.id, p_reason: "HeyGen no pudo generar el video" });
    return json(200, { ok: true, video_id: videoId, status: "failed", refunded: !!moved?.length });
  }

  return json(200, { ok: true, video_id: videoId, status: "processing", skipped: "aún en proceso" });
});
