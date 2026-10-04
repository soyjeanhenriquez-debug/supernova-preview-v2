// SUPERNOVA — Estudio de video (03-oct-2026): clips y series con APIMart (Seedance 2.0 Mini, 720p).
//
// create → usuario real → cobro en el servidor (vid_mini_5 / vid_mini_10 de credit_prices) ANTES de
//          gastar → tarea en APIMart → video_jobs. La imagen inicial solo puede salir de la carpeta del
//          propio usuario (creativos/personajes) o del último cuadro de un clip suyo (series).
// status → consulta APIMart; terminado: guarda la URL del video y la del último cuadro (caducan en
//          24 h: el usuario lo descarga); fallido: reembolsa.
// Reglas del manual en cada clip: nada sexual, sin marcas ni famosos, sin dinero ni promesas.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const FN = "video-studio";
const APIMART = "https://api.apimart.ai/v1";
const MODEL = "seedance-2.0-mini";
const COST_PER_SEC = 0.0217; // US$ (720p, lista de APIMart del 03-oct-2026)
const RULES = "Sin contenido sexual ni violento. Sin logotipos, marcas, personajes con derechos ni personas famosas reales. Sin dinero, billetes ni cifras de ingresos.";
const SIZES = new Set(["9:16", "16:9", "1:1"]);

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, ...extra, "Content-Type": "application/json" } });

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function userId(req: Request): Promise<string | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data } = await admin().auth.getUser(token);
  return data?.user?.id ?? null;
}

type Gate = { txId: string | null; charged: number; balance: number | null };

async function charge(uid: string, action: string, label: string): Promise<Gate | Response> {
  const { data: g, error } = await admin().rpc("edge_guard_charge", {
    p_user_id: uid, p_fn: FN, p_max_hour: 20, p_max_day: 60,
    p_action: action, p_label: label.slice(0, 120), p_kind: null, p_receipt: null,
  });
  if (error) return json({ error: "No se pudo verificar el acceso. Intenta de nuevo." }, 503);
  if (g?.ok !== true) {
    switch (g?.reason) {
      case "rate_limited": return json({ error: "Alcanzaste el límite de videos por ahora. Intenta más tarde." }, 429);
      case "insufficient_credits": return json({ error: "No tienes créditos suficientes.", code: "insufficient_credits", balance: g.balance, cost: g.cost }, 402);
      case "disabled": return json({ error: "Los videos no están disponibles por ahora." }, 503);
      case "unknown_action": return json({ error: "Video sin precio configurado." }, 500);
      default: return json({ error: "Tu cuenta no tiene acceso activo." }, 403);
    }
  }
  return { txId: g.tx_id ?? null, charged: Number(g.charged) || 0, balance: typeof g.balance === "number" ? g.balance : null };
}

async function refund(txId: string | null, reason: string) {
  if (!txId) return;
  try { await admin().rpc("refund_charge", { p_tx_id: txId, p_reason: reason.slice(0, 200) }); }
  catch (e) { console.error("refund_charge:", e); }
}

const billingHeaders = (g: Gate): Record<string, string> => ({
  "Access-Control-Expose-Headers": "x-credits-charged, x-credits-balance",
  "x-credits-charged": String(g.charged),
  ...(g.balance !== null ? { "x-credits-balance": String(g.balance) } : {}),
});

