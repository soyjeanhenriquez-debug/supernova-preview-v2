// SUPERNOVA — Media Studio: genera un video con avatar IA (HeyGen, API v3) a
// partir de un guion corto (hook de 45-60s, el formato que un media buyer testea
// a diario — NO el VSL completo, que cuesta 5-7x más).
//
// API v3: HeyGen apaga TODOS los endpoints v1/v2 el 2026-10-31. Aquí se usa
//   POST /v3/videos            (antes POST /v2/video/generate)
//   GET  /v3/videos/{id}       (estado real y URL fresca del video)
//   GET  /v3/avatars/looks/{id} (motores que soporta el avatar elegido)
//
// Flujo de "generar":
//  1. Usuario real desde su sesión + acceso vigente + tope de uso (edge_guard).
//  2. Descuenta Media Credits ANTES de gastar nada en HeyGen.
//  3. Sin HEYGEN_API_KEY corre en modo simulado (dry_run): no se llama a HeyGen.
//  4. Crea el job y dispara la generación async con callback → heygen-webhook.
//  5. Si HeyGen no acepta el video, los Media Credits se devuelven solos
//     (refund_media_job, idempotente): el usuario nunca paga por un video que
//     no existe.
// Acción "refresh": re-consulta un job propio en HeyGen. Sirve de respaldo si el
// webhook no llega y para renovar la URL del video (es prefirmada y caduca).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const HEYGEN_API = "https://api.heygen.com";
const COST_MEDIA_CREDITS = 10; // ≈ 1 min de video
const MAX_WORDS = 160; // ≈ 45-60s hablado — límite duro server-side, no confiar en el cliente
const ID_RE = /^[A-Za-z0-9_-]{4,100}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// De más barato a más caro. Si se omite "engine", v3 usa Avatar IV.
const ENGINES = ["avatar_iii", "avatar_iv", "avatar_v"];

interface Body {
  action?: "generate" | "refresh" | "preflight";
  script?: string;
  avatar_id?: string;
  voice_id?: string;
  /** Solo compatibilidad: en v3 un Photo Avatar y un avatar de estudio se piden igual. */
  kind?: string;
  job_id?: string;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// deno-lint-ignore no-explicit-any
type Admin = any;

// ── Compuerta de usuario ────────────────────────────────────────────────
// verify_jwt del gateway NO basta: la llave pública (anon) del bundle también es
// un JWT válido. Aquí se exige un USUARIO real con acceso vigente y se aplica un
// tope de uso por usuario (RPC edge_guard).
async function requireUser(req: Request, admin: Admin, fn: string, maxHour: number, maxDay: number): Promise<{ userId: string } | Response> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(401, { error: "Inicia sesión para usar esta función." });
  const { data } = await admin.auth.getUser(token);
  const userId = data?.user?.id;
  if (!userId) return json(401, { error: "Sesión inválida o expirada. Vuelve a iniciar sesión." });
  const { data: g, error } = await admin.rpc("edge_guard", { p_user_id: userId, p_fn: fn, p_max_hour: maxHour, p_max_day: maxDay });
  if (error) return json(503, { error: "No se pudo verificar el acceso. Intenta de nuevo." });
  if (g?.ok !== true) {
    return g?.reason === "rate_limited"
      ? json(429, { error: "Alcanzaste el límite de videos por ahora. Intenta más tarde." })
      : json(403, { error: "Tu cuenta no tiene acceso activo." });
  }
  return { userId };
}

