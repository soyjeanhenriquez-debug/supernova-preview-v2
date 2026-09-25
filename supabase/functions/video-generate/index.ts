// SUPERNOVA — Videos del personaje ("Vende sin mostrar tu cara") vía fal.ai (pago por uso).
//
// ESTADO: base lista, APAGADA. Responde { pronto: true } (503) mientras falte cualquiera de:
//   · el secreto FAL_KEY en Supabase → Edge Functions → Secrets,
//   · edge_limits.video-generate con enabled = true,
//   · el precio "gen_video" en credit_prices (lo aprueba Jean: costo real × 5).
// Así no se cobra ni se gasta nada antes de tiempo.
//
// Flujo (mismas reglas que las demás funciones de IA):
//   create → valida → compuerta + cobro ANTES de llamar a fal → encola en fal → guarda video_jobs.
//   status → consulta fal; si terminó guarda la URL; si falló REEMBOLSA el crédito.
// La foto del personaje vive en el bucket privado "personajes": aquí se firma una URL temporal
// solo si la ruta es de la carpeta del propio usuario.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const FAL_KEY = Deno.env.get("FAL_KEY");
// Modelo configurable sin redesplegar código (p. ej. Kling 3.0, Seedance). Imagen → video.
const MODEL = Deno.env.get("FAL_VIDEO_MODEL") ?? "fal-ai/kling-video/v2.1/standard/image-to-video";
const FN = "video-generate";

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, ...extra, "Content-Type": "application/json" } });

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

interface Gate { userId: string; txId: string | null; charged: number; balance: number | null }

async function userFrom(req: Request): Promise<string | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data } = await admin().auth.getUser(token);
  return data?.user?.id ?? null;
}

/** ¿Está encendida? (proveedor + interruptor + precio). Si no, nadie paga nada. */
async function ready(): Promise<boolean> {
  if (!FAL_KEY) return false;
  const db = admin();
  const [{ data: lim }, { data: price }] = await Promise.all([
    db.from("edge_limits").select("enabled").eq("fn", FN).maybeSingle(),
    db.from("credit_prices").select("cost").eq("action", "gen_video").maybeSingle(),
  ]);
  return lim?.enabled === true && Number(price?.cost) > 0;
}

async function charge(userId: string, label: string): Promise<Gate | Response> {
  const { data: g, error } = await admin().rpc("edge_guard_charge", {
    p_user_id: userId, p_fn: FN, p_max_hour: 10, p_max_day: 30,
    p_action: "gen_video", p_label: label.slice(0, 120), p_kind: null, p_receipt: null,
  });
  if (error) return json({ error: "No se pudo verificar el acceso. Intenta de nuevo." }, 503);
  if (g?.ok !== true) {
    switch (g?.reason) {
      case "rate_limited": return json({ error: "Alcanzaste el límite de videos por ahora. Intenta más tarde." }, 429);
      case "insufficient_credits": return json({ error: "No tienes créditos suficientes para este video.", code: "insufficient_credits", balance: g.balance, cost: g.cost }, 402);
      case "disabled": return json({ error: "Los videos llegan pronto.", pronto: true }, 503);
      default: return json({ error: "Tu cuenta no tiene acceso activo." }, 403);
    }
  }
  return { userId, txId: g.tx_id ?? null, charged: Number(g.charged) || 0, balance: typeof g.balance === "number" ? g.balance : null };
}

async function refund(txId: string | null, reason: string) {
  if (!txId) return;
  try { await admin().rpc("refund_charge", { p_tx_id: txId, p_reason: reason.slice(0, 200) }); }
  catch (e) { console.error("refund_charge:", e); }
}