function apimart(path: string, init: RequestInit = {}) {
  return fetch(`${APIMART}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${Deno.env.get("APIMART_API_KEY") ?? ""}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

/** Busca en la respuesta de la tarea la URL del video y la del último cuadro (la forma varía por modelo). */
function pickUrls(result: unknown): { video: string | null; frame: string | null } {
  const urls: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") { if (/^https:\/\//.test(v)) urls.push(v); return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === "object") Object.values(v as Record<string, unknown>).forEach(walk);
  };
  walk(result);
  const isVideo = (u: string) => /\.(mp4|mov|webm)(\?|$)/i.test(u) || /video/i.test(u);
  const isImage = (u: string) => /\.(png|jpe?g|webp)(\?|$)/i.test(u);
  const video = urls.find(isVideo) ?? null;
  const frame = urls.find(u => u !== video && isImage(u)) ?? null;
  return { video, frame };
}

/** Imagen inicial: de la carpeta del usuario o del último cuadro de un clip suyo. Nunca una URL del cliente. */
async function startImage(uid: string, body: Record<string, unknown>): Promise<string | null | undefined> {
  const db = admin();
  if (typeof body.from_job_id === "string" && /^[0-9a-f-]{36}$/i.test(body.from_job_id)) {
    const { data } = await db.from("video_jobs").select("last_frame_url").eq("id", body.from_job_id).eq("user_id", uid).maybeSingle();
    return data?.last_frame_url ?? undefined; // undefined = pidió continuidad y no hay cuadro
  }
  if (typeof body.image_path === "string") {
    const bucket = body.image_bucket === "personajes" ? "personajes" : "creativos";
    const p = body.image_path;
    if (!p.startsWith(`${uid}/`) || p.includes("..")) return undefined;
    const { data } = await db.storage.from(bucket).createSignedUrl(p, 60 * 60);
    return data?.signedUrl ?? undefined;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let txId: string | null = null;
  try {
    const uid = await userId(req);
    if (!uid) return json({ error: "Inicia sesión para usar esta función." }, 401);
    if (!Deno.env.get("APIMART_API_KEY")) return json({ error: "Los videos llegan pronto.", pronto: true }, 503);

    const raw = await req.text();
    if (raw.length > 6000) return json({ error: "La solicitud es demasiado grande." }, 413);
    const body = raw ? JSON.parse(raw) : {};
    const db = admin();

    // ---------- status ----------
    if (body.action === "status") {
      const jobId = typeof body.job_id === "string" && /^[0-9a-f-]{36}$/i.test(body.job_id) ? body.job_id : null;
      if (!jobId) return json({ error: "job_id inválido" }, 400);
      const { data: job } = await db.from("video_jobs").select("*").eq("id", jobId).eq("user_id", uid).maybeSingle();
      if (!job) return json({ error: "Video no encontrado." }, 404);
      if (job.status === "done" || job.status === "failed" || !job.provider_request_id) return json({ job });
      const r = await apimart(`/tasks/${encodeURIComponent(job.provider_request_id)}?language=es`);
      if (!r.ok) return json({ job: { ...job, status: "running" } }); // fallo de red: se vuelve a preguntar
      const d = (await r.json())?.data;
      if (d?.status === "completed") {
        const { video, frame } = pickUrls(d?.result);
        if (video) {
          const patch = { status: "done", result_url: video, last_frame_url: frame, updated_at: new Date().toISOString() };
          await db.from("video_jobs").update(patch).eq("id", jobId);
          return json({ job: { ...job, ...patch } });
        }
      }
      if (d?.status === "failed" || d?.status === "cancelled" || d?.status === "completed") {
        await refund(job.credit_tx_id, "video falló");
        const patch = { status: "failed", error: "El generador no entregó el video.", updated_at: new Date().toISOString() };
        await db.from("video_jobs").update(patch).eq("id", jobId);
        return json({ job: { ...job, ...patch }, error: "El video falló. Te devolvimos los créditos." });
      }
      return json({ job: { ...job, status: "running" }, progress: typeof d?.progress === "number" ? d.progress : null });
    }

    // ---------- create ----------
    const prompt = String(body.prompt ?? "").trim().slice(0, 1500);
    if (prompt.length < 5) return json({ error: "Describe qué pasa en el video." }, 400);
    const seconds = body.seconds === 10 ? 10 : 5;
    const size = SIZES.has(body.size) ? body.size : "9:16";
    const image = await startImage(uid, body);
    if (image === undefined) return json({ error: "No encontramos la imagen inicial. Elige otra." }, 400);

    const g = await charge(uid, seconds === 10 ? "vid_mini_10" : "vid_mini_5", `Video IA ${seconds} s · ${prompt.slice(0, 50)}`);
    if (g instanceof Response) return g;
    txId = g.txId;

    const q = await apimart("/videos/generations", {
      method: "POST",
      body: JSON.stringify({
        model: MODEL, prompt: `${prompt}\n\n${RULES}`, duration: seconds, size, resolution: "720p",
        generate_audio: body.audio !== false, return_last_frame: true, nsfw_check: true,
        ...(image ? { image_urls: [image] } : {}),
      }),
    });
    if (!q.ok) {
      console.error("apimart video:", q.status, (await q.text()).slice(0, 300));
      await refund(txId, `apimart ${q.status}`);
      return json({ error: q.status === 400 ? "El generador rechazó la descripción o la imagen. Te devolvimos los créditos." : "El generador de video no está disponible ahora. Te devolvimos los créditos." }, 503);
    }
    const created = await q.json();
    const taskId = created?.data?.[0]?.task_id ?? created?.data?.task_id;
    if (!taskId) { await refund(txId, "sin task_id"); return json({ error: "No se pudo crear el video. Te devolvimos los créditos." }, 502); }

    const { error: costErr } = await db.from("ai_usage").insert({ user_id: uid, fn: FN, model: `apimart:${MODEL}`, images: 0, cost_usd: seconds * COST_PER_SEC });
    if (costErr) console.error("ai_usage:", costErr.message);
    const { data: job, error } = await db.from("video_jobs").insert({
      user_id: uid, product_id: typeof body.product_id === "string" && /^[0-9a-f-]{36}$/i.test(body.product_id) ? body.product_id : null,
      provider: "apimart", model: MODEL, prompt: prompt.slice(0, 2000), seconds, status: "running",
      provider_request_id: taskId, credit_tx_id: txId, credits_charged: g.charged,
    }).select("*").single();
    if (error) { await refund(txId, "sin registro"); return json({ error: "No se pudo registrar el video. Te devolvimos los créditos." }, 500); }
    return json({ job, billing: { charged: g.charged, balance: g.balance } }, 200, billingHeaders(g));
  } catch (e) {
    await refund(txId, "excepción");
    console.error("video-studio:", e);
    return json({ error: "No se pudo crear el video. No se te cobró." }, 500);
  }
});
