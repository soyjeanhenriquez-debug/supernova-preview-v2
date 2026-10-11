// SUPERNOVA — Avatar que habla (11-oct-2026). Influencer IA: el guion se vuelve voz y la foto del
// personaje + esa voz se vuelven un video con la boca sincronizada.
//   1) Voz: APIMart gpt-4o-mini-tts (español, voz según el estilo elegido).
//   2) Video: fal.ai Kling AI Avatar v2 Standard (image_url + audio_url), cola de fal.
// Cobro en el servidor ANTES de gastar (edge_guard_charge, tramo por duración: avatar_talk_15/30/45)
// y devolución automática si algo falla. Compuerta: usuario real con acceso. Mientras edge_limits
// 'avatar-talk:open' esté en false, solo admins (hasta que Jean apruebe los precios).
// Acciones: { action: "config" } · { action: "create", script, image_path, genero, voz, product_id? }
//           · { action: "status", job_id }
import { admin, billingHeaders, caller, charge, fal, FAL_KEY, json, refund, signedPhoto } from "../_shared/media.ts";
import { apimartSpeech } from "../_shared/apimart.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2.117.1/cors";

const FN = "avatar-talk";
const ENDPOINT = "fal-ai/kling-video/ai-avatar/v2/standard";
const COST_PER_SECOND = 0.0562; // fal, Kling AI Avatar v2 Standard
const WORDS_PER_SECOND = 2.5;   // español hablado natural

// Voces de gpt-4o-mini-tts según el estilo de src/lib/influencers.ts (VOICES) y el género del personaje.
const VOICE: Record<string, Record<"mujer" | "hombre", string>> = {
  calida: { mujer: "shimmer", hombre: "echo" },
  alegre: { mujer: "nova", hombre: "fable" },
  serena: { mujer: "shimmer", hombre: "onyx" },
};
const TONE: Record<string, string> = {
  calida: "cálida y cercana, de confianza, ritmo natural",
  alegre: "alegre y con energía, sonriendo, ritmo ágil",
  serena: "serena y segura, pausada y clara",
};

// Lo mismo que hasForbiddenClaim (src/lib/videoTemplates.ts): testimonios, resultados y dinero o plazos.
const wb = (src: string) => new RegExp(`(?<![\\p{L}\\d])(?:${src})(?![\\p{L}])`, "iu");
const FORBIDDEN = [
  wb("me\\s+(?:funcion[oó]|sirvi[oó]|cambi[oó])"), wb("compré|lo\\s+compre"), wb("gané"),
  wb("(?:baj[eé]|perd[ií]|sub[ií])\\s+\\d"), wb("yo\\s+(?:logr[eé]|consegu[ií])"), wb("cambi[oó]\\s+mi\\s+vida"),
  wb("mis?\\s+resultados?"), wb("testimonios?"), wb("lo\\s+(?:prob[eé]|uso|us[eé])"), wb("yo\\s+(?:lo\\s+)?(?:uso|prob[eé])"),
  /(us\$|\$|usd|€)\s*\d/iu, wb("\\d[\\d.,]*\\s*(?:d[oó]lares|pesos|usd|euros|soles|mil)"),
  wb("gana(?:r|s|rás)?\\s+(?:dinero|plata|\\d)"), wb("en\\s+\\d+\\s+(?:d[ií]as|semanas|horas)"),
  wb("ingresos?\\s+(?:extra|pasivos?|garantizados?)"),
];

const tierFor = (seconds: number) => (seconds <= 15 ? 15 : seconds <= 30 ? 30 : seconds <= 45 ? 45 : 0);

