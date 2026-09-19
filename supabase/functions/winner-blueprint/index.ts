import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient as createGuardClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  const gate = await requireUser(req, "winner-blueprint", 40, 200);
  if (gate instanceof Response) return gate;

  try {
    const { ad } = await readJson(req, 30000);
    const LOVABLE_API_KEY = (Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = `Eres el mejor analista de direct response marketing del mundo.
Analiza este anuncio ganador y crea un Blueprint de Clonación completo.

ANUNCIO ORIGINAL:
Texto: ${ad.ad_body || ad.ad_description || ""}
Titular: ${ad.ad_title || ""}
Anunciante: ${ad.page_name || ad.advertiser || ""}
Días activo: ${ad.days_active ?? "?"}
Repeticiones: ${ad.duplicate_count ?? "?"}
Impresiones estimadas: ${ad.impressions_lower ?? "?"}
Mercado de origen: ${ad.market || "?"}

ENTREGA EXACTAMENTE ESTO EN ESTE ORDEN (usa markdown):

## 🎯 POR QUÉ ESTÁ GANANDO
(2-3 razones específicas basadas en el copy)

## 🧠 EL MECANISMO
(la promesa central, el ángulo único, el hook que usa)

## 👤 EL AVATAR
(quién está comprando esto, descripción específica)

## 💰 ESTRUCTURA DE LA OFERTA
(qué están vendiendo exactamente, precio estimado, modelo)

## 🔥 LOS 3 ELEMENTOS QUE DEBES ROBAR
(las ideas específicas que puedes adaptar legalmente)

## ❌ LO QUE NO COPIES
(lo que es específico de ellos y no funcionaría para ti)

## 🚀 TU VERSIÓN: CÓMO CLONARLO
(instrucciones específicas para crear tu propia versión)

## ✍️ HOOK ALTERNATIVO PARA TI
(un hook similar pero diferente para tu versión)

## 📊 NICHOS RELACIONADOS DONDE FUNCIONA
(3 nichos donde el mismo mecanismo podría aplicar)

Sé específico, directo y accionable. Sin relleno. Todo en español latinoamericano.`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
        stream: true,
      }),
    });

    if (!response.ok) {
      const txt = await response.text();
      return new Response(JSON.stringify({ error: txt }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