async function fal(url: string, init: RequestInit = {}) {
  return fetch(url, { ...init, headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let txId: string | null = null;
  try {
    const userId = await userFrom(req);
    if (!userId) return json({ error: "Inicia sesión para usar esta función." }, 401);

    const raw = await req.text();
    if (raw.length > 6000) return json({ error: "La solicitud es demasiado grande." }, 413);
    const body = raw ? JSON.parse(raw) : {};
    const action = body.action === "status" ? "status" : "create";

    if (action === "status") {
      const jobId = typeof body.job_id === "string" && /^[0-9a-f-]{36}$/i.test(body.job_id) ? body.job_id : null;
      if (!jobId) return json({ error: "job_id inválido" }, 400);
      const db = admin();
      const { data: job } = await db.from("video_jobs").select("*").eq("id", jobId).eq("user_id", userId).maybeSingle();
      if (!job) return json({ error: "Video no encontrado." }, 404);
      if (job.status === "done" || job.status === "failed" || !FAL_KEY || !job.provider_request_id) return json({ job });
      const base = `https://queue.fal.run/${job.model}/requests/${job.provider_request_id}`;
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
      // Un fallo de red al consultar NO es un video fallido: se vuelve a preguntar después.
      if (s?.status === "FAILED" || s?.status === "COMPLETED") {
        // Terminó sin video o falló: se devuelve el crédito una sola vez (refund_charge es idempotente).
        await refund(job.credit_tx_id, "video falló");
        await db.from("video_jobs").update({ status: "failed", error: "El proveedor no entregó el video.", updated_at: new Date().toISOString() }).eq("id", jobId);
        return json({ job: { ...job, status: "failed" }, error: "El video falló. No se te cobró." });
      }
      return json({ job: { ...job, status: "running" } });
    }

    // create: primero validar, después ver si está encendida, después cobrar, después gastar.
    const prompt = String(body.prompt ?? "").trim().slice(0, 1800);
    const seconds = [5, 10].includes(Number(body.seconds)) ? Number(body.seconds) : 5;
    const imagePath = typeof body.image_path === "string" ? body.image_path : "";
    if (!prompt) return json({ error: "Escribe qué pasa en el video." }, 400);
    if (!imagePath.startsWith(`${userId}/`) || imagePath.includes("..")) return json({ error: "Foto del personaje inválida." }, 400);

    if (!(await ready())) return json({ error: "Los videos con tu personaje llegan pronto.", pronto: true }, 503);

    const g = await charge(userId, `Video · ${prompt.slice(0, 60)}`);
    if (g instanceof Response) return g;
    txId = g.txId;

    const db = admin();
    const { data: signed } = await db.storage.from("personajes").createSignedUrl(imagePath, 60 * 30);
    if (!signed?.signedUrl) { await refund(txId, "sin foto"); return json({ error: "No encontramos la foto del personaje. No se te cobró." }, 400); }

    const q = await fal(`https://queue.fal.run/${MODEL}`, {
      method: "POST",
      body: JSON.stringify({ prompt, image_url: signed.signedUrl, duration: String(seconds), aspect_ratio: "9:16" }),
    });
    if (!q.ok) {
      console.error("fal:", q.status, (await q.text()).slice(0, 300));
      await refund(txId, `fal ${q.status}`);
      return json({ error: "El generador de video no está disponible ahora. No se te cobró." }, 503);
    }
    const queued = await q.json();
    const { data: job, error } = await db.from("video_jobs").insert({
      user_id: userId, product_id: typeof body.product_id === "string" ? body.product_id : null,
      provider: "fal", model: MODEL, prompt, seconds, status: "running",
      provider_request_id: queued?.request_id ?? null, credit_tx_id: txId, credits_charged: g.charged,
    }).select("*").single();
    if (error) { await refund(txId, "sin registro"); return json({ error: "No se pudo registrar el video. No se te cobró." }, 500); }
    return json({ job, billing: { charged: g.charged, balance: g.balance } }, 200, {
      "Access-Control-Expose-Headers": "x-credits-charged, x-credits-balance",
      "x-credits-charged": String(g.charged), ...(g.balance !== null ? { "x-credits-balance": String(g.balance) } : {}),
    });
  } catch (e) {
    await refund(txId, "excepción");
    console.error("video-generate:", e);
    return json({ error: "No se pudo crear el video. No se te cobró." }, 500);
  }
});
