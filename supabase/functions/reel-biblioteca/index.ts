// SUPERNOVA — «Reels que funcionan» (30-oct-2026, Jean: «dale con los puntos del 1 al 4 en la app»).
//
// Lee UNA vez, solo con el texto, cada reel de la biblioteca que tiene transcripción y todavía no tiene lectura:
// gancho, tema, si es de descubrimiento o de nicho, si atrae o vende, su estructura y por qué funciona. Queda guardado
// en reel_biblioteca para todas las cuentas, y el gancho entra a Ganchos (hook_vault, source 'reel'). Sin video y
// sin Apify: el video ya se pagó una vez y su enlace venció.
//
// Corre por cron diario o invocación manual de un admin. verify_jwt false (la invoca pg_cron) + compuerta interna:
// secreto de cron o admin con sesión. Solo escribe contenido derivado de reels públicos con service_role.
// Idempotente: solo toma filas con lectura NULL; el gancho se deduplica con sha256('reel:' + shortcode).
import { createClient } from "npm:@supabase/supabase-js@2.117.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2.117.1/cors";
import { geminiMedia, MEDIA_MODEL } from "../_shared/geminiMedia.ts";

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

const LOTE = 6;            // reels por llamada a la IA
const WALL_MS = 120_000;   // la función tiene 150 s
const MAX_TEXTO = 2_500;   // caracteres de transcripción por reel (un reel de 90 s cabe entero)
const CATEGORIAS = new Set(["dolor", "curiosidad", "prueba_social", "autoridad", "urgencia", "contrarian", "historia", "caso_estudio", "lista"]);

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Fila = { shortcode: string; url: string; owner: string | null; caption: string | null; transcript: string; views: number | null; language: string | null };

const prompt = (filas: Fila[]) => `Eres editor de reels para creadores hispanos. Lee estos ${filas.length} reels de Instagram (transcripción y texto de la publicación) y devuelve SOLO JSON:
{"reels":[{"i":0,"gancho":"la primera frase que se dice, tal cual, en su idioma original","gancho_es":"el gancho en español latino neutro si el original no está en español; si ya está en español, igual","plantilla":"el gancho como plantilla en español con [huecos] para que cualquiera la use con su tema","categoria":"dolor|curiosidad|prueba_social|autoridad|urgencia|contrarian|historia|caso_estudio|lista","tema":"de qué habla, en 2 a 6 palabras en español","tipo":"descubrimiento|nicho","intencion":"atraccion|venta","estructura":["3 a 6 pasos cortos en español: qué hace el reel en orden"],"por_que":"1 o 2 frases en español: por qué engancha y se mira hasta el final","idioma":"es|en|pt"}]}
Reglas: "descubrimiento" = le sirve a cualquiera (atrae gente nueva); "nicho" = le habla a quien ya sabe del tema. "venta" solo si el reel en sí vende o lleva a comprar algo (curso, clase, producto, servicio, mentoría); si solo comparte una idea o una historia, "atraccion" aunque la publicación pida comentar. No inventes cifras ni datos que no estén en el texto. Tú de "tú", frases cortas.

${filas.map((f, i) => `### ${i} · @${f.owner ?? "?"}\nPublicación: ${(f.caption ?? "").replace(/\s+/g, " ").slice(0, 400)}\nTranscripción: ${f.transcript.replace(/\s+/g, " ").slice(0, MAX_TEXTO)}`).join("\n\n")}`;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  if (!(await authorizeInternal(req, admin))) return json(401, { error: "No autorizado" });

  let body: { limit?: number } = {};
  try { body = await req.json(); } catch { /* sin cuerpo */ }
  const limit = Math.min(Math.max(Number(body.limit) || 60, 1), 120);

  const { data: pendientes, error } = await admin.from("reel_biblioteca")
    .select("shortcode, url, owner, caption, transcript, views, language")
    .is("lectura", null).not("transcript", "is", null)
    .order("views", { ascending: false, nullsFirst: false }).limit(limit);
  if (error) return json(500, { error: error.message });
  const filas = (pendientes ?? []) as Fila[];

  let leidos = 0, ganchos = 0, costo = 0, fallos = 0;
  for (let k = 0; k < filas.length && Date.now() - t0 < WALL_MS; k += LOTE) {
    const lote = filas.slice(k, k + LOTE);
    try {
      const { out, cost, usage } = await geminiMedia([{ text: prompt(lote) }], 6_000, Math.min(60_000, WALL_MS - (Date.now() - t0) + 20_000), 0.3);
      costo += cost;
      await admin.from("ai_usage").insert({
        user_id: null, fn: "reel-biblioteca", model: MEDIA_MODEL, input_tokens: Number(usage.promptTokenCount ?? 0),
        output_tokens: Number(usage.candidatesTokenCount ?? 0), images: 0, cost_usd: cost,
      });
      const reels = Array.isArray((out as { reels?: unknown[] } | null)?.reels) ? (out as { reels: Record<string, unknown>[] }).reels : [];
      const porReel = cost / Math.max(1, lote.length);
      for (const r of reels) {
        const f = lote[Number(r.i)];
        if (!f) continue;
        const estructura = Array.isArray(r.estructura) ? r.estructura.map((x) => str(x, 160)).filter(Boolean).slice(0, 6) : [];
        const lectura = {
          gancho: str(r.gancho, 300), gancho_es: str(r.gancho_es, 300), plantilla: str(r.plantilla, 300),
          categoria: CATEGORIAS.has(str(r.categoria, 20)) ? str(r.categoria, 20) : "curiosidad",
          estructura, por_que: str(r.por_que, 400),
        };
        const tipo = str(r.tipo, 20) === "nicho" ? "nicho" : "descubrimiento";
        const intencion = str(r.intencion, 20) === "venta" ? "venta" : "atraccion";
        const idioma = ["es", "en", "pt"].includes(str(r.idioma, 2)) ? str(r.idioma, 2) : f.language;
        const { error: upErr } = await admin.from("reel_biblioteca").update({
          lectura, gancho: lectura.gancho_es || lectura.gancho || null, tema: str(r.tema, 80) || null, tipo, intencion,
          language: idioma, lectura_usd: Math.round(porReel * 1e6) / 1e6, updated_at: new Date().toISOString(),
        }).eq("shortcode", f.shortcode);
        if (upErr) { fallos++; continue; }
        leidos++;
        if (lectura.gancho && lectura.plantilla) {
          const { error: hErr } = await admin.from("hook_vault").upsert({
            dedup_hash: await sha256Hex(`reel:${f.shortcode}`), hook_text: lectura.gancho, hook_template: lectura.plantilla,
            category: lectura.categoria, language: idioma, source: "reel", source_url: f.url, views: f.views,
            source_page_name: f.owner ? `@${f.owner}` : null,
          }, { onConflict: "dedup_hash", ignoreDuplicates: true });
          if (!hErr) ganchos++;
        }
      }
    } catch (e) {
      fallos += lote.length;
      console.error("reel-biblioteca lote:", e instanceof Error ? e.message : e);
    }
  }

  const { count } = await admin.from("reel_biblioteca").select("shortcode", { count: "exact", head: true })
    .is("lectura", null).not("transcript", "is", null);
  return json(200, { leidos, ganchos, fallos, costo_usd: Math.round(costo * 10000) / 10000, quedan: count ?? null });
});
