// SUPERNOVA — Enriquecimiento IA de la capa de ofertas (producto-primero).
//
// Toma ofertas sin enriquecer (offers.enriched_at IS NULL) y en UNA llamada a
// Gemini por lote de 20 obtiene: nombre del producto, nicho (taxonomía fija),
// tipo de oferta, modelo de negocio, idioma real del anuncio (el `market` es
// dónde LLEGÓ el anuncio, no su idioma), precio si se menciona, mecanismo,
// por qué gana, para quién y copy_score (1-5: replicable por un emprendedor
// solo como producto digital / mini app).
//
// Cola por GRUPO de mercado (ES/BR/US/RU) priorizando lang_guess = idioma
// del grupo: el top por score de cada país lo dominan anunciantes globales
// en inglés, y gastar la IA ahí no sirve para los picks del grupo.
//
// verify_jwt false (la invoca pg_cron) + compuerta interna: secreto de cron o
// admin con sesión. Solo escribe contenido derivado con service_role.
// Idempotente: procesa solo pendientes.
// Body opcional: { batches?: 1-4 (default 2), group?: "ES"|"BR"|"US"|"RU", markets?: string[] }
// Lotes cortos a propósito: 4×25 por invocación excedía el CPU del worker.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// ── Compuerta interna ───────────────────────────────────────────────────
// Esta función corre sin JWT porque la invoca pg_cron. Solo pasa quien trae el
// secreto de cron (vive en Vault y se compara DENTRO de la base: aquí nunca se
// conoce) o un admin con sesión. Sin esto, cualquiera con la URL la ejecutaba.
// deno-lint-ignore no-explicit-any
async function authorizeInternal(req: Request, admin: any): Promise<boolean> {
  const secret = req.headers.get("x-cron-secret");
  if (secret) {
    const { data } = await admin.rpc("verify_cron_secret", { p_secret: secret });
    if (data === true) return true;
  }
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (token) {
    const { data } = await admin.auth.getUser(token);
    const uid = data?.user?.id;
    if (uid) {
      const { data: role } = await admin.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
      if (role) return true;
    }
  }
  return false;
}

const BATCH_SIZE = 20;
const MAX_BATCHES = 4;

const GROUPS: Record<string, { markets: string[]; lang: string }> = {
  ES: { markets: ["ES", "MX", "AR", "CO"], lang: "es" },
  BR: { markets: ["BR", "PT"], lang: "pt" },
  US: { markets: ["US", "GB"], lang: "en" },
  RU: { markets: ["RU", "KZ"], lang: "ru" },
};
const GROUP_ORDER = ["ES", "BR", "US", "RU"];
const langForMarket = (m: string) => Object.values(GROUPS).find((g) => g.markets.includes(m))?.lang ?? null;

export const NICHES = [
  "salud_fitness", "dinero_negocios", "marketing_ventas", "desarrollo_personal", "relaciones",
  "educacion_idiomas", "tecnologia_ia", "belleza_moda", "hogar_mascotas", "espiritualidad",
  "infantil_familia", "gastronomia_recetas", "inmobiliaria", "finanzas_trading", "software_saas",
  "servicios_locales", "entretenimiento", "viajes", "otro",
] as const;
const OFFER_TYPES = ["infoproducto", "ecommerce", "saas_app", "servicio", "comunidad", "evento", "otro"] as const;
const MODELS = ["pago_unico", "suscripcion", "freemium", "lead_gratis", "otro"] as const;

interface Enriched {
  index: number;
  product_name?: string;
  niche?: string;
  offer_type?: string;
  business_model?: string;
  language?: string;
  price_hint?: string | null;
  mechanism?: string;
  why_wins?: string;
  target_audience?: string;
  copy_score?: number;
}

interface Row {
  id: string; page_name: string | null; market: string; sample_title: string | null; sample_body: string | null;
  ads_count: number; active_ads: number; days_active: number; winner_score: number; enrich_attempts: number;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const apiKey = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return json({ error: "Missing GEMINI_API_KEY" }, 500);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (!(await authorizeInternal(req, admin))) return json({ error: "No autorizado" }, 401);

  const body = (await req.json().catch(() => ({}))) as { batches?: number; group?: string; markets?: string[]; diag?: boolean };

  // Diagnóstico: qué modelos ve esta llave (Google retira modelos sin aviso)
  if (body.diag) {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/models", { headers: { Authorization: `Bearer ${apiKey}` } });
    const d = await r.json().catch(() => ({}));
    const ids = ((d?.data ?? []) as Array<{ id: string }>).map((m) => m.id).filter((id) => /flash|pro/i.test(id));
    return json({ status: r.status, models: ids });
  }
  const batches = Math.min(MAX_BATCHES, Math.max(1, Number(body.batches) || 2));

