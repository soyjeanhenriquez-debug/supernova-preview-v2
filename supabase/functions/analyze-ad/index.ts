// SUPERNOVA — analyze-ad: análisis estratégico de un anuncio de Meta
// Llama a Lovable AI y devuelve JSON con los 6 campos solicitados.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient as createGuardClient } from "npm:@supabase/supabase-js@2";

interface Body { copy?: string; title?: string }

// Tope de tamaño del cuerpo: este texto acaba en un modelo que cobra por token.
// deno-lint-ignore no-explicit-any
async function readJson(req: Request, maxChars: number): Promise<any> {
  const raw = await req.text();
  if (raw.length > maxChars) throw new Error("La solicitud es demasiado grande.");
  return raw ? JSON.parse(raw) : {};
}

// ── Compuerta de usuario ────────────────────────────────────────────────
// verify_jwt del gateway NO basta: la llave pública (anon) que viaja en el
// bundle de la web también es un JWT válido, y con ella cualquiera llamaba a
// esta función sin cuenta y sin gastar créditos. Aquí se exige un USUARIO real
// con acceso vigente y se aplica un tope de uso por usuario (RPC edge_guard).
async function requireUser(req: Request, fn: string, maxHour: number, maxDay: number): Promise<{ userId: string } | Response> {
  const deny = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return deny(401, "Inicia sesión para usar esta función.");
  const guard = createGuardClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await guard.auth.getUser(token);
  const userId = data?.user?.id;
  if (!userId) return deny(401, "Sesión inválida o expirada. Vuelve a iniciar sesión.");
  const { data: g, error } = await guard.rpc("edge_guard", { p_user_id: userId, p_fn: fn, p_max_hour: maxHour, p_max_day: maxDay });
  if (error) return deny(503, "No se pudo verificar el acceso. Intenta de nuevo.");
  if (g?.ok !== true) {
    return g?.reason === "rate_limited"
      ? deny(429, "Alcanzaste el límite de uso de esta función. Intenta más tarde.")
      : deny(403, "Tu cuenta no tiene acceso activo.");
  }
  return { userId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const gate = await requireUser(req, "analyze-ad", 60, 300);
  if (gate instanceof Response) return gate;

  try {
    const apiKey = (Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { copy = "", title = "" }: Body = await readJson(req, 30000).catch(() => ({}));
    const fullCopy = `${title}\n\n${copy}`.trim();
    if (!fullCopy) {
      return new Response(JSON.stringify({ error: "copy is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const system = `Eres un analista experto en direct response marketing. Analiza este anuncio de Facebook Ads y devuelve SOLO un JSON válido con esta estructura exacta:
{
  "angulo": "descripción del ángulo emocional en máximo 8 palabras",
  "formula_hook": "estructura del hook en formato A → B → C",
  "big_idea": "la idea central en máximo 12 palabras",
  "sofisticacion": número del 1 al 5,
  "sofisticacion_label": "descripción del nivel de sofisticación del mercado según escala Schwartz",
  "dias_fatiga": número estimado de días antes de que el creativo se fatigue,
  "brecha": "oportunidad competitiva detectada en máximo 15 palabras"
}
No incluyas explicaciones, solo el JSON.`;

    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Anuncio: ${fullCopy}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (r.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit. Intenta en un momento." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (r.status === 402) {
      return new Response(JSON.stringify({ error: "Créditos IA agotados. Recarga el workspace." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed;
    try { parsed = JSON.parse(content); }
    catch { parsed = { raw: content }; }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
