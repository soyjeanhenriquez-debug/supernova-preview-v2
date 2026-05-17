import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { keyword, suggestions = [], sources = {} } = await req.json();
    if (!keyword) return new Response(JSON.stringify({ error: "keyword required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
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

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
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