  // Objetivo: grupo pedido, mercados pedidos, o rotación por hora (cron)
  let markets: string[];
  let lang: string | null;
  let explicit = true;
  if (body.group && GROUPS[body.group.toUpperCase()]) {
    ({ markets, lang } = GROUPS[body.group.toUpperCase()]);
  } else if (Array.isArray(body.markets) && body.markets.length > 0) {
    markets = body.markets.map((m) => String(m).toUpperCase()).slice(0, 20);
    lang = langForMarket(markets[0]);
  } else {
    explicit = false;
    ({ markets, lang } = GROUPS[GROUP_ORDER[new Date().getUTCHours() % GROUP_ORDER.length]]);
  }

  // prompt/completion/total_tokens: uso REAL reportado por la API → costo medible
  const summary: { group_markets: string[]; lang: string | null; model?: string; batches_done: number; enriched: number; failed: number; prompt_tokens: number; completion_tokens: number; total_tokens: number; ai_calls: number; write_errors: number; note: string } =
    { group_markets: markets, lang, batches_done: 0, enriched: 0, failed: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, ai_calls: 0, write_errors: 0, note: "" };

  const pending = async (mk: string[] | null, langFilter: "match" | "other" | "any", exclude: string[]): Promise<Row[]> => {
    let q = admin
      .from("offers")
      .select("id, page_name, market, sample_title, sample_body, ads_count, active_ads, days_active, winner_score, enrich_attempts")
      .is("enriched_at", null)
      .eq("enrich_failed", false)
      // Prefiltro (flag_excluded_offers): adultos y apps de dramas/novelas no
      // gastan tokens — además eran las fichas que el modelo omitía y que
      // arrastraban a sus vecinas de lote hacia el descarte.
      .is("excluded_reason", null)
      .not("sample_body", "is", null)
      .order("winner_score", { ascending: false })
      .order("active_ads", { ascending: false })
      .limit(BATCH_SIZE);
    if (mk) q = q.in("market", mk);
    if (lang && langFilter === "match") q = q.eq("lang_guess", lang);
    if (lang && langFilter === "other") q = q.or(`lang_guess.is.null,lang_guess.neq.${lang}`);
    if (exclude.length) q = q.not("id", "in", `(${exclude.join(",")})`);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as Row[];
  };

  type AiResult = { kind: "ok"; map: Map<number, Enriched> } | { kind: "quota" } | { kind: "fail"; note: string };

