// SUPERNOVA — Asistente IA por Pilar (streaming SSE)
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface Payload {
  projectName: string;
  projectMode: "sofisticar" | "crear" | "blueprint";
  pillarId: number;
  pillarName: string;
  pillarDesc: string;
  notes?: string;
  context?: any;
  previousNotes?: Record<number, string>;
}

const PILLAR_PROMPTS: Record<number, string> = {
  1: `PILAR 1 — DETECTAR (Encontrar el anuncio ganador)
Devuelve un plan ULTRA accionable para que el usuario detecte el anuncio winner correcto para SU proyecto. Incluye:
## 🎯 Criterios de un ganador para tu nicho
## 🔎 Dónde buscar (con queries exactas en Meta Ad Library, TikTok Creative Center, Foreplay)
## 🧪 Filtros mínimos (días activos, duplicados, score)
## ✅ Tu shortlist sugerida (3-5 ejemplos del tipo de anuncio a buscar)
## 📌 Siguiente paso concreto`,

  2: `PILAR 2 — ANALIZAR (Entender por qué vende)
Analiza el anuncio/contexto del proyecto y entrega:
## 🧠 Mecanismo de la oferta (la promesa real)
## 🎣 El hook (qué frase engancha)
## 👤 Avatar específico que está comprando
## 💔 Dolor que resuelve (no genérico)
## 🪜 Escalera de valor implícita
## ⚠️ Lo que NO está vendiendo (oportunidad)`,

  3: `PILAR 3 — DISEÑAR (Crear tu versión superior)
Diseña una versión MEJOR que el original. Entrega:
## 🚀 Nombre del producto sofisticado
## 💎 Por qué es MEJOR (3 razones específicas)
## 📦 Formato y entregables (qué incluye)
## 💰 Precio sugerido + justificación
## 🪜 Stack de oferta (bonus, garantía, urgencia)
## 🎨 Tu ángulo único (positioning statement en 1 frase)`,

  4: `PILAR 4 — PRODUCIR (Construir los assets)
Da la lista exhaustiva de assets a producir, con tiempos y herramientas:
## 🛠️ Stack de herramientas recomendado
## 📋 Checklist de assets (landing, VSL, creativos, email, checkout)
## 📅 Cronograma de producción (día a día, máx 7 días)
## ✍️ Briefs listos para copiar (1 por asset)
## 🤖 Qué delegar a IA y qué no
## ⚠️ Trampas comunes`,

  5: `PILAR 5 — LANZAR (Primera venta en 7 días)
Plan de lanzamiento orgánico + paid mínimo para primera venta:
## 🎬 Plan día 1-7 (qué hacer cada día)
## 📣 3 ángulos de comunicación para testear
## 🧲 Lead magnet / oferta de entrada
## 📊 Métricas que importan (no vanidad)
## 🆘 Plan B si no hay venta el día 5
## ✅ Definición de "lanzado con éxito"`,

  6: `PILAR 6 — ESCALAR (Paid media con ROI probado)
Plan de escalado con paid media:
## 🎯 Estructura de campaña recomendada (CBO/ABO, audiencias)
## 💵 Presupuesto inicial y reglas de escalado
## 🧪 Matriz de testeo (creativos × audiencias × hooks)
## 📈 KPIs por etapa (CPM, CTR, CPC, CPA objetivo)
## 🔁 Cuándo duplicar, cuándo matar, cuándo bajar
## 🛡️ Cómo proteger ROAS al escalar`,
};

function buildPrompts(p: Payload): { system: string; user: string } {
  const prior = Object.entries(p.previousNotes || {})
    .filter(([_, v]) => v && v.trim())
    .map(([k, v]) => `- Pilar ${k}: ${v}`)
    .join("\n");

  const ctx = p.context ? `\nCONTEXTO DEL PROYECTO:\n${JSON.stringify(p.context).slice(0, 2500)}\n` : "";

  const userNotes = p.notes?.trim() ? `\nNOTAS ACTUALES DEL USUARIO EN ESTE PILAR:\n${p.notes}\n` : "";

  return {
    system: `Eres un consultor élite de Direct Response Marketing y operador del sistema SUPERNOVA (6 pilares secuenciales).
Hablas español neutro, directo, sin relleno. Output siempre en markdown siguiendo EXACTAMENTE el formato pedido.
Tu objetivo: que el usuario salga del pilar con tareas concretas, no teoría.`,
    user: `PROYECTO: ${p.projectName}
MODO: ${p.projectMode}
${ctx}
${prior ? `AVANCES PREVIOS:\n${prior}\n` : ""}
${userNotes}

${PILLAR_PROMPTS[p.pillarId] || `Genera guía accionable para el pilar "${p.pillarName}" (${p.pillarDesc}).`}

Sé específico al proyecto. No des consejos genéricos. Máx 450 palabras.`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload = await req.json() as Payload;
    if (!payload?.pillarId || !payload?.projectName) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { system, user } = buildPrompts(payload);

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        stream: true,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text();
      return new Response(JSON.stringify({ error: "Gateway error", detail: text }), {
        status: upstream.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(upstream.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
