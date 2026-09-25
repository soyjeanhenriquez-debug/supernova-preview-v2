// SUPERNOVA — Videos del personaje ("Vende sin mostrar tu cara") con el catálogo de fal.ai.
//
// El navegador manda { model_id, prompt, image_path }. El servidor decide todo lo demás desde
// media_models (endpoint, parámetros fijos, plan necesario, estado) y credit_prices (precio):
//   status 'admin' = solo admins (pruebas) · 'live' = clientes · 'soon' = PRONTO · 'off' = oculto
//   tier 'comunidad' = plan Comunidad Creativos 10X (o admin); 'pro' = cualquier plan activo.
// Cobra ANTES de llamar a fal y devuelve el crédito si el video falla. Filtros de contenido de fal
// encendidos en todos los modelos (nada NSFW, manual de SUPERNOVA).
//   create → valida → modelo/plan → cobro → cola de fal → video_jobs
//   status → consulta fal; terminado: guarda la URL; fallido: reembolsa.
//   ?ping=1 → prueba la llave de fal sin gastar (solo mientras ningún modelo de video esté 'live').
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  FAL_KEY, admin, appOf, billingHeaders, caller, charge, fal, json, logCost, pickModel, refund, signedPhoto,
} from "../_shared/media.ts";

const FN = "video-generate";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let txId: string | null = null;
  try {
    if (new URL(req.url).searchParams.get("ping") === "1") {
      const { count } = await admin().from("media_models").select("id", { count: "exact", head: true }).eq("kind", "video").eq("status", "live");
      if ((count ?? 0) > 0) return json({ error: "No disponible." }, 404);
      if (!FAL_KEY) return json({ fal_key: false });
      const r = await fal("https://queue.fal.run/fal-ai/kling-video/requests/00000000-0000-0000-0000-000000000000/status");
      await r.body?.cancel();
      return json({ fal_key: true, fal_auth_ok: r.status !== 401 && r.status !== 403, fal_status: r.status });
    }

    const who = await caller(req);
    if (!who) return json({ error: "Inicia sesión para usar esta función." }, 401);

    const raw = await req.text();
    if (raw.length > 6000) return json({ error: "La solicitud es demasiado grande." }, 413);
    const body = raw ? JSON.parse(raw) : {};
    const db = admin();

    if (body.action === "status") {
      const jobId = typeof body.job_id === "string" && /^[0-9a-f-]{36}$/i.test(body.job_id) ? body.job_id : null;
      if (!jobId) return json({ error: "job_id inválido" }, 400);
      const { data: job } = await db.from("video_jobs").select("*").eq("id", jobId).eq("user_id", who.id).maybeSingle();
      if (!job) return json({ error: "Video no encontrado." }, 404);
      if (job.status === "done" || job.status === "failed" || !FAL_KEY || !job.provider_request_id) return json({ job });
      const base = `https://queue.fal.run/${appOf(job.model)}/requests/${job.provider_request_id}`;
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
        await refund(job.credit_tx_id, "video falló");
        await db.from("video_jobs").update({ status: "failed", error: "El proveedor no entregó el video.", updated_at: new Date().toISOString() }).eq("id", jobId);
        return json({ job: { ...job, status: "failed" }, error: "El video falló. Te devolvimos los créditos." });
      }
      return json({ job: { ...job, status: "running" } });
    }

    // create: validar → modelo y plan → cobrar → gastar.
    const prompt = String(body.prompt ?? "").trim().slice(0, 1800);
    if (!prompt) return json({ error: "Escribe qué pasa en el video." }, 400);
    if (!FAL_KEY) return json({ error: "Los videos llegan pronto.", pronto: true }, 503);
    const m = await pickModel(body.model_id, "video", who);
    if (m instanceof Response) return m;
    const photo = await signedPhoto(who.id, body.image_path);
    if (!photo || !m.image_field) return json({ error: "Primero crea la foto de tu personaje." }, 400);

    const g = await charge(FN, who.id, m.action, `${m.label} · ${prompt.slice(0, 50)}`, 10, 30);
    if (g instanceof Response) return g;
    txId = g.txId;

    const q = await fal(`https://queue.fal.run/${m.endpoint}`, {
      method: "POST",
      body: JSON.stringify({ ...m.input, prompt, [m.image_field]: photo }),
    });
    if (!q.ok) {
      console.error("fal:", m.endpoint, q.status, (await q.text()).slice(0, 300));
      await refund(txId, `fal ${q.status}`);
      return json({ error: q.status === 422 ? "El generador rechazó la foto o la descripción. Te devolvimos los créditos." : "El generador de video no está disponible ahora. Te devolvimos los créditos." }, 503);
    }
    const queued = await q.json();
    await logCost(who.id, FN, m);
    const { data: job, error } = await db.from("video_jobs").insert({
      user_id: who.id, product_id: typeof body.product_id === "string" ? body.product_id : null,
      provider: "fal", model: m.endpoint, prompt, seconds: m.seconds ?? 5, status: "running",
      provider_request_id: queued?.request_id ?? null, credit_tx_id: txId, credits_charged: g.charged,
    }).select("*").single();
    if (error) { await refund(txId, "sin registro"); return json({ error: "No se pudo registrar el video. Te devolvimos los créditos." }, 500); }
    return json({ job, billing: { charged: g.charged, balance: g.balance } }, 200, billingHeaders(g));
  } catch (e) {
    await refund(txId, "excepción");
    console.error("video-generate:", e);
    return json({ error: "No se pudo crear el video. No se te cobró." }, 500);
  }
});