  // Una llamada a Gemini para un conjunto de filas. Los tokens se suman SIEMPRE
  // (también en reintentos) para que el costo reportado sea el real.
  const callAI = async (rows: Row[]): Promise<AiResult> => {
    const items = rows.map((r, i) => ({
      index: i,
      advertiser: (r.page_name ?? "").slice(0, 80),
      reached_market: r.market,
      title: (r.sample_title ?? "").slice(0, 150),
      body: (r.sample_body ?? "").slice(0, 600),
      active_ads: r.active_ads,
      days_active: r.days_active,
    }));

    const system = `Eres un analista senior de direct response marketing que estudia anuncios ganadores reales de Meta Ads Library para emprendedores de LATAM que quieren replicar productos digitales que ya venden. Devuelves SOLO un objeto JSON válido con la forma {"items": [...]}, sin markdown ni preámbulos.`;
    const userPrompt = `Para cada anuncio ganador del array, devuelve un objeto con:
- "index": índice del anuncio.
- "product_name": nombre del producto/oferta si se deduce del anuncio (en su idioma original, máx 60 caracteres). Si no se deduce, usa el nombre del anunciante.
- "niche": exactamente uno de: ${NICHES.join(", ")}.
- "offer_type": exactamente uno de: ${OFFER_TYPES.join(", ")}. (infoproducto = curso/ebook/método/mentoría/webinar; saas_app = software, app móvil, plataforma; ecommerce = producto físico; servicio = agencia/consultoría/servicio profesional; comunidad = membresía/grupo; evento = evento en vivo.)
- "business_model": exactamente uno de: ${MODELS.join(", ")}. (lead_gratis = el anuncio regala algo para captar el contacto.)
- "language": código ISO del IDIOMA DEL TEXTO del anuncio (es, pt, en, de, ru, pl, fr, it...). NO el país donde llegó.
- "price_hint": precio mencionado tal cual con moneda (ej. "R$ 97", "$27/mes", "19,90 €") o null si no aparece.
- "mechanism": en ESPAÑOL, máx 120 caracteres: el mecanismo/promesa central de la oferta.
- "why_wins": en ESPAÑOL, máx 140 caracteres: por qué este anuncio convierte (ángulo, gancho, prueba, urgencia...).
- "target_audience": en ESPAÑOL, máx 80 caracteres: para quién es.
- "copy_score": entero 1-5. Qué tan replicable es como PRODUCTO DIGITAL o MINI APP por un emprendedor solo con poco capital: 5 = infoproducto/plantilla/mini app de nicho claramente copiable (quiz + plan, desafío de 7 días, guía, curso corto, herramienta simple); 3 = requiere cierta inversión, equipo o marca; 1-2 = NO replicable: apps de lectura de novelas, dramas cortos, juegos móviles, apps con cientos de anuncios activos, marcas globales, producto físico con logística. Sé estricto: si dudas entre 4 y 2, pon 2.

Responde SOLO con un objeto JSON: {"items": [ {...}, {...} ]} — un objeto por anuncio.

ANUNCIOS:
${JSON.stringify(items)}`;

    // Cadena de modelos: cada uno tiene cuota propia y Google retira
    // modelos (404 "no longer available"); ante 404/429/5xx se pasa al
    // siguiente. Solo si TODOS fallan se corta la corrida.
    // LITE PRIMERO: el saldo prepago de Gemini es compartido con las acciones
    // de los usuarios (si llega a 0, toda la IA de la app se detiene). Los lite
    // ya probaron calidad suficiente para fichar ofertas y cuestan ~2.5-3x menos
    // (3.1-flash-lite $0.25/$1.50 por 1M vs 3.8-flash $0.75/$3.75; medido:
    // ~$0.0044 por lote de 20, sin tokens de razonamiento facturados aparte).
    const MODELS_TRY = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.8-flash", "gemini-3-flash-preview"];
    let aiRes: Response | null = null;
    let lastStatus = 0;
    for (let attempt = 0; attempt < MODELS_TRY.length && !aiRes; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 75_000);
      try {
        const r = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODELS_TRY[attempt],
            max_tokens: 8192, // 20 fichas × 10 campos; el cirílico gasta más tokens
            response_format: { type: "json_object" },
            messages: [{ role: "system", content: system }, { role: "user", content: userPrompt }],
          }),
          signal: ctrl.signal,
        });
        lastStatus = r.status;
        if ([404, 429, 500, 502, 503, 504].includes(r.status) && attempt < MODELS_TRY.length - 1) {
          await r.text();
          await new Promise((res) => setTimeout(res, 1500));
          continue;
        }
        aiRes = r;
        summary.model = MODELS_TRY[attempt];
      } catch (err) {
        if (attempt === MODELS_TRY.length - 1) throw err;
      } finally {
        clearTimeout(timer);
      }
    }
    if (!aiRes) return { kind: "fail", note: `IA no disponible tras reintentos (último status ${lastStatus})` };
    if (aiRes.status === 429) return { kind: "quota" };
    if (!aiRes.ok) return { kind: "fail", note: `AI error ${aiRes.status}: ${(await aiRes.text()).slice(0, 200)}` };

    const aiData = await aiRes.json();
    summary.prompt_tokens += Number(aiData?.usage?.prompt_tokens) || 0;
    summary.completion_tokens += Number(aiData?.usage?.completion_tokens) || 0;
    summary.total_tokens += Number(aiData?.usage?.total_tokens) || 0;
    summary.ai_calls += 1;
    // Costo real (tabla ai_usage). Trabajo de fondo: sin usuario. Salida = total − entrada,
    // para contar también el razonamiento, que se cobra. Si falla, la corrida sigue.
    if (aiData?.usage) {
      const input = Number(aiData.usage.prompt_tokens) || 0;
      const output = Math.max(Number(aiData.usage.completion_tokens) || 0, (Number(aiData.usage.total_tokens) || 0) - input);
      try {
        const { error: logErr } = await admin.rpc("log_ai_usage", { p_user_id: null, p_fn: "enrich-offers", p_model: summary.model ?? "desconocido", p_input: input, p_output: output, p_images: 0 });
        if (logErr) console.error("log_ai_usage:", logErr.message);
      } catch (e) { console.error("log_ai_usage:", e instanceof Error ? e.message : e); }
    }
    const content: string = aiData?.choices?.[0]?.message?.content ?? "";

    // Parseo defensivo: objeto {"items":[...]} (o array, por si el modelo
    // ignora la forma) y, si la salida vino truncada, rescatar hasta el
    // último objeto completo (el resto vuelve a la cola).
    let parsed: Enriched[] = [];
    const cleaned = content.replace(/```json?/g, "").replace(/```/g, "").trim();
    const asArray = (v: unknown): Enriched[] =>
      Array.isArray(v) ? v as Enriched[] : (v && typeof v === "object" && Array.isArray((v as { items?: unknown }).items) ? (v as { items: Enriched[] }).items : []);
    try {
      parsed = asArray(JSON.parse(cleaned));
    } catch {
      const start = cleaned.indexOf("[");
      const lastObj = cleaned.lastIndexOf("}");
      try {
        parsed = start >= 0 && lastObj > start ? asArray(JSON.parse(cleaned.slice(start, lastObj + 1) + "]")) : [];
      } catch { /* sin rescate posible */ }
    }
    if (parsed.length === 0) return { kind: "fail", note: `Respuesta no parseable: ${content.slice(0, 120)}` };
    const map = new Map<number, Enriched>();
    for (const e of parsed) if (typeof e?.index === "number") map.set(e.index, e);
    return { kind: "ok", map };
  };

  const pick = <T extends readonly string[]>(v: unknown, allowed: T, fallback: T[number]) =>
    typeof v === "string" && (allowed as readonly string[]).includes(v) ? v : fallback;
  const clip = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

  // Suma un intento fallido; al tercero la ficha sale de la cola.
  const bumpAttempts = async (rows: Row[]) => {
    await Promise.all(rows.map((r) => {
      const attempts = (r.enrich_attempts ?? 0) + 1;
      return admin.from("offers").update({ enrich_attempts: attempts, enrich_failed: attempts >= 3 }).eq("id", r.id);
    }));
    summary.failed += rows.length;
  };

  // Guarda las fichas devueltas y DEVUELVE las omitidas sin penalizarlas:
  // quien llama decide si merecen reintento aislado o un intento fallido.
  const persist = async (rows: Row[], map: Map<number, Enriched>): Promise<Row[]> => {
    const omitted: Row[] = [];
    await Promise.all(rows.map(async (r, i) => {
      const e = map.get(i);
      if (!e) { omitted.push(r); return; }
      const copy = Number(e.copy_score);
      const { error } = await admin.from("offers").update({
        product_name: clip(e.product_name, 80) ?? r.page_name,
        niche: pick(e.niche, NICHES, "otro"),
        offer_type: pick(e.offer_type, OFFER_TYPES, "otro"),
        business_model: pick(e.business_model, MODELS, "otro"),
        language: clip(e.language, 8)?.toLowerCase() ?? null,
        price_hint: clip(e.price_hint, 40),
        mechanism: clip(e.mechanism, 160),
        why_wins: clip(e.why_wins, 180),
        target_audience: clip(e.target_audience, 120),
        copy_score: Number.isFinite(copy) ? Math.min(5, Math.max(1, Math.round(copy))) : null,
        enriched_at: new Date().toISOString(),
      }).eq("id", r.id);
      // Un fallo de escritura NO es una omisión del modelo: no se reenvía a la
      // IA ni suma intento. La fila sigue pendiente y entra en otra corrida.
      if (error) summary.write_errors += 1; else summary.enriched += 1;
    }));
    return omitted;
  };

  try {
    for (let b = 0; b < batches; b++) {
      // 1) Cola: primero idioma del grupo, luego el resto del grupo, y si el
      //    grupo se agotó (solo en modo cron), cualquier pendiente.
      let rows = await pending(markets, "match", []);
      if (rows.length < BATCH_SIZE) {
        const more = await pending(markets, "other", rows.map((r) => r.id));
        rows = [...rows, ...more].slice(0, BATCH_SIZE);
      }
      if (rows.length === 0 && !explicit) rows = await pending(null, "any", []);
      if (rows.length === 0) { summary.note = "Sin pendientes"; break; }

      // 2) Lote completo
      const first = await callAI(rows);
      if (first.kind === "quota") { summary.note = "Cuota de IA agotada en todos los modelos (429); reintentar más tarde"; break; }

      if (first.kind === "ok") {
        // 3a) Fichas omitidas: UN reintento aislado antes de contarles un fallo.
        //     Así una ficha que el modelo bloquea no arrastra a sus vecinas.
        const omitted = await persist(rows, first.map);
        if (omitted.length > 0) {
          const retry = await callAI(omitted);
          if (retry.kind === "quota") { summary.note = "Cuota de IA agotada durante un reintento"; break; }
          await bumpAttempts(retry.kind === "ok" ? await persist(omitted, retry.map) : omitted);
        }
      } else {
        // 3b) Lote ilegible entero: antes se salía sin registrar nada y la
        //     cabeza de la cola quedaba bloqueada para siempre. Se parte en dos
        //     mitades; la mitad que vuelva a fallar suma un intento.
        summary.note = first.note;
        const mid = Math.ceil(rows.length / 2);
        let quota = false;
        for (const half of [rows.slice(0, mid), rows.slice(mid)]) {
          if (half.length === 0) continue;
          const r2 = await callAI(half);
          if (r2.kind === "quota") { quota = true; break; }
          await bumpAttempts(r2.kind === "ok" ? await persist(half, r2.map) : half);
        }
        if (quota) { summary.note = "Cuota de IA agotada durante la división del lote"; break; }
      }
      summary.batches_done += 1;
    }

    return json(summary);
  } catch (e) {
    return json({ ...summary, error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
