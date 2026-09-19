import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient as createGuardClient } from "npm:@supabase/supabase-js@2";

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
  const gate = await requireUser(req, "pain-discovery", 30, 150);
  if (gate instanceof Response) return gate;

  try {
    const { keyword, suggestions = [], sources = {} } = await readJson(req, 30000);
    if (!keyword) return new Response(JSON.stringify({ error: "keyword required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const LOVABLE_API_KEY = (Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));
    if (!LOVABLE_API_KEY) return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const sourceList = Object.entries(sources).filter(([_, v]) => v).map(([k]) => k).join(", ") || "google";

    const system = `Eres un experto en research de mercado para infoproductos digitales. Tu tarea es identificar dolores reales con alta intención comercial. Hablas español neutro, eres específico y accionable.`;

    const user = `NICHO: "${keyword}"
Fuentes consultadas: ${sourceList}
Señales de Google Autocomplete: ${suggestions.slice(0, 12).join(" | ")}

Analiza y entrega un informe con este formato exacto:

## DOLORES ENCONTRADOS PARA: "${keyword}"

🔴 **DOLOR #1 (Alta intensidad)**
"[frase exacta del dolor en primera persona]"
- Fuente: [origen]
- Volumen estimado: Alto / Medio / Bajo
- Soluciones existentes: [evalúa calidad]
[→ ¿Crear producto?]

🟠 **DOLOR #2 (Media intensidad)**
...

🟡 **DOLOR #3 (Baja intensidad)**
...

## 🟢 IDEAS DE PRODUCTO (generadas por IA)
1. **[Nombre]** — [una línea descriptiva]
2. **[Nombre]** — [una línea descriptiva]
3. **[Nombre]** — [una línea descriptiva]

## 🎯 RECOMENDACIÓN
[1 párrafo: cuál atacar primero y por qué]`;

    const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "gemini-3-flash-preview",
        stream: true,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text();
      return new Response(JSON.stringify({ error: "Gateway error", detail: text }), { status: upstream.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(upstream.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
