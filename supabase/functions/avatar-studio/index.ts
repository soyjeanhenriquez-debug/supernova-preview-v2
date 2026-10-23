// SUPERNOVA — Estudio de avatar (20-oct-2026). Plantillas de imagen (APIMart GPT Image 2, Nano Banana Pro y 2) y de
// video (APIMart Omni, Grok y Seedance 2.0 Mini, y Higgsfield: Wan 3.0, Kling 2.5 Turbo, Kling 3.0, Seedance 2.0)
// para crear con un avatar (sin tu cara) o con tu foto (con tu cara).
//
// Compuertas (verify_jwt NO protege): usuario real (caller) → interruptor de admin → cobro en el
// servidor con edge_guard_charge (acciones av_* de credit_prices, costo × 6) ANTES de gastar →
// proveedor → si falla, refund. El navegador manda ids y huecos; el prompt lo arma ESTE servidor con
// _shared/avatarStudio.ts (el mismo módulo que muestra la app).
//
// Acciones:
//   config  (gratis) → qué está abierto para esta cuenta y qué proveedores tienen llave.
//   image   { template, model?: "gpt"|"pro"|"std", fill?, refs: { persona?: Ref, prenda?: Ref, lugar?: Ref, producto?: Ref,
//             captura?: Ref, aiFace?: { stock } | Ref(estudio-avatar) }, aspect? }
//           → guarda la imagen en el bucket privado "estudio-avatar/{uid}/…" y devuelve ruta + URL firmada.
//   gallery (gratis) → las últimas imágenes del estudio de esta cuenta, con URL firmada.
//   video   { model, seconds, parts, image: Ref, product?: Ref, product_id? } → video_jobs (kind 'avatar').
//   status  { job_id } (gratis) → consulta al proveedor; si falló, devuelve los créditos.
// Ref = { bucket: "personajes" | "estudio-avatar", path } — siempre de la carpeta del propio usuario.
//
// Higgsfield (docs leídas el 20-oct-2026, docs.higgsfield.ai): Auth "Key {id}:{secret}",
// POST /{modelo} → { request_id } · GET /requests/{id}/status → video.url (≥ 7 días).
//   Wan 3.0       /alibaba/wan-3.0/image-to-video        { prompt, image_url, duration, resolution, aspect_ratio, generate_audio }
//   Kling 2.5     /kling-video/v2.5-turbo/standard/image-to-video { prompt, image_url, duration 5|10 } (sin audio)
//   Kling 3.0     /kling-video/v3.0/std/image-to-video   { prompt, image_url, duration, sound "on"|"off" }
//   Seedance 2.0  /bytedance/seedance-2.0/image-to-video { prompt, image_url, duration, resolution, generate_audio }
//                 /bytedance/seedance-2.0/reference-to-video { prompt, image_urls[≤9], duration, resolution, aspect_ratio, generate_audio }
// APIMart (docs leídas el 20-oct-2026, docs.apimart.ai): POST /v1/videos/generations → task_id · GET /v1/tasks/{id}.
//   Seedance Mini seedance-2.0-mini           { prompt, duration, size, resolution, generate_audio, image_urls }
//   Omni          gemini-omni-1.1-flash-ext   { prompt, duration 4|6|8|10, resolution, aspect_ratio, generation_type "frame", image_urls[1] } (con audio)
//   Grok          grok-imagine-1.5-video-ext  { prompt, duration 6–15, resolution, size, image_urls } (sin interruptor de audio)
// Higgsfield no devuelve el costo: se anota en ai_usage el precio publicado (usdPerSec × s) y se revisa
// contra su consola. Kling 3.0 va con sound "off" hasta medir cuánto sube con audio.
import { corsHeaders } from "npm:@supabase/supabase-js@2.117.1/cors";
import { admin, billingHeaders, caller, charge, json, refund, type Caller } from "../_shared/media.ts";
import { ownStoragePath } from "../_shared/paths.ts";
import { APIMART, apimartImage } from "../_shared/apimart.ts";
import { poll } from "../_shared/genjutsu.ts";
import {
  IMAGE_TIERS, PRESENTER_RULE_EN, VIDEO_FORMATS, buildImagePrompt, buildVideoPrompt, isImageTier, videoModel, videoSeconds, videoUsd,
  type RefSlot, type VideoFormat, type VideoModel,
} from "../_shared/avatarStudio.ts";

