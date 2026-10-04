// SUPERNOVA — Estudio de video (03-oct-2026; anuncio, UGC y archivo el 04-oct-2026): APIMart, 720p.
//
// Qué modelo usa cada modo y cuánto cuesta (lista de APIMart, docs leídas el 04-oct-2026):
//   clip · serie · anuncio · ugc · yt_scene → seedance-2.0-mini, 720p, US$0,0217/s
//     5 s  = US$0,109 → vid_mini_5  = 55 créditos  (≈ 4× con el crédito a US$0,008)
//     10 s = US$0,217 → vid_mini_10 = 110 créditos (≈ 4×)
//   - anuncio: 3 tomas de 5 s encadenadas por el último cuadro (from_job_id), como la serie = 165.
//   - ugc: 1 toma de 10 s; la persona habla con el diálogo entre comillas y generate_audio (la doc de
//     Seedance 2.0 lo muestra así, caso 6; mini tiene "las mismas funciones que la estándar").
//     Que los labios queden sincronizados en español NO se pudo probar sin la llave: queda tras el
//     interruptor de admin `edge_limits.fn = 'video-studio:ugc'` (enabled=false → solo admins).
//   - yt_scene: escena animada del video largo de YouTube (ECO), sin audio (la voz va aparte).
//   No se usan seedance-2.0 estándar, -face ni Kling v3 (audio=true): mini cubre todo hoy. Si UGC
//   necesitara otro modelo, se propone vid_ugc_5/10 con ceil(costo × 4,5 / 0,008) (ver migración).
//
// create → usuario real → cobro en el servidor (vid_mini_5 / vid_mini_10 de credit_prices) ANTES de
//          gastar → tarea en APIMart → video_jobs (kind, template). La imagen inicial solo puede salir
//          de la carpeta del propio usuario (creativos/personajes) o del último cuadro de un clip suyo.
// status → consulta APIMart; terminado: guarda la URL del video y la del último cuadro (caducan en
//          24 h: el usuario lo descarga); fallido: reembolsa.
// file   → (contrato para ECO) devuelve el MP4 de un trabajo PROPIO terminado, en streaming y con CORS,
//          para dibujarlo en un canvas sin "contaminarlo". Solo hosts de APIMart, tope 60 MB, gratis.
// config → gratis: si UGC está abierto para este usuario.
// Reglas del manual en cada clip: nada sexual, sin marcas ni famosos, sin dinero ni promesas; anuncio
// y UGC: nunca testimonio, habla en español latino, aviso de personaje IA.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const FN = "video-studio";
const APIMART = "https://api.apimart.ai/v1";
const MODEL = "seedance-2.0-mini";
const COST_PER_SEC = 0.0217; // US$ (720p, lista de APIMart del 03-oct-2026)
const RULES = "Sin contenido sexual ni violento. Sin logotipos, marcas, personajes con derechos ni personas famosas reales. Sin dinero, billetes ni cifras de ingresos.";
const AD_RULES = "No es un testimonio: la persona presenta o explica, nunca dice que compró, que le funcionó ni que obtuvo resultados. Si alguien habla, habla en español latino. Personaje creado con IA. Sin texto en pantalla.";
const SPEECH_RULE = "Si alguien habla, habla en español latino.";
const SIZES = new Set(["9:16", "16:9", "1:1"]);
const KINDS = new Set(["clip", "serie", "anuncio", "ugc", "yt_scene"]);
const TEMPLATES = new Set(["problema_solucion", "demostracion", "tres_razones", "mito_realidad", "pregunta_frecuente", "nadie_te_dice", "novela", "dibujos", "short"]);
const UGC_SWITCH = "video-studio:ugc";
const FILE_MAX_BYTES = 60 * 1024 * 1024;
// Dominios desde los que APIMart entrega los videos. Se pueden añadir más sin redesplegar con el
// secreto APIMART_MEDIA_HOSTS ("cdn.ejemplo.com,otro.com"). Nunca se baja nada de otro host.
const MEDIA_HOSTS = ["apimart.ai"];
// Testimonio o resultados en el texto de un anuncio/UGC: se rechaza antes de cobrar.
const w = (src: string) => new RegExp(`(?<![\\p{L}\\d])(?:${src})(?![\\p{L}])`, "iu");
const TESTIMONIAL = [
  w("me\\s+(?:funcion[oó]|sirvi[oó]|cambi[oó])"), w("compré|lo\\s+compre"), w("gané"),
  w("(?:baj[eé]|perd[ií])\\s+\\d"), w("cambi[oó]\\s+mi\\s+vida"),
];

