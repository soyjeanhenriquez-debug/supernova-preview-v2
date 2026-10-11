// SUPERNOVA — Mini Apps Rentables: genera un KIT completo (negocio digital
// listo para copiar y cobrar) a partir de una oferta real que está pagando
// anuncios ahora mismo. Es la versión automatizada de "2 mini apps nuevas
// cada semana": corre por cron lunes y jueves (un kit por corrida), o la
// lanza un admin para sembrar.
//
// Nunca repetidas: no reutiliza una oferta NI un anunciante que ya tenga kit
// (el mismo anunciante en otro país es el mismo producto). Fuente preferida:
// las ganadoras curadas (offers.is_winner) — prueba real de ≥30 días y ≥3
// anuncios, solo tipos digitales. Si se agotan, cae al catálogo copiable.
//
// Contenido privado (se desbloquea con créditos vía unlock_kit): blueprint,
// mega-prompt para construir la mini app, guion WhatsApp, guion VSL, 3 anuncios,
// copy de landing, 5 hooks y precios sugeridos por país.
//
// verify_jwt false (la invoca pg_cron) + compuerta interna: secreto de cron o
// admin con sesión. Escribe con service_role.
// Body opcional: { count?: 1-3, offer_id?: string, niche?: string, group?: "ES"|"BR"|"US"|"RU" }
import { createClient } from "npm:@supabase/supabase-js@2.117.1";

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

// Lo que trae cada kit (mismas 8 secciones que muestra la app al abrirlo).
const KIT_INSIDE = [
  "Por qué funciona y cómo lanzarlo", "Instrucciones para crear tu mini app con IA", "Guion de venta por WhatsApp",
  "Guion de video de ventas (90 s)", "3 anuncios para Meta", "Texto de tu página de ventas", "5 ganchos para videos", "Precios por país",
];

const KIT_SYSTEM = `Eres un estratega senior de direct response marketing y product builder. Conviertes una oferta que YA está vendiendo (probada con dinero real en Meta Ads) en un NEGOCIO DIGITAL LISTO PARA COPIAR por un emprendedor de LATAM que cobra en su moneda. Escribes en español neutro, directo, sin relleno, con el estilo de un copywriter de respuesta directa. Devuelves SOLO un objeto JSON válido (sin markdown alrededor). Dentro de los campos de texto puedes usar markdown.
REGLAS QUE NO SE ROMPEN (manual de SUPERNOVA): nunca prometas ingresos, ganancias, cifras de dinero ("gana $500/mes"), plazos ("en 7 días", "en 48 horas"), resultados de salud o físicos (bajar de peso, quemar grasa, curar), riqueza o "abundancia" garantizada, ni "sin riesgo". No digas que algo "factura", está "validado", "probado" o es de "alta conversión": la única prueba es el tiempo pagando anuncios y eso ya lo muestra la app. En finanzas, inversión o cripto: es educación, no asesoría ni promesa de ganancia. En salud: bienestar general, no reemplaza al médico. Nunca inventes prueba social ni cifras de clientes ("más de 4.000 personas", testimonios): deja un espacio [TUS RESULTADOS REALES] para que el emprendedor ponga los suyos. Garantía solo como reembolso simple ("si no te sirve, te devuelvo tu dinero en 7 días"), nunca atada a un resultado ("si en 48 horas no notas..."). Esto vale también para los anuncios, ganchos, guiones y la landing del kit.`;

const LANG_TO_GROUP: Record<string, string> = { es: "ES", pt: "BR", en: "US", ru: "RU" };
// De mejor a peor; los lite al final: tienen cuota propia más amplia en el
// tier gratuito y sostienen la generación cuando los grandes agotan la suya.
const MODELS_TRY = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3-flash-preview", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];