const FN = "avatar-studio";
const OPEN_SWITCH = "avatar-studio:open";
const HF_SWITCH = "avatar-studio:higgsfield";
const OUT = "estudio-avatar";
const HF = "https://api.higgsfield.ai";
const APIMART_VIDEO: Record<string, string> = {
  "seedance-mini": "seedance-2.0-mini", omni: "gemini-omni-1.1-flash-ext", grok: "grok-imagine-1.5-video-ext",
};
const ASPECTS = new Set(["9:16", "1:1", "4:5", "16:9"]);
const STOCK = new Set(["valentina", "carmen", "andres", "julio"]);
const APP_URL = (Deno.env.get("APP_PUBLIC_URL") ?? "https://supernova-six-eta.vercel.app").replace(/\/+$/, "");
const MAX_HOUR = 30, MAX_DAY = 120;

const hfAuth = () => {
  const id = Deno.env.get("HF_API_KEY_ID"), secret = Deno.env.get("HF_API_KEY_SECRET");
  return id && secret ? `Key ${id}:${secret}` : null;
};
const apimartKey = () => Deno.env.get("APIMART_API_KEY") ?? null;

/** Interruptor de admin en edge_limits: sin fila = abierto; enabled=false = solo admins. */
async function switchOpen(who: Caller, fn: string): Promise<boolean> {
  if (who.isAdmin) return true;
  const { data, error } = await admin().from("edge_limits").select("enabled").eq("fn", fn).maybeSingle();
  if (error) { console.error("edge_limits:", error.message); return false; }
  return !data || data.enabled === true;
}

type Ref = { bucket?: unknown; path?: unknown; stock?: unknown };

/** URL firmada (30 min) de una imagen PROPIA. undefined = no vino; null = vino pero no es válida. */
async function signRef(uid: string, ref: unknown, slot: RefSlot): Promise<string | null | undefined> {
  if (ref === undefined || ref === null) return undefined;
  const r = ref as Ref;
  if (slot === "aiFace") {
    // Solo caras creadas con IA: un avatar de SUPERNOVA o una imagen que generó este estudio.
    if (typeof r.stock === "string") return STOCK.has(r.stock) ? `${APP_URL}/avatares/${r.stock}.webp` : null;
    if (r.bucket !== OUT) return null;
  }
  const bucket = r.bucket === OUT ? OUT : r.bucket === "personajes" ? "personajes" : null;
  const p = bucket ? ownStoragePath(uid, r.path) : null;
  if (!bucket || !p) return null;
  const { data } = await admin().storage.from(bucket).createSignedUrl(p, 60 * 30);
  return data?.signedUrl ?? null;
}

async function logCost(uid: string, model: string, usd: number, images: number) {
  const { error } = await admin().from("ai_usage").insert({ user_id: uid, fn: FN, model, images, cost_usd: usd });
  if (error) console.error("ai_usage:", error.message);
}

const productId = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);

// ───────────── video: envío al proveedor ─────────────

type Submit = { taskId: string } | { error: string; status?: number };

