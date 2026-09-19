// SUPERNOVA — Media Studio: callback de HeyGen cuando un video termina (o falla).
//
// HeyGen no documenta un secreto de firma para verificar este webhook (a
// diferencia de Whop). La validación real ocurre por diseño: solo se acepta
// un evento si su video_id coincide con un job que NOSOTROS creamos y para
// el cual YA cobramos los Media Credits en heygen-generate-video — un evento
// falso en el peor caso corrompe el status/url de un job ya pagado, nunca
// permite gastar ni robar créditos (eso ya ocurrió antes, en la creación).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Tolerante a variaciones de forma del payload de HeyGen.
  const eventData = (payload.event_data ?? payload.data ?? payload) as Record<string, unknown>;
  const videoId = (eventData.video_id ?? payload.video_id) as string | undefined;
  const eventType = String(payload.event_type ?? "");
  const explicitStatus = String(eventData.status ?? "");
  const rawVideoUrl = eventData.url ?? eventData.video_url ?? null;

  if (!videoId || typeof videoId !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(videoId)) {
    return new Response(JSON.stringify({ ok: true, skipped: "no video_id" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // El webhook no viene firmado: la URL del video se muestra en la app, así que
  // solo se acepta si es https y de un dominio de HeyGen. Cualquier otra cosa
  // (un enlace puesto por un tercero que conozca el video_id) se descarta.
  let videoUrl: string | null = null;
  if (typeof rawVideoUrl === "string" && rawVideoUrl.length <= 2000) {
    try {
      const u = new URL(rawVideoUrl);
      if (u.protocol === "https:" && /(^|\.)heygen\.(ai|com)$/i.test(u.hostname)) videoUrl = u.toString();
      else console.error("heygen-webhook: URL de video rechazada (dominio no permitido):", u.hostname);
    } catch { /* URL inválida → se ignora */ }
  }

  const failed = eventType.includes("fail") || explicitStatus === "failed";
  const status = failed ? "failed" : (videoUrl ? "completed" : "processing");

  // Solo se avanza, nunca se retrocede: un evento sin URL no borra un video ya
  // terminado, y un "failed" tardío (o falso) no pisa un job completado.
  if (status === "processing") {
    return new Response(JSON.stringify({ ok: true, video_id: videoId, status, skipped: "sin cambios" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  let update = admin.from("media_generation_jobs")
    .update({
      status,
      video_url: videoUrl,
      error: failed ? JSON.stringify(eventData).slice(0, 500) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("heygen_video_id", videoId);
  if (failed) update = update.neq("status", "completed");
  const { error } = await update;

  if (error) {
    console.error("Error actualizando job:", error);
    return new Response(JSON.stringify({ error: "DB error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, video_id: videoId, status }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
