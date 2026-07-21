// SUPERNOVA — Media Studio: genera un video con avatar IA (HeyGen) a partir
// de un guion corto (hook de 45-60s, el formato que un media buyer testea a
// diario — NO el VSL completo, que cuesta 5-7x más en la API de HeyGen).
//
// Flujo:
//  1. Resuelve el usuario real desde el JWT (nunca confiar en un user_id que
//     mande el cliente — aquí hay dinero real de por medio).
//  2. Descuenta Media Credits vía consume_media_credits() ANTES de gastar
//     nada en HeyGen. Si no hay saldo, no se llama a la API externa.
//  3. Si no hay HEYGEN_API_KEY configurada, corre en modo simulado (dry_run):
//     se descuenta el saldo igual (para poder probar el flujo completo) pero
//     no se gasta dinero real ni se llama a HeyGen.
//  4. Crea el job en media_generation_jobs y dispara la generación async en
//     HeyGen con callback_url → heygen-webhook actualiza el resultado.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const COST_MEDIA_CREDITS = 10; // ≈ 1 min de video (~$1 USD de costo real en HeyGen)
const MAX_WORDS = 160; // ≈ 45-60s hablado — límite duro server-side, no confiar en el cliente

interface Body {
  script: string;
  avatar_id: string;
  voice_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    // 1) Resolver el usuario real desde su JWT (no desde el body)
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "No autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    const script = (body.script ?? "").trim();
    const avatarId = (body.avatar_id ?? "").trim();
    const voiceId = (body.voice_id ?? "").trim();

    if (!script) {
      return new Response(JSON.stringify({ error: "Guion requerido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const wordCount = script.split(/\s+/).filter(Boolean).length;
    if (wordCount > MAX_WORDS) {
      return new Response(
        JSON.stringify({ error: `El guion es muy largo (${wordCount} palabras, máx ${MAX_WORDS}). Media Studio genera hooks cortos, no el VSL completo.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!avatarId || !voiceId) {
      return new Response(JSON.stringify({ error: "Falta avatar_id o voice_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 2) Descontar Media Credits ANTES de gastar nada externo
    const { data: consumeResult, error: consumeErr } = await admin.rpc("consume_media_credits", {
      p_user_id: user.id, p_amount: COST_MEDIA_CREDITS, p_action: "video_hook",
    });
    if (consumeErr || !consumeResult?.success) {
      return new Response(JSON.stringify({ error: consumeResult?.error ?? "No se pudo descontar Media Credits", balance: consumeResult?.balance }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const heygenKey = Deno.env.get("HEYGEN_API_KEY");
    const dryRun = !heygenKey;

    // 3) Modo simulado: no se llama a HeyGen, el job queda "completed" sin video real
    if (dryRun) {
      const { data: job, error: insErr } = await admin.from("media_generation_jobs").insert({
        user_id: user.id, script, avatar_id: avatarId, voice_id: voiceId,
        status: "completed", cost_media_credits: COST_MEDIA_CREDITS, dry_run: true,
      }).select("id, status, dry_run").single();
      if (insErr) throw insErr;
      return new Response(JSON.stringify({ ...job, balance: consumeResult.balance, dry_run: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4) Crear el job y disparar la generación real en HeyGen
    const { data: job, error: insErr } = await admin.from("media_generation_jobs").insert({
      user_id: user.id, script, avatar_id: avatarId, voice_id: voiceId,
      status: "pending", cost_media_credits: COST_MEDIA_CREDITS, dry_run: false,
    }).select("id").single();
    if (insErr) throw insErr;

    const heygenResp = await fetch("https://api.heygen.com/v2/video/generate", {
      method: "POST",
      headers: { "X-Api-Key": heygenKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        video_inputs: [{
          character: { type: "avatar", avatar_id: avatarId, avatar_style: "normal" },
          voice: { type: "text", input_text: script, voice_id: voiceId },
        }],
        dimension: { width: 720, height: 1280 }, // vertical 9:16 — formato Reels/TikTok/Stories
        callback_url: `${SUPABASE_URL}/functions/v1/heygen-webhook`,
      }),
    });
    const heygenData = await heygenResp.json().catch(() => ({}));

    if (!heygenResp.ok) {
      const detail = JSON.stringify(heygenData).slice(0, 500);
      await admin.from("media_generation_jobs").update({ status: "failed", error: detail, updated_at: new Date().toISOString() }).eq("id", job.id);
      // Nota: los Media Credits ya se descontaron. No se reembolsan automáticamente
      // aquí porque HeyGen puede fallar por un dato inválido (avatar/voz) recuperable
      // por el usuario reintentando; un reembolso manual vía admin queda disponible
      // con grant_media_credits() si el caso lo amerita.
      return new Response(JSON.stringify({ error: "Error creando el video en HeyGen", detail, job_id: job.id }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const heygenVideoId = heygenData?.data?.video_id ?? heygenData?.video_id ?? null;
    await admin.from("media_generation_jobs")
      .update({ status: "processing", heygen_video_id: heygenVideoId, updated_at: new Date().toISOString() })
      .eq("id", job.id);

    return new Response(JSON.stringify({ id: job.id, status: "processing", balance: consumeResult.balance, dry_run: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