async function submitVideo(m: VideoModel, seconds: 5 | 10, prompt: string, talks: boolean, image: string, product: string | null): Promise<Submit> {
  if (m.provider === "apimart") {
    const key = apimartKey();
    if (!key) return { error: "sin llave" };
    const model = APIMART_VIDEO[m.id];
    if (!model) return { error: "modelo" };
    const duration = videoSeconds(m, seconds);
    const body = m.id === "omni"
      ? { model, prompt, duration, resolution: "720p", aspect_ratio: "9:16", generation_type: "frame", nsfw_check: true, image_urls: [image] }
      : m.id === "grok"
      ? { model, prompt, duration, resolution: "720p", size: "9:16", nsfw_check: true, image_urls: [image] }
      : { model, prompt, duration, size: "9:16", resolution: "720p", generate_audio: talks, return_last_frame: true, nsfw_check: true, image_urls: [image] };
    const r = await fetch(`${APIMART}/videos/generations`, {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) { console.error("apimart video:", r.status, (await r.text()).slice(0, 300)); return { error: "apimart", status: r.status }; }
    const j = await r.json();
    const id = Array.isArray(j?.data) ? j.data[0]?.task_id : j?.data?.task_id;
    return typeof id === "string" ? { taskId: id } : { error: "sin task_id" };
  }
  const auth = hfAuth();
  if (!auth) return { error: "sin llave" };
  let path: string, body: Record<string, unknown>;
  switch (m.id) {
    case "wan30":
      path = "/alibaba/wan-3.0/image-to-video";
      body = { prompt, image_url: image, duration: seconds, resolution: "720p", aspect_ratio: "9:16", generate_audio: talks };
      break;
    case "kling25":
      path = "/kling-video/v2.5-turbo/standard/image-to-video";
      body = { prompt, image_url: image, duration: seconds };
      break;
    case "kling30":
      path = "/kling-video/v3.0/std/image-to-video";
      body = { prompt: prompt.slice(0, 2500), image_url: image, duration: seconds, sound: "off" };
      break;
    case "seedance20":
      if (product) {
        path = "/bytedance/seedance-2.0/reference-to-video";
        body = { prompt: `Image 1 is the person (keep their face and identity exactly). Image 2 is the product (keep its shape, colors and label exactly).\n${prompt}`, image_urls: [image, product], duration: seconds, resolution: "720p", aspect_ratio: "9:16", generate_audio: talks };
      } else {
        path = "/bytedance/seedance-2.0/image-to-video";
        body = { prompt, image_url: image, duration: seconds, resolution: "720p", generate_audio: talks };
      }
      break;
    default:
      return { error: "modelo" };
  }
  const r = await fetch(`${HF}${path}`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) { console.error("higgsfield:", m.id, r.status, (await r.text()).slice(0, 300)); return { error: "higgsfield", status: r.status }; }
  const j = await r.json();
  return typeof j?.request_id === "string" ? { taskId: j.request_id } : { error: "sin request_id" };
}

// ───────────── servidor ─────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let txId: string | null = null;
  try {
    const who = await caller(req);
    if (!who) return json({ error: "Inicia sesión para usar el estudio." }, 401);
    const raw = await req.text();
    if (raw.length > 8000) return json({ error: "La solicitud es demasiado grande." }, 413);
    const body = raw ? JSON.parse(raw) : {};
    const db = admin();

    if (body.action === "config") {
      const [open, hf] = await Promise.all([switchOpen(who, OPEN_SWITCH), switchOpen(who, HF_SWITCH)]);
      return json({ open, apimart: !!apimartKey(), higgsfield: hf && !!hfAuth(), admin: who.isAdmin });
    }

    if (body.action === "gallery") {
      const { data } = await db.storage.from(OUT).list(who.id, { limit: 40, sortBy: { column: "created_at", order: "desc" } });
      const paths = (data ?? []).filter(f => f.name && !f.name.startsWith(".")).map(f => `${who.id}/${f.name}`);
      if (!paths.length) return json({ items: [] });
      const { data: signed } = await db.storage.from(OUT).createSignedUrls(paths, 60 * 60);
      return json({ items: (signed ?? []).filter(s => s.signedUrl).map(s => ({ path: s.path, url: s.signedUrl })) });
    }

    if (body.action === "status") {
      const id = productId(body.job_id);
      if (!id) return json({ error: "job_id inválido" }, 400);
      const { data: job } = await db.from("video_jobs").select("*").eq("id", id).eq("user_id", who.id).eq("kind", "avatar").maybeSingle();
      if (!job) return json({ error: "Video no encontrado." }, 404);
      if (job.status === "done" || job.status === "failed") return json({ job });
      const p = await poll(job.provider === "higgsfield" ? "higgsfield" : "apimart", job.provider_request_id);
      if (!p || p.status === "queued" || p.status === "in_progress") return json({ job: { ...job, status: "running" } });
      const now = new Date().toISOString();
      if (p.status === "completed") {
        const patch = { status: "done", result_url: p.resultUrl ?? null, updated_at: now };
        await db.from("video_jobs").update(patch).eq("id", id);
        return json({ job: { ...job, ...patch } });
      }
      await refund(job.credit_tx_id ?? null, `video falló: ${p.error ?? ""}`.slice(0, 120));
      const patch = { status: "failed", error: (p.error ?? "El video falló.").slice(0, 300), updated_at: now };
      await db.from("video_jobs").update(patch).eq("id", id);
      return json({ job: { ...job, ...patch }, error: "El video falló. Te devolvimos los créditos." });
    }

    if (body.action !== "image" && body.action !== "video") return json({ error: "Acción desconocida." }, 400);
    if (!(await switchOpen(who, OPEN_SWITCH))) return json({ error: "El estudio de avatar llega pronto.", pronto: true }, 503);

    // ---------- imagen ----------
    if (body.action === "image") {
      const built = buildImagePrompt(body.template, body.fill);
      if ("error" in built) return json({ error: built.error }, 400);
      const t = built.template;
      if (!apimartKey()) return json({ error: "Las imágenes llegan pronto.", pronto: true }, 503);
      const refsIn = (body.refs ?? {}) as Record<string, unknown>;
      const urls: string[] = [];
      for (const slot of t.refs) {
        const u = await signRef(who.id, refsIn[slot], slot);
        if (!u) {
          return json({ error: slot === "aiFace"
            ? "Para la cara nueva elige un avatar de SUPERNOVA o una imagen creada en este estudio."
            : "Falta una imagen o no es válida. Súbela de nuevo." }, 400);
        }
        urls.push(u);
      }
      const aspect = typeof body.aspect === "string" && ASPECTS.has(body.aspect) ? body.aspect : "9:16";
      // La persona puede elegir otro modelo; el precio sale de IMAGE_TIERS en el servidor, nunca del cliente.
      const wanted: unknown = body.model;
      const tier = IMAGE_TIERS[isImageTier(wanted) ? wanted : t.tier];

      const g = await charge(FN, who.id, tier.action, `Estudio · ${t.label}`, MAX_HOUR, MAX_DAY);
      if (g instanceof Response) return g;
      txId = g.txId;

      const t0 = Date.now();
      let img = await apimartImage(built.prompt, aspect, urls, tier.apimart);
      if (!img && Date.now() - t0 < 30_000) img = await apimartImage(built.prompt, aspect, urls, tier.apimart);
      if (!img) { await refund(txId, "imagen falló"); txId = null; return json({ error: "La imagen no salió. Te devolvimos los créditos.", refunded: true }, 502); }
      await logCost(who.id, `apimart:${tier.apimart}:${t.id}`, img.cost ?? tier.usd, 1);

      const ext = img.mime === "image/png" ? "png" : img.mime === "image/webp" ? "webp" : "jpg";
      const path = `${who.id}/${Date.now()}-${t.id}.${ext}`;
      const bytes = Uint8Array.from(atob(img.b64), c => c.charCodeAt(0));
      const up = await db.storage.from(OUT).upload(path, bytes, { contentType: img.mime, upsert: false });
      if (up.error) { await refund(txId, "storage"); txId = null; return json({ error: "No se pudo guardar la imagen. Te devolvimos los créditos." }, 500); }
      const { data: s } = await db.storage.from(OUT).createSignedUrl(path, 60 * 60);
      return json({ path, url: s?.signedUrl ?? null, billing: { charged: g.charged, balance: g.balance } }, 200, billingHeaders(g));
    }

    // ---------- video ----------
    const m = videoModel(body.model);
    if (!m) return json({ error: "Elige un modelo de video." }, 400);
    const seconds: 5 | 10 = body.seconds === 10 ? 10 : 5;
    if (!m.seconds.includes(seconds)) return json({ error: "Duración no disponible para ese modelo." }, 400);
    const realSec = videoSeconds(m, seconds); // Omni y Grok no hacen 5 s: la opción corta entrega 6 s.
    if (m.provider === "higgsfield" && !(await switchOpen(who, HF_SWITCH))) return json({ error: "Este modelo llega pronto.", pronto: true }, 503);
    if (m.provider === "higgsfield" ? !hfAuth() : !apimartKey()) return json({ error: "Este modelo llega pronto.", pronto: true }, 503);

    const parts = (body.parts ?? {}) as Record<string, unknown>;
    const format = VIDEO_FORMATS.find(f => f.id === parts.format);
    if (!format) return json({ error: "Elige un formato." }, 400);
    if (format.talks && !m.talks) return json({ error: `${m.label} no habla. Elige "Sin hablar" o un modelo con voz.` }, 400);
    const built = buildVideoPrompt({
      format: format.id as VideoFormat, camera: parts.camera as string, before: parts.before as string, after: parts.after as string,
      script: parts.script as string, voice: parts.voice as string, accent: parts.accent as string,
      action: parts.action as string, place: parts.place as string, surface: parts.surface as string, seconds: realSec,
    });
    if ("error" in built) return json({ error: built.error }, 400);

    const image = await signRef(who.id, body.image, "persona");
    if (!image) return json({ error: "Elige la imagen con la que empieza el video." }, 400);
    const product = m.productRef && format.needsProduct ? await signRef(who.id, body.product, "producto") : undefined;
    if (product === null) return json({ error: "La foto del producto no es válida. Súbela de nuevo." }, 400);

    const prompt = format.talks ? built.prompt : `${built.prompt}\n${PRESENTER_RULE_EN}`;
    const g = await charge(FN, who.id, m.action(seconds), `Estudio · ${m.label} ${realSec} s · ${format.label}`, MAX_HOUR, MAX_DAY);
    if (g instanceof Response) return g;
    txId = g.txId;

    const sent = await submitVideo(m, seconds, prompt, format.talks, image, product ?? null);
    if ("error" in sent) {
      await refund(txId, `${m.provider} ${sent.status ?? sent.error}`); txId = null;
      return json({ error: sent.status === 400 || sent.status === 422
        ? "El generador no aceptó la imagen o el texto. Prueba con otra imagen. Te devolvimos los créditos."
        : "El generador de video no está disponible ahora. Te devolvimos los créditos.", refunded: true }, 503);
    }
    await logCost(who.id, `${m.provider}:${m.id}`, videoUsd(m, seconds), 0);
    const { data: job, error } = await db.from("video_jobs").insert({
      user_id: who.id, product_id: productId(body.product_id), provider: m.provider, model: m.id,
      prompt: prompt.slice(0, 2000), seconds: realSec, status: "running", provider_request_id: sent.taskId,
      credit_tx_id: txId, credits_charged: g.charged, kind: "avatar", template: format.id,
    }).select("*").single();
    if (error) { console.error("video_jobs:", error.message); await refund(txId, "sin registro"); txId = null; return json({ error: "No se pudo registrar el video. Te devolvimos los créditos." }, 500); }
    return json({ job, billing: { charged: g.charged, balance: g.balance } }, 200, billingHeaders(g));
  } catch (e) {
    await refund(txId, "excepción");
    console.error("avatar-studio:", e);
    return json({ error: "No se pudo completar. No se te cobró." }, 500);
  }
});