/** ¿El host está en la lista de APIMart (o en la extra del secreto)? Exacto o subdominio. */
export function hostAllowed(host: string, extra: string | undefined = Deno.env.get("APIMART_MEDIA_HOSTS")): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  const list = [...MEDIA_HOSTS, ...(extra ?? "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean)];
  return list.some(d => h === d || h.endsWith(`.${d}`));
}

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

/** Devuelve los créditos de un cobro (idempotente, vale 1 hora). true si quedaron devueltos. */
async function refund(txId: string | null, reason: string): Promise<boolean> {
  if (!txId) return false;
  try {
    const { data } = await admin().rpc("refund_charge", { p_tx_id: txId, p_reason: reason.slice(0, 200) });
    return data?.ok === true;
  } catch (e) { console.error("refund_charge:", e); return false; }
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

async function isAdmin(uid: string): Promise<boolean> {
  const { data } = await admin().from("user_roles").select("user_id").eq("user_id", uid).eq("role", "admin").maybeSingle();
  return !!data;
}

/** Interruptor de admin en edge_limits: sin fila = abierto; enabled=false = solo admins. */
async function switchOpen(uid: string, fn: string): Promise<boolean> {
  const { data, error } = await admin().from("edge_limits").select("enabled").eq("fn", fn).maybeSingle();
  if (error) { console.error("edge_limits:", error.message); return isAdmin(uid); } // sin poder leerlo: cerrado salvo admin
  if (!data || data.enabled) return true;
  return isAdmin(uid);
}

/** Limita un stream a `max` bytes: si se pasa, corta con error (el navegador ve la descarga fallida). */
function capStream(body: ReadableStream<Uint8Array>, max: number): ReadableStream<Uint8Array> {
  let seen = 0;
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctrl) {
      seen += chunk.byteLength;
      if (seen > max) { ctrl.error(new Error("archivo demasiado grande")); return; }
      ctrl.enqueue(chunk);
    },
  }));
}

