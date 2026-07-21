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
  const videoUrl = (eventData.url ?? eventData.video_url ?? null) as string | null;

  if (!videoId) {
    return new Response(JSON.stringify({ ok: true, skipped: "no video_id" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const failed = eventType.includes("fail") || explicitStatus === "failed";
  const status = failed ? "failed" : (videoUrl ? "completed" : "processing");

  const { error } = await admin.from("media_generation_jobs")
    .update({
      status,
      video_url: videoUrl,
      error: failed ? JSON.stringify(eventData).slice(0, 500) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("heygen_video_id", videoId);

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