async function isOpen(isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  const { data } = await admin().from("edge_limits").select("enabled").eq("fn", "avatar-talk:open").maybeSingle();
  return !data || data.enabled === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let txId: string | null = null;
  try {
    const who = await caller(req);
    if (!who) return json({ error: "Inicia sesión para usar esta función." }, 401);
    const raw = await req.text();
    if (raw.length > 8000) return json({ error: "La solicitud es demasiado grande." }, 413);
    const body = raw ? JSON.parse(raw) : {};
    const db = admin();

    if (body.action === "config") {
      return json({ open: (await isOpen(who.isAdmin)) && !!FAL_KEY && !!Deno.env.get("APIMART_API_KEY"), prices: { 15: 530, 30: 1060, 45: 1590 } });
    }

    if (body.action === "status") {
      const jobId = typeof body.job_id === "string" && /^[0-9a-f-]{36}$/i.test(body.job_id) ? body.job_id : null;
      if (!jobId) return json({ error: "job_id inválido" }, 400);
      const { data: job } = await db.from("video_jobs").select("*").eq("id", jobId).eq("user_id", who.id).maybeSingle();
      if (!job) return json({ error: "Video no encontrado." }, 404);
      if (job.status === "done" || job.status === "failed" || !job.provider_request_id) return json({ job });
      const base = `https://queue.fal.run/fal-ai/kling-video/requests/${job.provider_request_id}`;
      const st = await fal(`${base}/status`);
      const s = st.ok ? await st.json() : null;
      if (s?.status === "COMPLETED") {
        const r = await fal(base);
        const out = r.ok ? await r.json() : null;
        const url = out?.video?.url as string | undefined;
        if (url) {
          await db.from("video_jobs").update({ status: "done", result_url: url, updated_at: new Date().toISOString() }).eq("id", jobId);
          return json({ job: { ...job, status: "done", result_url: url } });
        }
      }
      if (s?.status === "FAILED" || s?.status === "COMPLETED") {
        await refund(job.credit_tx_id, "avatar falló");
        await db.from("video_jobs").update({ status: "failed", error: "El proveedor no entregó el video.", updated_at: new Date().toISOString() }).eq("id", jobId);
        return json({ job: { ...job, status: "failed" }, error: "El video falló. Te devolvimos los créditos." });
      }
      const pos = typeof s?.queue_position === "number" ? s.queue_position : null;
      return json({ job: { ...job, status: "running" }, queue_position: pos });
    }

    // create
    if (!(await isOpen(who.isAdmin))) return json({ error: "El avatar que habla llega pronto.", pronto: true }, 503);
    if (!FAL_KEY || !Deno.env.get("APIMART_API_KEY")) return json({ error: "El avatar que habla no está disponible ahora.", pronto: true }, 503);
    const script = String(body.script ?? "").replace(/\s+/g, " ").trim();
    const words = script ? script.split(" ").length : 0;
    if (words < 4) return json({ error: "Escribe lo que va a decir tu avatar (al menos una frase)." }, 400);
    const seconds = Math.ceil(words / WORDS_PER_SECOND) + 1;
    const tier = tierFor(seconds);
    if (!tier || script.length > 900) return json({ error: "El guion es muy largo: máximo unos 45 segundos (≈ 110 palabras)." }, 400);
    if (FORBIDDEN.some(r => r.test(script))) {
      return json({ error: "El avatar no puede dar testimonios (\"lo uso\", \"me funcionó\") ni prometer dinero, resultados o plazos. Cambia esa frase." }, 400);
    }
    const photo = await signedPhoto(who.id, body.image_path);
    if (!photo) return json({ error: "Primero elige o crea la foto de tu avatar." }, 400);
    const genero: "mujer" | "hombre" = body.genero === "hombre" ? "hombre" : "mujer";
    const voz = typeof body.voz === "string" && VOICE[body.voz] ? body.voz : "calida";

    const g = await charge(FN, who.id, `avatar_talk_${tier}`, `Avatar que habla · ${script.slice(0, 50)}`, 6, 20);
    if (g instanceof Response) return g;
    txId = g.txId;

    // 1) Voz
    const speech = await apimartSpeech({
      input: script, voice: VOICE[voz][genero], format: "mp3", speed: 1,
      instructions: `Habla en español latinoamericano neutro, voz ${TONE[voz]}, natural, como un video de redes.`,
    });
    if (!speech) { await refund(txId, "voz falló"); return json({ error: "No pudimos crear la voz. Te devolvimos los créditos." }, 502); }
    const ext = speech.mime.includes("wav") ? "wav" : "mp3";
    const audioPath = `${who.id}/${crypto.randomUUID()}.${ext}`;
    const up = await db.storage.from("avatar-audio").upload(audioPath, speech.bytes, { contentType: ext === "wav" ? "audio/wav" : "audio/mpeg" });
    if (up.error) { await refund(txId, "audio sin guardar"); return json({ error: "No pudimos guardar la voz. Te devolvimos los créditos." }, 500); }
    const { data: signed } = await db.storage.from("avatar-audio").createSignedUrl(audioPath, 60 * 60);
    if (!signed?.signedUrl) { await refund(txId, "audio sin firma"); return json({ error: "No pudimos preparar la voz. Te devolvimos los créditos." }, 500); }

    // 2) Video
    const q = await fal(`https://queue.fal.run/${ENDPOINT}`, {
      method: "POST",
      body: JSON.stringify({ image_url: photo, audio_url: signed.signedUrl, prompt: "Persona hablando a cámara con naturalidad, gestos suaves, estilo video de redes." }),
    });
    if (!q.ok) {
      console.error(`${FN}: fal`, q.status, (await q.text()).slice(0, 300));
      await refund(txId, `fal ${q.status}`);
      return json({ error: q.status === 422 ? "El generador rechazó la foto o la voz. Te devolvimos los créditos." : "El generador de video no está disponible ahora. Te devolvimos los créditos." }, 503);
    }
    const queued = await q.json();
    const { error: costErr } = await db.from("ai_usage").insert({ user_id: who.id, fn: FN, model: `fal:${ENDPOINT}`, images: 0, cost_usd: Math.round(seconds * COST_PER_SECOND * 1000) / 1000 + 0.01 });
    if (costErr) console.error("ai_usage:", costErr.message);
    const { data: job, error } = await db.from("video_jobs").insert({
      user_id: who.id, product_id: typeof body.product_id === "string" && /^[0-9a-f-]{36}$/i.test(body.product_id) ? body.product_id : null,
      provider: "fal", model: ENDPOINT, prompt: script.slice(0, 1800), seconds, status: "running", kind: "ugc",
      provider_request_id: queued?.request_id ?? null, credit_tx_id: txId, credits_charged: g.charged,
    }).select("*").single();
    if (error) { await refund(txId, "sin registro"); return json({ error: "No se pudo registrar el video. Te devolvimos los créditos." }, 500); }
    return json({ job, seconds, billing: { charged: g.charged, balance: g.balance } }, 200, billingHeaders(g));
  } catch (e) {
    await refund(txId, "excepción");
    console.error(`${FN}:`, e);
    return json({ error: "No se pudo crear el video. No se te cobró." }, 500);
  }
});
