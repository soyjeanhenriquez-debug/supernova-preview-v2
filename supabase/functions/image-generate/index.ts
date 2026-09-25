// SUPERNOVA — Foto del personaje con el catálogo de imágenes de fal.ai (media_models kind='image').
//
// { model_id, prompt, product_id } → modelo y plan (servidor) → cobro → fal (síncrono) → el servidor
// descarga la imagen y la guarda en el bucket privado "personajes/{user_id}/{product_id}/…" →
// devuelve la ruta. Si algo falla después de cobrar, devuelve el crédito. Filtros de contenido de
// fal encendidos (nada NSFW).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { FAL_KEY, admin, billingHeaders, caller, charge, fal, json, logCost, pickModel, refund } from "../_shared/media.ts";

const FN = "image-generate";
const MAX_BYTES = 10 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let txId: string | null = null;
  try {
    const who = await caller(req);
    if (!who) return json({ error: "Inicia sesión para usar esta función." }, 401);
    const raw = await req.text();
    if (raw.length > 6000) return json({ error: "La solicitud es demasiado grande." }, 413);
    const body = raw ? JSON.parse(raw) : {};
    const prompt = String(body.prompt ?? "").trim().slice(0, 1800);
    const productId = typeof body.product_id === "string" && /^[0-9a-f-]{36}$/i.test(body.product_id) ? body.product_id : null;
    if (!prompt) return json({ error: "Describe la foto." }, 400);
    if (!productId) return json({ error: "Falta el producto." }, 400);
    if (!FAL_KEY) return json({ error: "Llega pronto.", pronto: true }, 503);

    const m = await pickModel(body.model_id, "image", who);
    if (m instanceof Response) return m;

    const g = await charge(FN, who.id, m.action, `${m.label} · ${prompt.slice(0, 50)}`, 20, 60);
    if (g instanceof Response) return g;
    txId = g.txId;

    const r = await fal(`https://fal.run/${m.endpoint}`, { method: "POST", body: JSON.stringify({ ...m.input, prompt }) });
    if (!r.ok) {
      console.error("fal:", m.endpoint, r.status, (await r.text()).slice(0, 300));
      await refund(txId, `fal ${r.status}`);
      return json({ error: r.status === 422 ? "El generador rechazó la descripción. Te devolvimos los créditos." : "El generador de imágenes no está disponible ahora. Te devolvimos los créditos." }, 503);
    }
    const out = await r.json();
    await logCost(who.id, FN, m); // fal cobra la imagen aunque después la bloquee el filtro
    const url = out?.images?.[0]?.url as string | undefined;
    // Algunos modelos marcan la imagen bloqueada por el filtro de contenido en vez de fallar.
    const flagged = Array.isArray(out?.has_nsfw_concepts) && out.has_nsfw_concepts[0] === true;
    if (!url || flagged) {
      await refund(txId, flagged ? "filtro de contenido" : "sin imagen");
      return json({ error: flagged ? "El filtro de contenido bloqueó esa imagen. Te devolvimos los créditos." : "No llegó la imagen. Te devolvimos los créditos." }, 502);
    }

    const img = await fetch(url);
    const type = img.headers.get("content-type") ?? "image/jpeg";
    const bytes = new Uint8Array(await img.arrayBuffer());
    if (!img.ok || bytes.byteLength > MAX_BYTES || !/^image\/(jpeg|png|webp)$/.test(type)) {
      await refund(txId, "descarga");
      return json({ error: "No se pudo guardar la imagen. Te devolvimos los créditos." }, 502);
    }
    const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
    const path = `${who.id}/${productId}/${Date.now()}-${m.id}.${ext}`;
    const up = await admin().storage.from("personajes").upload(path, bytes, { contentType: type, upsert: false });
    if (up.error) {
      await refund(txId, "storage");
      return json({ error: "No se pudo guardar la imagen. Te devolvimos los créditos." }, 500);
    }
    return json({ path, model: m.id, billing: { charged: g.charged, balance: g.balance } }, 200, billingHeaders(g));
  } catch (e) {
    await refund(txId, "excepción");
    console.error("image-generate:", e);
    return json({ error: "No se pudo crear la imagen. No se te cobró." }, 500);
  }
});
