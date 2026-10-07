// SUPERNOVA — Modelar UNA lámina de un carrusel (06-oct-2026, pedido de Jean: "lámina por lámina").
//
// { image_url, n, clone_id?, context?, brief, handle?, world?, line? } → usuario real + cobro ANTES de
// gastar (model_slide en credit_prices) → baja ESA lámina del CDN de Instagram → Gemini 3 Flash la
// MIRA y devuelve su diseño (JSON visual para recrearla casi idéntica) y la lámina modelada en español
// (mismo esquema que carousel-clone en modo "tema"). Si algo falla después de cobrar, se devuelve.
//
// Solo se aceptan imágenes del CDN de Instagram/Facebook (nada de URLs arbitrarias). La imagen se usa
// solo para el análisis: no se guarda. Si viene clone_id y es de esta persona, se anota en su fila de
// carousel_clones qué lámina modeló (para Admin → Aprendizaje).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { admin, billingHeaders, caller, charge, json, refund } from "../_shared/media.ts";
import { cleanDiseno, DISENO_RULE, DISENO_SHAPE, fillGaleria, fitAnalysis, GALERIA_RULE, SIRVE_RULE, SYSTEM, TIPOS, TIPOS_LAMINA } from "../_shared/carouselRules.ts";

const FN = "carousel-slide-model";
const MODEL = "gemini-3-flash-preview";
const MAX_IMG_BYTES = 3 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const clean = (s: unknown, n: number) => (typeof s === "string" ? s : "").replace(/\s+/g, " ").trim().slice(0, n);

function b64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Solo https y solo el CDN de Instagram/Facebook. */
function cdnUrl(v: unknown): URL | null {
  try {
    const u = new URL(String(v ?? "").trim());
    const h = u.hostname.toLowerCase();
    return u.protocol === "https:" && !u.username && !u.password && (h.endsWith(".cdninstagram.com") || h.endsWith(".fbcdn.net")) ? u : null;
  } catch { return null; }
}

/**
 * Baja la lámina. Las redirecciones se siguen a mano (máximo 3) y CADA salto se valida contra el CDN
 * ANTES de pedirlo (anti-SSRF: con redirect automático el servidor ya habría tocado el host ajeno).
 * El cuerpo se lee por partes y se corta al pasar MAX_IMG_BYTES (no se confía en content-length).
 */
async function download(start: URL): Promise<string | null> {
  try {
    const signal = AbortSignal.timeout(15_000);
    let u: URL | null = start;
    let r: Response | null = null;
    for (let hop = 0; hop <= 3 && u; hop++) {
      r = await fetch(u, { redirect: "manual", signal });
      if (r.status < 300 || r.status >= 400) break;
      const loc = r.headers.get("location");
      await r.body?.cancel();
      u = loc ? cdnUrl(new URL(loc, u).href) : null; // el siguiente salto también debe ser el CDN
      r = null;
    }
    if (!r) return null;
    const type = (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const declared = Number(r.headers.get("content-length") ?? "0");
    if (!r.ok || !r.body || !/^image\/(jpeg|png|webp)$/.test(type) || declared > MAX_IMG_BYTES) { await r.body?.cancel(); return null; }
    const reader = r.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_IMG_BYTES) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    if (!total) return null;
    const bytes = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { bytes.set(c, off); off += c.byteLength; }
    return `data:${type};base64,${b64(bytes)}`;
  } catch { return null; }
}

const LAMINA_SHAPE = (n: number) => `{"tipo":"galeria","peso":"","etiqueta":"","titulo":"","texto":"","items":[{"titulo":"","texto":""}],"veredicto":"","puente":"","palabra":"","pastilla":"","escena":"","original":${n}}`;

