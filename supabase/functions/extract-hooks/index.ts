// SUPERNOVA — Bóveda de Hooks: extrae y plantilliza los ganchos de los
// anuncios ganadores (mega/rising) y los guarda en hook_vault.
//
// La prueba de calidad no son views: es que el anunciante siguió PAGANDO
// (days_active × duplicate_count). Corre por cron diario o invocación manual
// (mismo patrón que master-rotate: verify_jwt false, solo escribe contenido
// derivado con service_role — no toca datos de usuarios).
//
// Idempotente: dedup_hash = sha256(page_id + inicio del body). Reinvocar
// procesa solo candidatos nuevos.
// (SHA-256 y no MD5: Web Crypto nativo no soporta MD5, y el import externo
// jsr:@std/crypto hacía fallar el boot del worker en Supabase.)
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const BATCH_SIZE = 40;      // ads por invocación → 1 sola llamada a Gemini
const MIN_BODY_LEN = 40;

const CATEGORIES = new Set([
  "dolor", "curiosidad", "prueba_social", "autoridad", "urgencia",
  "contrarian", "historia", "caso_estudio", "lista",
]);

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface ExtractedHook {
  index: number;
  hook_text: string;
  hook_template: string;
  category: string;
  language: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const apiKey = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing GEMINI_API_KEY" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // 1) Candidatos: top ads por score. Se trae un colchón (x5) porque la
    //    tabla tiene filas repetidas del mismo anuncio y muchos ya procesados.
    const { data: rows, error: qErr } = await admin
      .from("winning_ads")
      .select("id, page_id, page_name, ad_title, ad_body, market, days_active, duplicate_count, winner_score")
      .in("tier", ["mega", "rising"])
      .not("ad_body", "is", null)
      .order("winner_score", { ascending: false })
      .order("days_active", { ascending: false })
      .limit(BATCH_SIZE * 25); // ventana amplia: los ya procesados se filtran después, y con una ventana corta el seed se agota en ~35 hooks
    if (qErr) throw qErr;

    // 2) Dedupe en memoria + filtrar los que ya están en hook_vault
    const seen = new Set<string>();
    const candidates: Array<{ hash: string; row: NonNullable<typeof rows>[number] }> = [];
    for (const row of rows ?? []) {
      const body = (row.ad_body ?? "").trim();
      if (body.length < MIN_BODY_LEN) continue;
      const hash = await sha256Hex(`${row.page_id ?? ""}${body.slice(0, 100)}`);
      if (seen.has(hash)) continue;
      seen.add(hash);
      candidates.push({ hash, row });
    }

    const hashes = candidates.map((c) => c.hash);
    const { data: existing } = await admin
      .from("hook_vault")
      .select("dedup_hash")
      .in("dedup_hash", hashes);
    const existingSet = new Set((existing ?? []).map((e) => e.dedup_hash));
    const fresh = candidates.filter((c) => !existingSet.has(c.hash)).slice(0, BATCH_SIZE);

    if (fresh.length === 0) {
      return new Response(JSON.stringify({ processed: 0, inserted: 0, note: "Sin candidatos nuevos" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3) UNA llamada a Gemini con el batch completo → JSON estricto
    const adsForPrompt = fresh.map((c, i) => ({
      index: i,
      title: (c.row.ad_title ?? "").slice(0, 120),
      body: (c.row.ad_body ?? "").slice(0, 400),
    }));

    const system = `Eres un analista senior de direct response. Extraes el HOOK (el gancho de apertura que detiene el scroll) de anuncios ganadores reales. Devuelves SOLO un array JSON válido, sin markdown ni preámbulos.`;
    const userPrompt = `Para cada anuncio del array, extrae su hook y conviértelo en plantilla reutilizable.

REGLAS:
- "hook_text": el gancho REAL del anuncio (la primera frase/idea que engancha), máx 200 caracteres, en su idioma original.
- "hook_template": el mismo gancho generalizado con placeholders entre corchetes, ej: "¿Cansado de [dolor específico]? Este [mecanismo] lo resolvió en [tiempo]". Mismo idioma del original.
- "category": exactamente una de: dolor, curiosidad, prueba_social, autoridad, urgencia, contrarian, historia, caso_estudio, lista.
- "language": código ISO del idioma del hook (es, en, pt, ru...).
- CALIDAD SOBRE CANTIDAD: si un anuncio NO tiene un gancho claro y fuerte (ej. solo menciona precio o es puro branding), OMÍTELO del resultado.

Responde SOLO con un array JSON de objetos: {"index": <índice del anuncio>, "hook_text": "...", "hook_template": "...", "category": "...", "language": "..."}

ANUNCIOS:
${JSON.stringify(adsForPrompt)}`;

    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ error: `AI error ${r.status}`, detail: t.slice(0, 400) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const aiData = await r.json();
    const content: string = aiData?.choices?.[0]?.message?.content ?? "[]";

    // Parseo defensivo: Gemini a veces envuelve el JSON en ```json ... ```
    let extracted: ExtractedHook[] = [];
    try {
      const cleaned = content.replace(/```json?/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) extracted = parsed;
    } catch {
      return new Response(JSON.stringify({ error: "Respuesta de IA no parseable", raw: content.slice(0, 300) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4) Insert de los válidos, con las métricas del anuncio fuente
    const inserts = extracted
      .filter((h) =>
        typeof h.index === "number" && fresh[h.index] &&
        h.hook_text?.trim() && h.hook_template?.trim() &&
        CATEGORIES.has(h.category))
      .map((h) => {
        const { hash, row } = fresh[h.index];
        return {
          dedup_hash: hash,
          hook_text: h.hook_text.trim().slice(0, 300),
          hook_template: h.hook_template.trim().slice(0, 300),
          category: h.category,
          language: (h.language ?? "").slice(0, 8) || null,
          market: row.market,
          days_active: row.days_active,
          duplicate_count: row.duplicate_count,
          winner_score: row.winner_score,
          source_page_name: row.page_name,
          source_ad_id: row.id,
        };
      });

    let inserted = 0;
    if (inserts.length > 0) {
      const { error: insErr, count } = await admin
        .from("hook_vault")
        .upsert(inserts, { onConflict: "dedup_hash", ignoreDuplicates: true, count: "exact" });
      if (insErr) throw insErr;
      inserted = count ?? inserts.length;
    }

    return new Response(JSON.stringify({ processed: fresh.length, inserted, skipped_by_ai: fresh.length - inserts.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