const EMOJI_BY_NICHE: Record<string, string> = {
  salud_fitness: "💪", dinero_negocios: "💰", marketing_ventas: "📣", desarrollo_personal: "🧠", relaciones: "❤️",
  educacion_idiomas: "🎓", tecnologia_ia: "🤖", belleza_moda: "💄", hogar_mascotas: "🐾", espiritualidad: "🔮",
  infantil_familia: "👶", gastronomia_recetas: "🍳", inmobiliaria: "🏠", finanzas_trading: "📈", software_saas: "🧩",
  servicios_locales: "📍", entretenimiento: "🎬", viajes: "✈️", otro: "✨",
};

interface OfferRow {
  id: string; page_id: string | null; page_name: string | null; market: string; product_name: string | null; niche: string | null;
  offer_type: string | null; business_model: string | null; language: string | null; price_hint: string | null;
  mechanism: string | null; why_wins: string | null; target_audience: string | null; copy_score: number | null;
  sample_title: string | null; sample_body: string | null; days_active: number; active_ads: number; winner_score: number;
}

// Una llamada a Gemini con respaldo de modelos (para el modo "reescribir").
// deno-lint-ignore no-explicit-any
async function askGemini(apiKey: string, system: string, user: string): Promise<{ data: any; model: string } | { error: string }> {
  let last = "";
  for (const model of MODELS_TRY) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120_000);
    try {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 16000, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
        signal: ctrl.signal,
      });
      if (r.ok) return { data: await r.json(), model };
      last = `AI ${r.status}: ${(await r.text()).slice(0, 160)}`;
      if (![404, 429, 500, 502, 503, 504].includes(r.status)) break;
      await new Promise((res) => setTimeout(res, 2000));
    } catch (e) {
      last = e instanceof Error ? e.message : "fallo de red";
    } finally {
      clearTimeout(timer);
    }
  }
  return { error: last || "Sin respuesta" };
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function slugify(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const apiKey = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return json({ error: "Missing GEMINI_API_KEY" }, 500);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (!(await authorizeInternal(req, admin))) return json({ error: "No autorizado" }, 401);

  const body = (await req.json().catch(() => ({}))) as { count?: number; offer_id?: string; niche?: string; group?: string; rewrite_kit_id?: string };

  // Modo "reescribir" (11-oct-2026): limpia un kit ya publicado con las reglas de KIT_SYSTEM
  // (sin promesas, sin prueba social inventada, garantía solo como reembolso). Conserva la
  // estructura, el mecanismo y los precios; no toca título, resumen ni precio en créditos.
  if (body.rewrite_kit_id) {
    const { data: kitRow } = await admin.from("mini_app_kits").select("id, title, content").eq("id", body.rewrite_kit_id).maybeSingle();
    if (!kitRow) return json({ error: "Kit no encontrado" }, 404);
    const old = (kitRow.content ?? {}) as Record<string, unknown>;
    const user = `Este es el contenido de un kit "Mini App Rentable" llamado "${kitRow.title}". Reescríbelo para que cumpla TODAS las reglas del sistema.
Conserva: la misma estructura de cada sección, el mismo mecanismo, el mismo producto, los mismos precios por país y la misma extensión aproximada. Cambia solo lo necesario: quita promesas de ingresos, plazos, resultados de salud o físicos, "garantizado", "sin riesgo", "probado", "validado", "factura", "alta conversión", cifras de clientes o testimonios inventados, y garantías atadas a resultados (déjalas como reembolso simple). Si el nombre de un método o producto contiene una promesa (ej. "48h", "Renta Garantizada"), cámbialo por uno neutro.
Devuelve un objeto JSON con EXACTAMENTE las mismas claves: blueprint, miniapp_prompt, whatsapp_script, vsl_script, ad_copies (3 objetos con headline y primary_text), landing_copy, hooks (5), pricing (mismo objeto).

CONTENIDO ACTUAL:
${JSON.stringify({ blueprint: old.blueprint, miniapp_prompt: old.miniapp_prompt, whatsapp_script: old.whatsapp_script, vsl_script: old.vsl_script, ad_copies: old.ad_copies, landing_copy: old.landing_copy, hooks: old.hooks, pricing: old.pricing })}`;
    const res = await askGemini(apiKey, KIT_SYSTEM, user);
    if ("error" in res) return json({ error: res.error }, 502);
    const u = res.data?.usage;
    if (u) {
      const input = Number(u.prompt_tokens) || 0;
      const output = Math.max(Number(u.completion_tokens) || 0, (Number(u.total_tokens) || 0) - input);
      await admin.rpc("log_ai_usage", { p_user_id: null, p_fn: "generate-kit:rewrite", p_model: res.model, p_input: input, p_output: output, p_images: 0 }).then(() => {}, () => {});
    }
    let nk: Record<string, unknown>;
    try {
      nk = JSON.parse(String(res.data?.choices?.[0]?.message?.content ?? "{}").replace(/```json?/g, "").replace(/```/g, "").trim());
    } catch { return json({ error: "JSON inválido" }, 502); }
    const s2 = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
    if (!s2(nk.blueprint, 20) || !s2(nk.miniapp_prompt, 20)) return json({ error: "Reescritura incompleta: no se guardó" }, 502);
    const content = {
      ...old,
      blueprint: s2(nk.blueprint, 12000),
      miniapp_prompt: s2(nk.miniapp_prompt, 12000),
      whatsapp_script: s2(nk.whatsapp_script, 8000) || old.whatsapp_script,
      vsl_script: s2(nk.vsl_script, 8000) || old.vsl_script,
      ad_copies: Array.isArray(nk.ad_copies) && nk.ad_copies.length ? nk.ad_copies.slice(0, 3) : old.ad_copies,
      landing_copy: s2(nk.landing_copy, 8000) || old.landing_copy,
      hooks: Array.isArray(nk.hooks) && nk.hooks.length ? nk.hooks.slice(0, 5) : old.hooks,
      pricing: typeof nk.pricing === "object" && nk.pricing ? nk.pricing : old.pricing,
      model: res.model,
      rewritten_at: new Date().toISOString(),
    };
    const { error: upErr } = await admin.from("mini_app_kits").update({ content }).eq("id", kitRow.id);
    if (upErr) return json({ error: upErr.message }, 500);
    return json({ rewritten: kitRow.id, title: kitRow.title, model: res.model });
  }
  const count = Math.min(3, Math.max(1, Number(body.count) || 1));
  const results: Array<{ kit_id?: string; title?: string; offer_id?: string; error?: string }> = [];

  try {
    // Ofertas, anunciantes, nichos y mercados ya usados → nunca repetir y variar
    // (el kit nuevo prefiere un nicho sin kit y, a igualdad, un mercado con menos).
    const { data: existing } = await admin.from("mini_app_kits").select("offer_id, niche, market_group");
    const usedOffers = new Set((existing ?? []).map((k) => k.offer_id).filter(Boolean) as string[]);
    const usedPages = new Set<string>();
    if (usedOffers.size > 0) {
      const { data: src } = await admin.from("offers").select("page_id").in("id", [...usedOffers]);
      for (const o of src ?? []) if (o.page_id) usedPages.add(o.page_id as string);
    }
    const nicheCount = new Map<string, number>();
    const groupCount = new Map<string, number>();
    for (const k of existing ?? []) {
      if (k.niche) nicheCount.set(k.niche, (nicheCount.get(k.niche) ?? 0) + 1);
      if (k.market_group) groupCount.set(k.market_group, (groupCount.get(k.market_group) ?? 0) + 1);
    }
    const groupOf = (o: OfferRow) => LANG_TO_GROUP[o.language ?? ""] ?? "ES";

    for (let n = 0; n < count; n++) {
      // 1) Oferta fuente: la más copiable no usada (copy_score 5, luego 4)
      let offer: OfferRow | null = null;
      if (body.offer_id && n === 0) {
        const { data } = await admin.from("offers").select("*").eq("id", body.offer_id).maybeSingle();
        // La función no exige JWT: un offer_id explícito NO puede saltarse el
        // prefiltro. Se rechaza en vez de elegir otra oferta en silencio.
        const excluded = (data as { excluded_reason?: string | null } | null)?.excluded_reason;
        if (excluded) { results.push({ offer_id: body.offer_id, error: `Oferta excluida (${excluded}): no se genera kit` }); break; }
        offer = data as OfferRow | null;
      } else {
        const candidatesFrom = async (winnersOnly: boolean): Promise<OfferRow[]> => {
          let q = admin.from("offers").select("*")
            .not("enriched_at", "is", null).eq("enrich_failed", false)
            // Nunca un kit desde una oferta excluida (contenido adulto / apps de
            // dramas): los kits son lo que se vende, sería la peor fuga posible.
            .is("excluded_reason", null)
            .gte("copy_score", 4)
            // Solo tipos digitales (misma regla que las ganadoras del catálogo).
            .in("offer_type", ["infoproducto", "saas_app", "comunidad"])
            .in("language", ["es", "pt", "en", "ru"])
            .not("sample_body", "is", null)
            .order("copy_score", { ascending: false }).order("winner_score", { ascending: false }).order("active_ads", { ascending: false })
            .limit(200);
          if (winnersOnly) q = q.eq("is_winner", true);
          if (body.niche) q = q.eq("niche", body.niche);
          if (body.group) {
            const lang = Object.entries(LANG_TO_GROUP).find(([, g]) => g === body.group!.toUpperCase())?.[0];
            if (lang) q = q.eq("language", lang);
          }
          const { data } = await q;
          return ((data ?? []) as OfferRow[]).filter((o) => !usedOffers.has(o.id) && !(o.page_id && usedPages.has(o.page_id)));
        };
        let candidates = await candidatesFrom(true);
        if (candidates.length === 0) candidates = await candidatesFrom(false);
        // Variedad: nicho con menos kits, luego mercado con menos kits, luego copiabilidad/score
        candidates.sort((a, b) =>
          (nicheCount.get(a.niche ?? "otro") ?? 0) - (nicheCount.get(b.niche ?? "otro") ?? 0)
          || (groupCount.get(groupOf(a)) ?? 0) - (groupCount.get(groupOf(b)) ?? 0)
          || (b.copy_score ?? 0) - (a.copy_score ?? 0) || b.winner_score - a.winner_score);
        offer = candidates[0] ?? null;
      }
      if (!offer) { results.push({ error: "Sin ofertas candidatas" }); break; }

      // 2) UNA llamada a Gemini → kit completo en JSON
      const system = KIT_SYSTEM;
      const user = `OFERTA FUENTE (real, pagando anuncios ahora):
- Anunciante: ${offer.page_name}
- Producto detectado: ${offer.product_name}
- Mercado donde llega: ${offer.market} · idioma ${offer.language}
- Nicho: ${offer.niche} · tipo: ${offer.offer_type} · modelo: ${offer.business_model} · precio visto: ${offer.price_hint ?? "no visible"}
- Mecanismo: ${offer.mechanism}
- Por qué gana: ${offer.why_wins}
- Para quién: ${offer.target_audience}
- Prueba: ${offer.days_active} días pagando anuncios · ${offer.active_ads} anuncios activos · score ${offer.winner_score}/100
- Anuncio representativo: "${(offer.sample_title ?? "").slice(0, 150)}" — ${(offer.sample_body ?? "").slice(0, 700)}

Crea el KIT "Mini App Rentable" para replicar este negocio como producto digital / mini app propia (NO copiar marca ni textos literales: mismo mecanismo y ángulo, versión propia y mejorada). Devuelve un objeto JSON con EXACTAMENTE estas claves:
{
 "title": "nombre comercial del kit en español, máx 50 caracteres, sin el nombre del anunciante original",
 "tagline": "qué hace el producto, en una línea simple, máx 75 caracteres, sin promesas ni cifras",
 "cover_emoji": "un emoji",
 "summary": "1 o 2 frases cortas (máx 200 caracteres en total): para quién es y qué vendes. Palabras simples, sin jerga, sin cifras ni promesas. Sin revelar el mecanismo completo",
 "pricing": { "modelo": "pago_unico|suscripcion|freemium", "CO": "precio en COP", "MX": "precio en MXN", "DO": "precio en DOP", "US": "precio en USD", "BR": "precio en BRL", "nota": "1 frase de lógica de precio" },
 "blueprint": "markdown ≤ 550 palabras: ## Por qué gana · ## Mecanismo único (tu versión mejorada) · ## Avatar y dolor · ## Oferta irresistible (qué incluye, garantía, bonos) · ## Plan de 7 días para lanzar",
 "miniapp_prompt": "markdown ≤ 650 palabras: MEGA-PROMPT listo para pegar en cualquier herramienta que crea apps con IA o agente de código (Lovable, Bolt, v0, Claude Code, Codex, ChatGPT u otra) que construye la mini app. Sin imponer lenguaje, framework ni proveedor (la herramienta elige la tecnología) y sin números de versión de modelos: nombre, pantallas en orden, qué datos guarda, flujo del usuario, lógica del mecanismo (ej. quiz → plan), cobro con enlace de pago (Stripe, Whop, Hotmart u otro; pago único o suscripción), diseño primero para celular, textos de la interfaz en español. Empieza con una línea que diga que funciona en cualquier herramienta de IA para crear apps",
 "whatsapp_script": "markdown ≤ 350 palabras: guion de venta por WhatsApp en 5 mensajes (apertura, diagnóstico, mecanismo, oferta con precio en la moneda del cliente, cierre + manejo de 2 objeciones)",
 "vsl_script": "markdown ≤ 400 palabras: guion VSL de 90 segundos con marcas de tiempo (hook, problema, mecanismo, prueba, oferta, CTA)",
 "ad_copies": [ { "headline": "≤ 40 caracteres", "primary_text": "≤ 500 caracteres, estilo DR, gancho fuerte" } ] (exactamente 3, ángulos distintos: dolor, curiosidad, prueba),
 "landing_copy": "markdown ≤ 400 palabras: hero (titular + subtítulo + CTA), 3 beneficios, cómo funciona en 3 pasos, prueba/garantía, FAQ de 3 preguntas, CTA final",
 "hooks": ["5 hooks de apertura para video/anuncio, ≤ 120 caracteres cada uno"]
}
Todo en español (excepto nombres propios). Sé específico al nicho y al mecanismo real; nada genérico.`;

      let aiRes: Response | null = null;
      let modelUsed = "";
      let lastStatus = 0;
      for (let attempt = 0; attempt < MODELS_TRY.length && !aiRes; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 120_000);
        try {
          const r = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: MODELS_TRY[attempt],
              max_tokens: 16000,
              response_format: { type: "json_object" },
              messages: [{ role: "system", content: system }, { role: "user", content: user }],
            }),
            signal: ctrl.signal,
          });
          lastStatus = r.status;
          if ([404, 429, 500, 502, 503, 504].includes(r.status) && attempt < MODELS_TRY.length - 1) {
            await r.text();
            await new Promise((res) => setTimeout(res, 2000));
            continue;
          }
          aiRes = r;
          modelUsed = MODELS_TRY[attempt];
        } catch (err) {
          if (attempt === MODELS_TRY.length - 1) throw err;
        } finally {
          clearTimeout(timer);
        }
      }
      if (!aiRes || !aiRes.ok) {
        const t = aiRes ? (await aiRes.text()).slice(0, 200) : "";
        results.push({ offer_id: offer.id, error: `AI ${aiRes?.status ?? lastStatus}: ${t}` });
        break;
      }
      const aiData = await aiRes.json();
      // Costo real (tabla ai_usage). Trabajo de fondo: sin usuario. Salida = total − entrada,
      // para contar también el razonamiento, que se cobra. Si falla, el kit sigue.
      if (aiData?.usage) {
        const input = Number(aiData.usage.prompt_tokens) || 0;
        const output = Math.max(Number(aiData.usage.completion_tokens) || 0, (Number(aiData.usage.total_tokens) || 0) - input);
        try {
          const { error: logErr } = await admin.rpc("log_ai_usage", { p_user_id: null, p_fn: "generate-kit", p_model: modelUsed, p_input: input, p_output: output, p_images: 0 });
          if (logErr) console.error("log_ai_usage:", logErr.message);
        } catch (e) { console.error("log_ai_usage:", e instanceof Error ? e.message : e); }
      }
      const content: string = aiData?.choices?.[0]?.message?.content ?? "{}";
      let kit: Record<string, unknown>;
      try {
        kit = JSON.parse(content.replace(/```json?/g, "").replace(/```/g, "").trim());
      } catch {
        results.push({ offer_id: offer.id, error: `JSON inválido: ${content.slice(0, 120)}` });
        continue;
      }
      const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
      const title = str(kit.title, 60) || `Mini App · ${offer.product_name ?? offer.page_name}`;
      if (!str(kit.blueprint, 20) || !str(kit.miniapp_prompt, 20)) {
        results.push({ offer_id: offer.id, error: "Kit incompleto (sin blueprint/mega-prompt)" });
        continue;
      }

      // 3) Persistir: metadata pública + contenido privado
      const slug = `${slugify(title)}-${crypto.randomUUID().slice(0, 6)}`;
      const { data: inserted, error: insErr } = await admin.from("mini_app_kits").insert({
        slug,
        title,
        tagline: str(kit.tagline, 90) || null,
        niche: offer.niche ?? "otro",
        market_group: LANG_TO_GROUP[offer.language ?? ""] ?? "ES",
        offer_id: offer.id,
        cover_emoji: str(kit.cover_emoji, 4) || EMOJI_BY_NICHE[offer.niche ?? "otro"] || "🧩",
        summary: str(kit.summary, 260) || null,
        // Lista fija y corta (10-oct-2026): igual en todos los kits, sin "probado" ni "alta conversión".
        whats_inside: KIT_INSIDE,
        proof: {
          days_active: offer.days_active, active_ads: offer.active_ads, winner_score: offer.winner_score,
          market: offer.market, language: offer.language, source_product: offer.product_name, source_advertiser: offer.page_name,
          price_hint: offer.price_hint, copy_score: offer.copy_score,
        },
        price_credits: 150,
        content: {
          blueprint: str(kit.blueprint, 12000),
          miniapp_prompt: str(kit.miniapp_prompt, 12000),
          whatsapp_script: str(kit.whatsapp_script, 8000),
          vsl_script: str(kit.vsl_script, 8000),
          ad_copies: Array.isArray(kit.ad_copies) ? kit.ad_copies.slice(0, 3) : [],
          landing_copy: str(kit.landing_copy, 8000),
          hooks: Array.isArray(kit.hooks) ? kit.hooks.slice(0, 5) : [],
          pricing: typeof kit.pricing === "object" && kit.pricing ? kit.pricing : {},
          model: modelUsed,
        },
      }).select("id").single();
      if (insErr) { results.push({ offer_id: offer.id, error: insErr.message }); continue; }

      usedOffers.add(offer.id);
      if (offer.page_id) usedPages.add(offer.page_id);
      nicheCount.set(offer.niche ?? "otro", (nicheCount.get(offer.niche ?? "otro") ?? 0) + 1);
      groupCount.set(groupOf(offer), (groupCount.get(groupOf(offer)) ?? 0) + 1);
      results.push({ kit_id: inserted.id, title, offer_id: offer.id });
    }

    return json({ generated: results.filter((r) => r.kit_id).length, results });
  } catch (e) {
    return json({ results, error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
