import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient as createGuardClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// El frontend manda ids estilo gateway ("google/…") y algunos modelos 2.5
// no disponibles para cuentas nuevas de Gemini: se normalizan aquí.
const MODEL_MAP: Record<string, string> = {
  "gemini-2.5-pro": "gemini-3-pro-preview",
  "gemini-2.5-flash": "gemini-3-flash-preview",
  "gemini-2.5-flash-lite": "gemini-flash-lite-latest",
};

// Lista blanca: el modelo lo pedía el cliente sin filtro, así que cualquiera
// podía elegir el más caro (pro ≈ 20× el costo de flash). La app solo usa flash.
const ALLOWED_MODELS = new Set(["gemini-3-flash-preview", "gemini-flash-lite-latest"]);
const DEFAULT_MODEL = "gemini-3-flash-preview";

function normalizeModel(model?: string): string {
  const m = String(model || DEFAULT_MODEL).replace(/^google\//, "");
  const mapped = MODEL_MAP[m] ?? m;
  return ALLOWED_MODELS.has(mapped) ? mapped : DEFAULT_MODEL;
}

// Solo turnos user/assistant con texto acotado: el rol "system" lo pone el
// servidor, y el historial no crece sin límite.
function cleanMessages(input: unknown): Array<{ role: "user" | "assistant"; content: string }> {
  if (!Array.isArray(input)) return [];
  return input
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-40)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 12_000) }));
}

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const gate = await requireUser(req, "ai-chat", 120, 600);
  if (gate instanceof Response) return gate;

  try {
    const { messages: rawMessages, systemPrompt: rawSystem, model } = await readJson(req, 150000);
    const messages = cleanMessages(rawMessages);
    if (messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages requerido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const systemPrompt = typeof rawSystem === "string" ? rawSystem.slice(0, 12_000) : "";
    const LOVABLE_API_KEY = (Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: normalizeModel(model),
        messages: [
          {
            role: "system",
            content: systemPrompt || `Eres el asistente IA de SUPERNOVA, una plataforma de gestión de campañas publicitarias. 
Tu rol es ayudar al usuario a:
- Optimizar campañas de Meta Ads, Google Ads, TikTok Ads
- Generar copy persuasivo y hooks de venta
- Analizar métricas (ROAS, CTR, CPA, CPM)
- Sugerir estrategias de targeting y audiencias
- Crear embudos de conversión efectivos
- Dar consejos sobre creatividades que convierten

Responde siempre en español. Sé directo, práctico y orientado a resultados. 
Cuando des copy o hooks, hazlos listos para usar. 
Usa emojis moderadamente para hacer las respuestas más visuales.`
          },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