function userPrompt(o: { n: number; ctx: Record<string, string>; brief: Record<string, string>; handle: string; world: string; line: string }): string {
  return [
    `Te paso UNA lámina de un carrusel de Instagram que ya funciona: es la lámina ${o.n} del original${o.n === 1 ? " (su portada)" : ""}.`,
    o.ctx.resumen ? `De qué trata el carrusel: ${o.ctx.resumen}` : "",
    o.ctx.gancho_original ? `Gancho de su portada: «${o.ctx.gancho_original}»` : "",
    o.ctx.idea ? `Idea de esta lámina: ${o.ctx.idea}` : "",
    o.ctx.pie ? `Pie de la publicación (solo para entender el tema; NO lo copies): """${o.ctx.pie}"""` : "",
    "",
    "PASO 1 · DISEÑO. Describe ESTA lámina tal como se ve, en 'diseno'.",
    DISENO_RULE,
    "",
    "PASO 2 · TU LÁMINA MODELADA EN ESPAÑOL (ESPEJO, Jean: \"debe parecerse al 97 % a lo que ya funcionó\"). Escribe UNA lámina que sea el espejo de esta: el MISMO tema, la MISMA idea, el MISMO tipo de contenido, la MISMA composición y el MISMO remate. Si está en otro idioma, transcréala fiel (la misma idea y el mismo remate, en español latino natural); si ya está en español, conserva su estructura y casi sus mismas palabras con un toque propio, nunca idéntica. No reinventes nada.",
    o.n === 1 ? "Es la portada: titulo = su gancho transcreado (hasta 9 palabras), texto = su subtítulo si tiene, pastilla en MAYÚSCULAS si tiene; el tipo es el que más se parezca a cómo está armada (galeria si es una cuadrícula)." : "",
    GALERIA_RULE,
    SIRVE_RULE,
    "",
    TIPOS_LAMINA,
    "",
    "El producto de la persona NO cambia el tema: como mucho aparece en el remate si la lámina es un llamado y encaja.",
    o.brief.product ? `PRODUCTO: ${o.brief.product}.` : "",
    o.brief.who ? `PÚBLICO: ${o.brief.who}.` : "",
    o.brief.promise ? `LO QUE LOGRA: ${o.brief.promise}.` : "",
    o.brief.price ? `PRECIO REAL: ${o.brief.price}.` : "",
    o.handle ? `CUENTA: @${o.handle}.` : "",
    o.line ? `FRASE DE LA MARCA (úsala tal cual si la lámina es el remate): «${o.line}».` : "",
    o.world ? `MUNDO DE LA MARCA (todas las escenas ocurren aquí): ${o.world}.` : "",
    "",
    "RESPONDE SOLO con JSON válido con esta forma:",
    `{"diseno":${DISENO_SHAPE},"lamina":${LAMINA_SHAPE(o.n)}}`,
    `'lamina.original' = ${o.n}. 'lamina.tipo' es uno de: ${TIPOS.join(", ")}.`,
  ].filter(Boolean).join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
  let txId: string | null = null;
  try {
    const who = await caller(req);
    if (!who) return json({ error: "Inicia sesión para usar esta función." }, 401);
    const raw = await req.text();
    if (raw.length > 8000) return json({ error: "La solicitud es demasiado grande." }, 413);
    let body: Record<string, unknown> = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { return json({ error: "Solicitud inválida." }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Solicitud inválida." }, 400);

    const img = cdnUrl(body.image_url);
    if (!img) return json({ error: "Esa imagen no es de una lámina de Instagram." }, 400);
    const n = Math.round(Number(body.n));
    if (!Number.isFinite(n) || n < 1 || n > 20) return json({ error: "Falta el número de la lámina." }, 400);
    const cloneId = typeof body.clone_id === "string" && UUID_RE.test(body.clone_id) ? body.clone_id : null;
    const c = body.context && typeof body.context === "object" ? body.context as Record<string, unknown> : {};
    const ctx = { resumen: clean(c.resumen, 300), gancho_original: clean(c.gancho_original, 200), idea: clean(c.idea, 300), pie: clean(c.pie, 1200) };
    const b = body.brief && typeof body.brief === "object" ? body.brief as Record<string, unknown> : {};
    const brief = { product: clean(b.product, 200), who: clean(b.who, 200), promise: clean(b.promise, 200), price: clean(b.price, 30) };
    if (brief.product.length < 3) return json({ error: "Falta tu producto." }, 400);
    const handle = clean(body.handle, 30).replace(/[^A-Za-z0-9._]/g, "");
    const world = clean(body.world, 160);
    const line = clean(body.line, 80);
    const gemini = Deno.env.get("GEMINI_API_KEY");
    if (!gemini) return json({ error: "Esta función llega pronto.", pronto: true }, 503);

    const g = await charge(FN, who.id, "model_slide", `Modelar lámina · ${n}`, 20, 60);
    if (g instanceof Response) return g;
    txId = g.txId;

    // 1) Bajar la lámina (solo para el análisis; no se guarda).
    const dataUrl = await download(img);
    if (!dataUrl) {
      await refund(txId, "no bajó la lámina");
      return json({ error: "No pudimos leer esa lámina. No se te cobró." }, 502);
    }

    // 2) Diseño + lámina modelada.
    const ai = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${gemini}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL, max_tokens: 8_000, response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: [{ type: "text", text: userPrompt({ n, ctx, brief, handle, world, line }) }, { type: "image_url", image_url: { url: dataUrl } }] },
        ],
      }),
      signal: AbortSignal.timeout(80_000),
    });
    if (!ai.ok) {
      console.error(`${FN}: gemini`, ai.status, (await ai.text()).slice(0, 300));
      await refund(txId, `gemini ${ai.status}`);
      return json({ error: "La IA no pudo modelar la lámina ahora. No se te cobró: inténtalo de nuevo." }, 502);
    }
    const out = await ai.json();
    const text = out?.choices?.[0]?.message?.content;
    const usage = out?.usage ?? {};
    const db = admin();
    await db.rpc("log_ai_usage", { p_user_id: who.id, p_fn: FN, p_model: MODEL, p_input: usage.prompt_tokens ?? 0, p_output: usage.completion_tokens ?? 0, p_images: 0 });
    let parsed: Record<string, unknown> | null = null;
    try { parsed = typeof text === "string" ? JSON.parse(text.replace(/```(?:json)?/gi, "").trim()) : null; } catch { parsed = null; }
    const diseno = cleanDiseno(parsed?.diseno);
    const rawLam = parsed?.lamina && typeof parsed.lamina === "object" && !Array.isArray(parsed.lamina) ? parsed.lamina as Record<string, unknown> : null;
    if (!diseno || !rawLam || !TIPOS.includes(String(rawLam.tipo))) {
      await refund(txId, "json inválido");
      return json({ error: "La IA respondió en un formato raro. No se te cobró: inténtalo de nuevo." }, 502);
    }
    const lamina = fillGaleria({ ...rawLam, original: n }, diseno);

    // 3) Registro para el admin: solo si el clon es de esta persona. Nunca rompe la respuesta.
    if (cloneId) {
      try {
        const { data: row } = await db.from("carousel_clones").select("user_id, analysis").eq("id", cloneId).maybeSingle();
        if (row && row.user_id === who.id) {
          const an = (row.analysis && typeof row.analysis === "object" ? row.analysis : {}) as Record<string, unknown>;
          const prev = Array.isArray(an.modelados) ? an.modelados as unknown[] : [];
          const entry = { n, at: new Date().toISOString(), tipo: clean(lamina.tipo, 20), titulo: clean(lamina.titulo, 120) };
          const next = fitAnalysis({ ...an, modelados: [...prev, entry].slice(-20) } as { laminas?: unknown[] });
          const { error } = await db.from("carousel_clones").update({ analysis: next }).eq("id", cloneId).eq("user_id", who.id);
          if (error) console.error(`${FN}: registro`, error.message);
        }
      } catch (e) { console.error(`${FN}: registro`, e instanceof Error ? e.message : "error"); }
    }

    return json({ diseno, lamina, billing: { charged: g.charged, balance: g.balance } }, 200, billingHeaders(g));
  } catch (e) {
    await refund(txId, "excepción");
    console.error(`${FN}:`, e instanceof Error ? e.message : "error");
    return json({ error: "No se pudo modelar la lámina. No se te cobró." }, 500);
  }
});