// Timeout duro en cada llamada: HeyGen ya nos dejó una petición colgada sin él.
async function heygen(path: string, key: string, init: RequestInit = {}, ms = 20000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(`${HEYGEN_API}${path}`, {
      ...init,
      headers: { "x-api-key": key, Accept: "application/json", ...(init.headers ?? {}) },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

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

// Motor con el que se genera. Avatar III es el más económico y el equivalente a
// lo que producía /v2/video/generate; se puede forzar otro con el secreto
// HEYGEN_ENGINE. Si el avatar no soporta el preferido, el más barato que sí.
// "missing" = HeyGen dice que ese avatar no existe (no se cobra nada).
async function pickEngine(key: string, lookId: string): Promise<{ engine: string | null; missing: boolean }> {
  const preferred = (Deno.env.get("HEYGEN_ENGINE") ?? "avatar_iii").trim();
  try {
    const r = await heygen(`/v3/avatars/looks/${encodeURIComponent(lookId)}`, key, {}, 8000);
    if (r.status === 404) {
      // Solo es "no existe" si lo dice HeyGen con su código; cualquier otro 404
      // (una ruta que cambie) no debe bloquear la generación.
      const body = await r.json().catch(() => ({}));
      return { engine: null, missing: body?.error?.code === "not_found" };
    }
    if (!r.ok) return { engine: null, missing: false };
    const look = (await r.json())?.data ?? {};
    const supported: string[] = Array.isArray(look.supported_api_engines) ? look.supported_api_engines.map(String) : [];
    if (supported.includes(preferred)) return { engine: preferred, missing: false };
    return { engine: ENGINES.find((e) => supported.includes(e)) ?? null, missing: false };
  } catch {
    return { engine: null, missing: false }; // sin dato → HeyGen decide el motor
  }
}

// Estado REAL del video según HeyGen (la única fuente de verdad). Completa el
// job, o lo marca fallido y devuelve los Media Credits una sola vez.
async function syncJob(admin: Admin, key: string, job: { id: string; status: string; heygen_video_id: string }) {
  const now = new Date().toISOString();
  let r: Response;
  try {
    r = await heygen(`/v3/videos/${encodeURIComponent(job.heygen_video_id)}`, key, {}, 12000);
  } catch {
    return { id: job.id, status: job.status };
  }
  if (!r.ok) return { id: job.id, status: job.status };
  const v = (await r.json().catch(() => ({})))?.data ?? {};
  const url = safeHeygenUrl(v.video_url);

  if (v.status === "completed" && url) {
    // Nunca se "revive" un job fallido: ese ya fue reembolsado.
    await admin.from("media_generation_jobs")
      .update({ status: "completed", video_url: url, error: null, updated_at: now })
      .eq("id", job.id).in("status", ["pending", "processing", "completed"]);
    return { id: job.id, status: "completed", video_url: url };
  }
  if (v.status === "failed") {
    const reason = String(v.failure_message ?? v.failure_code ?? "HeyGen no pudo generar el video").slice(0, 500);
    const { data: moved } = await admin.from("media_generation_jobs")
      .update({ status: "failed", error: reason, updated_at: now })
      .eq("id", job.id).in("status", ["pending", "processing"]).select("id");
    if (moved?.length) await admin.rpc("refund_media_job", { p_job_id: job.id, p_reason: "HeyGen no pudo generar el video" });
    return { id: job.id, status: "failed", refunded: true };
  }
  return { id: job.id, status: job.status };
}

// Qué decirle al usuario cuando HeyGen rechaza la creación. El detalle crudo se
// queda en el log y en el job; al usuario le llega algo que puede entender.
function creationFailure(status: number, data: Record<string, unknown>): { http: number; code: string; error: string } {
  const err = (data?.error ?? {}) as Record<string, unknown>;
  const code = String(err.code ?? data?.code ?? "");
  const text = `${code} ${String(err.message ?? data?.message ?? "")}`.toLowerCase();
  const refund = " Te devolvimos tus Media Credits.";
  if (status === 402 || /insufficient|credit|balance|quota|payment/.test(text)) {
    return { http: 503, code: "heygen_no_balance", error: "El estudio de video está en mantenimiento por unas horas." + refund };
  }
  if (status === 401 || status === 403) {
    return { http: 503, code: "heygen_auth", error: "El estudio de video está en mantenimiento por unas horas." + refund };
  }
  if (status === 409) {
    return { http: 409, code: "avatar_not_ready", error: "Ese avatar todavía se está procesando en HeyGen. Prueba en unos minutos o elige otro." + refund };
  }
  if (status === 429) {
    return { http: 429, code: "heygen_busy", error: "Hay muchos videos generándose ahora mismo. Intenta de nuevo en unos minutos." + refund };
  }
  if (status === 400) {
    return { http: 400, code: code || "invalid_request", error: "HeyGen no aceptó ese avatar o esa voz. Elige otra combinación." + refund };
  }
  return { http: 502, code: "heygen_error", error: "No se pudo crear el video en este momento. Intenta de nuevo." + refund };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let jobId: string | null = null; // job ya cobrado: si algo revienta, se reembolsa
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const heygenKey = Deno.env.get("HEYGEN_API_KEY");

    // ── Acción: re-sincronizar un job propio ──────────────────────────────
    if (body.action === "refresh") {
      const gate = await requireUser(req, admin, "heygen-refresh", 240, 1500);
      if (gate instanceof Response) return gate;
      const id = String(body.job_id ?? "");
      if (!UUID_RE.test(id)) return json(400, { error: "job_id inválido" });
      const { data: job } = await admin.from("media_generation_jobs")
        .select("id, user_id, status, heygen_video_id, dry_run, video_url").eq("id", id).maybeSingle();
      if (!job || job.user_id !== gate.userId) return json(404, { error: "Video no encontrado" });
      if (job.dry_run || !job.heygen_video_id || !heygenKey || job.status === "failed") {
        return json(200, { id: job.id, status: job.status, video_url: job.video_url });
      }
      return json(200, await syncJob(admin, heygenKey, job));
    }

    // ── Acción: comprobar un avatar sin generar ni cobrar ─────────────────
    if (body.action === "preflight") {
      const gate = await requireUser(req, admin, "heygen-refresh", 240, 1500);
      if (gate instanceof Response) return gate;
      const id = String(body.avatar_id ?? "").trim();
      if (!ID_RE.test(id)) return json(400, { error: "avatar_id inválido" });
      if (!heygenKey) return json(200, { dry_run: true, engine: null, missing: false });
      return json(200, { dry_run: false, ...(await pickEngine(heygenKey, id)) });
    }

    // ── Acción: generar ───────────────────────────────────────────────────
    const gate = await requireUser(req, admin, "heygen-generate-video", 12, 40);
    if (gate instanceof Response) return gate;

    const script = String(body.script ?? "").trim();
    const avatarId = String(body.avatar_id ?? "").trim();
    const voiceId = String(body.voice_id ?? "").trim();

    if (!script) return json(400, { error: "Guion requerido" });
    const wordCount = script.split(/\s+/).filter(Boolean).length;
    if (wordCount > MAX_WORDS) {
      return json(400, { error: `El guion es muy largo (${wordCount} palabras, máx ${MAX_WORDS}). Media Studio genera hooks cortos, no el VSL completo.` });
    }
    if (script.length > 4000) return json(400, { error: "El guion es demasiado largo." });
    if (!ID_RE.test(avatarId) || !ID_RE.test(voiceId)) return json(400, { error: "Falta elegir el avatar o la voz." });

    // Los avatares y voces PRIVADOS de la cuenta son la cara y la voz clonada del dueño:
    // solo un admin genera con ellos. No basta con no listarlos: el id se puede mandar a
    // mano. Si HeyGen no deja comprobarlo, se rechaza (falla cerrado) y no se cobra nada.
    if (heygenKey) {
      const { data: adminRole } = await admin.from("user_roles").select("role").eq("user_id", gate.userId).eq("role", "admin").maybeSingle();
      if (!adminRole) {
        const ids = async (path: string, key: string): Promise<Set<string> | null> => {
          try {
            const r = await heygen(path, heygenKey, {}, 12000);
            if (!r.ok) return null;
            const b = await r.json().catch(() => null);
            return new Set<string>((Array.isArray(b?.data) ? b.data : []).map((x: Record<string, unknown>) => String(x[key] ?? "")));
          } catch { return null; }
        };
        const [groups, voices] = await Promise.all([ids("/v3/avatars?ownership=private&limit=50", "id"), ids("/v3/voices?type=private&limit=100", "voice_id")]);
        if (!groups || !voices) return json(503, { error: "No pudimos validar el avatar. Intenta de nuevo en un momento." });
        const looks = await Promise.all([...groups].filter(Boolean).map((g) => ids(`/v3/avatars/looks?ownership=private&group_id=${encodeURIComponent(g)}&limit=100`, "id")));
        if (looks.some((l) => l === null)) return json(503, { error: "No pudimos validar el avatar. Intenta de nuevo en un momento." });
        if (groups.has(avatarId) || looks.some((l) => l!.has(avatarId)) || voices.has(voiceId)) {
          return json(403, { error: "Ese avatar o esa voz no están disponibles. Recarga la página y elige otro." });
        }
      }
    }

    // Antes de cobrar: ¿existe el avatar y con qué motor se puede generar?
    let engine: string | null = null;
    if (heygenKey) {
      const picked = await pickEngine(heygenKey, avatarId);
      if (picked.missing) return json(400, { error: "Ese avatar ya no existe en HeyGen. Recarga la página y elige otro." });
      engine = picked.engine;
    }

    // Descontar Media Credits ANTES de gastar nada externo
    const { data: consumeResult, error: consumeErr } = await admin.rpc("consume_media_credits", {
      p_user_id: gate.userId, p_amount: COST_MEDIA_CREDITS, p_action: "video_hook",
    });
    if (consumeErr || !consumeResult?.success) {
      return json(402, { error: consumeResult?.error ?? "No se pudo descontar Media Credits", balance: consumeResult?.balance });
    }

    // Modo simulado: no se llama a HeyGen, el job queda "completed" sin video real
    if (!heygenKey) {
      const { data: job, error: insErr } = await admin.from("media_generation_jobs").insert({
        user_id: gate.userId, script, avatar_id: avatarId, voice_id: voiceId,
        status: "completed", cost_media_credits: COST_MEDIA_CREDITS, dry_run: true,
      }).select("id, status, dry_run").single();
      if (insErr) {
        await admin.rpc("grant_media_credits", { p_user_id: gate.userId, p_amount: COST_MEDIA_CREDITS, p_reason: "Reembolso: no se pudo registrar el video" });
        throw insErr;
      }
      return json(200, { ...job, balance: consumeResult.balance, dry_run: true });
    }

    const { data: job, error: insErr } = await admin.from("media_generation_jobs").insert({
      user_id: gate.userId, script, avatar_id: avatarId, voice_id: voiceId,
      status: "pending", cost_media_credits: COST_MEDIA_CREDITS, dry_run: false,
    }).select("id").single();
    if (insErr) {
      await admin.rpc("grant_media_credits", { p_user_id: gate.userId, p_amount: COST_MEDIA_CREDITS, p_reason: "Reembolso: no se pudo registrar el video" });
      throw insErr;
    }
    jobId = job.id;

    const payload: Record<string, unknown> = {
      type: "avatar",
      avatar_id: avatarId, // v3: el "look id" sirve igual para Photo Avatars y avatares de estudio
      script,
      voice_id: voiceId,
      aspect_ratio: "9:16", // vertical — Reels/TikTok/Stories
      resolution: "720p",
      title: `SUPERNOVA hook ${job.id.slice(0, 8)}`,
      callback_url: `${SUPABASE_URL}/functions/v1/heygen-webhook`,
      callback_id: job.id,
    };
    if (engine) payload.engine = { type: engine };

    // En el job se guarda el mensaje que entiende el usuario (la app lo muestra en
    // su historial); el detalle crudo de HeyGen queda solo en el log del servidor.
    const fail = async (detail: string, out: { http: number; code: string; error: string }) => {
      console.error("heygen-generate-video: job", job.id, out.code, detail.slice(0, 300));
      await admin.from("media_generation_jobs")
        .update({ status: "failed", error: out.error.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", job.id);
      const { data: refund } = await admin.rpc("refund_media_job", { p_job_id: job.id, p_reason: out.code });
      jobId = null;
      return json(out.http, { error: out.error, code: out.code, job_id: job.id, refunded: refund?.success === true, balance: refund?.balance });
    };

    // Idempotency-Key = id del job: si la red se corta y HeyGen SÍ recibió la
    // petición, el reintento devuelve ese mismo video en vez de crear (y cobrar) otro.
    const create = () => heygen("/v3/videos", heygenKey, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": job.id },
      body: JSON.stringify(payload),
    });
    let resp: Response;
    try {
      try {
        resp = await create();
      } catch (first) {
        console.error("heygen-generate-video: reintento tras fallo de red:", first instanceof Error ? first.name : first);
        resp = await create();
      }
    } catch (e) {
      const timedOut = e instanceof Error && e.name === "AbortError";
      return await fail(timedOut ? "Timeout llamando a HeyGen" : "Error de red llamando a HeyGen", {
        http: 504, code: timedOut ? "heygen_timeout" : "heygen_network",
        error: "HeyGen no respondió a tiempo. Intenta de nuevo en un momento. Te devolvimos tus Media Credits.",
      });
    }
    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      return await fail(`HTTP ${resp.status} ${JSON.stringify(data)}`, creationFailure(resp.status, data));
    }

    const videoId = data?.data?.video_id ?? data?.video_id ?? null;
    if (!videoId || !ID_RE.test(String(videoId))) {
      return await fail(`Respuesta sin video_id: ${JSON.stringify(data)}`, creationFailure(502, {}));
    }

    await admin.from("media_generation_jobs")
      .update({ status: "processing", heygen_video_id: String(videoId), updated_at: new Date().toISOString() })
      .eq("id", job.id);
    jobId = null;

    return json(200, { id: job.id, status: "processing", balance: consumeResult.balance, dry_run: false, engine });
  } catch (e) {
    console.error("heygen-generate-video:", e instanceof Error ? e.message : e);
    if (jobId) {
      await admin.from("media_generation_jobs")
        .update({ status: "failed", error: "Error interno", updated_at: new Date().toISOString() }).eq("id", jobId);
      await admin.rpc("refund_media_job", { p_job_id: jobId, p_reason: "error interno" });
    }
    return json(500, { error: "No se pudo generar el video. Si se descontaron Media Credits, ya te los devolvimos." });
  }
});