/** Acción `file`: el MP4 de un trabajo propio y terminado, en streaming con CORS. Gratis. */
async function serveFile(uid: string, body: Record<string, unknown>): Promise<Response> {
  const jobId = typeof body.job_id === "string" && /^[0-9a-f-]{36}$/i.test(body.job_id) ? body.job_id : null;
  if (!jobId) return json({ error: "job_id inválido" }, 400);
  // Tope propio (sin cobro) para que nadie use la función como proxy de descargas.
  const { data: g, error: gErr } = await admin().rpc("edge_guard", { p_user_id: uid, p_fn: `${FN}:file`, p_max_hour: 120, p_max_day: 600 });
  if (gErr) return json({ error: "No se pudo verificar el acceso. Intenta de nuevo." }, 503);
  if (g?.ok !== true) return json({ error: g?.reason === "rate_limited" ? "Demasiadas descargas por ahora. Intenta más tarde." : "Tu cuenta no tiene acceso activo." }, g?.reason === "rate_limited" ? 429 : 403);

  // select("*"): si la migración de kind aún no está aplicada, no rompe la consulta.
  const { data: job } = await admin().from("video_jobs").select("*").eq("id", jobId).eq("user_id", uid).maybeSingle();
  if (!job) return json({ error: "Video no encontrado." }, 404);
  if (job.status !== "done" || !job.result_url) return json({ error: "El video todavía no está listo." }, 409);

  // El trabajo es propio y está "done", pero el MP4 no se puede entregar. Las escenas de "Producir
  // video" (yt_scene) SOLO llegan por aquí, así que se devuelven los créditos (refund_charge es
  // idempotente y vale 1 hora) y el trabajo pasa a "failed" para que no se pida otra vez. Los clips
  // normales ya se ven con su enlace en el estudio: ahí solo se avisa, sin reembolso.
  const undelivered = async (reason: string, msg: string, status: number): Promise<Response> => {
    if (job.kind !== "yt_scene") return json({ error: msg }, status);
    const back = await refund(job.credit_tx_id ?? null, `file no disponible: ${reason}`);
    await admin().from("video_jobs").update({ status: "failed", error: `No se pudo entregar el video (${reason}).`, updated_at: new Date().toISOString() }).eq("id", jobId);
    return json({
      error: back ? `${msg} Te devolvimos los créditos de esta escena.` : msg,
      refunded: back, code: "file_unavailable",
    }, status);
  };

  let url: URL;
  try { url = new URL(job.result_url); } catch { return await undelivered("enlace inválido", "Enlace de video inválido.", 422); }
  if (url.protocol !== "https:" || !hostAllowed(url.hostname)) {
    console.error("video-studio file: host fuera de la lista", url.hostname);
    return await undelivered("host no permitido", "Este video no se puede descargar desde aquí.", 403);
  }

  // Redirecciones a mano (máx. 3): cada salto tiene que seguir en un host de APIMart.
  let r: Response;
  try {
    r = await fetch(url, { redirect: "manual" });
    for (let hop = 0; r.status >= 300 && r.status < 400 && hop < 3; hop++) {
      const loc = r.headers.get("location");
      await r.body?.cancel();
      let next: URL;
      try { next = new URL(loc ?? "", url); } catch { return await undelivered("redirección inválida", "Enlace de video inválido.", 422); }
      if (next.protocol !== "https:" || !hostAllowed(next.hostname)) {
        console.error("video-studio file: redirección a host fuera de la lista", next.hostname);
        return await undelivered("host no permitido", "Este video no se puede descargar desde aquí.", 403);
      }
      url = next;
      r = await fetch(url, { redirect: "manual" });
    }
  } catch (e) {
    console.error("video-studio file: error al bajar", e);
    return await undelivered("error al bajar", "No se pudo bajar el video.", 502);
  }
  if (!r.ok || !r.body) { await r.body?.cancel(); return await undelivered("enlace vencido", "El enlace del video venció (dura 24 horas).", 410); }
  const len = Number(r.headers.get("content-length") ?? "");
  if (Number.isFinite(len) && len > FILE_MAX_BYTES) { await r.body.cancel(); return await undelivered("demasiado grande", "El video es demasiado grande.", 413); }
  const type = (r.headers.get("content-type") ?? "").toLowerCase();
  return new Response(capStream(r.body, FILE_MAX_BYTES), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Access-Control-Expose-Headers": "content-length, content-type",
      "Content-Type": type.startsWith("video/") ? type : "video/mp4",
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="supernova-${jobId.slice(0, 8)}.mp4"`,
      ...(Number.isFinite(len) && len > 0 ? { "Content-Length": String(len) } : {}),
    },
  });
}

/** Inserta el trabajo; si la base aún no tiene kind/template (migración sin aplicar), sin ellos. */
async function insertJob(row: Record<string, unknown>) {
  const db = admin();
  const first = await db.from("video_jobs").insert(row).select("*").single();
  if (!first.error || !/kind|template|column/i.test(first.error.message)) return first;
  console.warn("video_jobs sin kind/template todavía:", first.error.message);
  const { kind: _k, template: _t, ...rest } = row;
  return await db.from("video_jobs").insert(rest).select("*").single();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let txId: string | null = null;
  try {
    const uid = await userId(req);
    if (!uid) return json({ error: "Inicia sesión para usar esta función." }, 401);

    const raw = await req.text();
    if (raw.length > 6000) return json({ error: "La solicitud es demasiado grande." }, 413);
    let body: Record<string, unknown> = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { return json({ error: "Solicitud inválida." }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Solicitud inválida." }, 400);
    const db = admin();

    // ---------- file (no gasta IA) ----------
    if (body.action === "file") return await serveFile(uid, body);

    // ---------- config (gratis) ----------
    if (body.action === "config") {
      const ready = !!Deno.env.get("APIMART_API_KEY");
      return json({ ready, ugc: ready && await switchOpen(uid, UGC_SWITCH) });
    }

    if (!Deno.env.get("APIMART_API_KEY")) return json({ error: "Los videos llegan pronto.", pronto: true }, 503);

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
    const kind = typeof body.kind === "string" && KINDS.has(body.kind) ? body.kind : "clip";
    const template = typeof body.template === "string" && TEMPLATES.has(body.template) ? body.template : null;
    const seconds = body.seconds === 10 ? 10 : body.seconds === 5 ? 5 : kind === "ugc" ? 10 : 5;
    const size = typeof body.size === "string" && SIZES.has(body.size) ? body.size : "9:16";
    const isAd = kind === "anuncio" || kind === "ugc";
    if (isAd && TESTIMONIAL.some(r => r.test(prompt))) {
      return json({ error: "El guion suena a testimonio (\"lo compré\", \"me funcionó\"). La persona solo puede presentar o explicar. No se te cobró." }, 400);
    }
    if (kind === "ugc" && !(await switchOpen(uid, UGC_SWITCH))) {
      return json({ error: "Los videos UGC con presentador aún no están abiertos. Mientras, prueba el anuncio en video.", code: "ugc_off" }, 503);
    }
    const image = await startImage(uid, body);
    if (image === undefined) return json({ error: "No encontramos la imagen inicial. Elige otra." }, 400);
    const presenterPhoto = !!image && body.image_bucket === "personajes";

    const g = await charge(uid, seconds === 10 ? "vid_mini_10" : "vid_mini_5", `${isAd ? (kind === "ugc" ? "Video UGC" : "Video anuncio") : "Video IA"} ${seconds} s · ${prompt.slice(0, 50)}`);
    if (g instanceof Response) return g;
    txId = g.txId;

    const rules = [RULES, isAd ? AD_RULES : kind === "yt_scene" ? "" : SPEECH_RULE].filter(Boolean).join(" ");
    const q = await apimart("/videos/generations", {
      method: "POST",
      body: JSON.stringify({
        model: MODEL, prompt: `${prompt}\n\n${rules}`, duration: seconds, size, resolution: "720p",
        // La escena de YouTube va muda: la voz del video largo se monta aparte en el navegador.
        generate_audio: kind === "yt_scene" ? false : body.audio !== false, return_last_frame: true, nsfw_check: true,
        ...(image ? { image_urls: [image] } : {}),
      }),
    });
    if (!q.ok) {
      console.error("apimart video:", q.status, (await q.text()).slice(0, 300));
      await refund(txId, `apimart ${q.status}`);
      txId = null;
      const msg = q.status !== 400
        ? "El generador de video no está disponible ahora. Te devolvimos los créditos."
        : presenterPhoto
          ? "El generador no aceptó la foto del presentador. Prueba con \"La IA eligió por ti\" o con otra foto. Te devolvimos los créditos."
          : "El generador rechazó la descripción o la imagen. Te devolvimos los créditos.";
      return json({ error: msg }, 503);
    }
    const created = await q.json();
    const taskId = created?.data?.[0]?.task_id ?? created?.data?.task_id;
    if (!taskId) { await refund(txId, "sin task_id"); txId = null; return json({ error: "No se pudo crear el video. Te devolvimos los créditos." }, 502); }

    const { error: costErr } = await db.from("ai_usage").insert({ user_id: uid, fn: FN, model: `apimart:${MODEL}`, images: 0, cost_usd: seconds * COST_PER_SEC });
    if (costErr) console.error("ai_usage:", costErr.message);
    const { data: job, error } = await insertJob({
      user_id: uid, product_id: typeof body.product_id === "string" && /^[0-9a-f-]{36}$/i.test(body.product_id) ? body.product_id : null,
      provider: "apimart", model: MODEL, prompt: prompt.slice(0, 2000), seconds, status: "running",
      provider_request_id: taskId, credit_tx_id: txId, credits_charged: g.charged, kind, template,
    });
    if (error) { await refund(txId, "sin registro"); txId = null; return json({ error: "No se pudo registrar el video. Te devolvimos los créditos." }, 500); }
    return json({ job, billing: { charged: g.charged, balance: g.balance } }, 200, billingHeaders(g));
  } catch (e) {
    await refund(txId, "excepción");
    console.error("video-studio:", e);
    return json({ error: "No se pudo crear el video. No se te cobró." }, 500);
  }
});
