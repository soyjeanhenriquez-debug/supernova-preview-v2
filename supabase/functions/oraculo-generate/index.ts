// SUPERNOVA — Oráculo: generadores inline (creativos, landing, avatar, funnel)
// Toma el informe de inteligencia y produce contenido específico según `kind`.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type Kind = "creativos" | "landing" | "avatar" | "funnel" | "master_prompt";

interface Body {
  kind: Kind;
  analysis: string;
  brand?: string;
  url?: string;
}

const PROMPTS: Record<Kind, { system: string; user: (b: Body) => string }> = {
  creativos: {
    system:
      "Eres un copywriter senior de direct response en español latinoamericano. Devuelve SOLO Markdown limpio, sin preámbulos.",
    user: (b) => `Basado en este informe de inteligencia de la oferta de ${b.brand ?? b.url ?? "el competidor"}, genera creativos listos para publicar.

INFORME:
${b.analysis}

FORMATO EXACTO (usa estos encabezados y respeta el separador "---"):

## ⚡ Mis Hooks (5 ángulos)

### 1. Dolor
[Hook completo empezando por "¿Cansado de..." adaptado a la oferta — 2-3 líneas]

---

### 2. Curiosidad
[Hook completo empezando por "Lo que nadie te dice..." — 2-3 líneas]

---

### 3. Prueba social
[Hook completo empezando por "X personas ya..." con número realista — 2-3 líneas]

---

### 4. Autoridad
[Hook empezando por "Expertos confirman..." — 2-3 líneas]

---

### 5. Urgencia
[Hook empezando por "Solo hasta..." — 2-3 líneas]

---

## 📣 Ad Copy Completo (3 versiones)

### Versión Corta (80 palabras)
**Primary text:** [exactamente ~80 palabras]
**Headline:** [máx 7 palabras]
**Description:** [máx 25 palabras]

---

### Versión Media (180 palabras)
**Primary text:** [exactamente ~180 palabras]
**Headline:** [máx 7 palabras]
**Description:** [máx 25 palabras]

---

### Versión Larga — Storytelling (300+ palabras)
**Primary text:** [storytelling, 300+ palabras, primera persona]
**Headline:** [máx 7 palabras]
**Description:** [máx 25 palabras]`,
  },
  landing: {
    system:
      "Eres un copywriter de landing pages de venta directa en español latinoamericano. Devuelve SOLO Markdown listo para copiar.",
    user: (b) => `Genera el copy completo de una landing page lista para publicar basada en el siguiente informe de inteligencia, con un ángulo SOFISTICADO y diferenciado del competidor.

INFORME:
${b.analysis}

FORMATO EXACTO:

## 🎯 Headline principal
[1 línea, máx 12 palabras, promesa concreta]

## Subheadline
[2 líneas que amplían y dan credibilidad]

## 😣 Sección de Dolor
[3 párrafos describiendo el problema con las palabras EXACTAS del avatar]

## 🔑 El Mecanismo Único
[Explica el método/sistema/descubrimiento que hace esto distinto a todo lo demás]

## ✅ 5 Beneficios (bullets)
- [Beneficio concreto + transformación]
- [Beneficio concreto + transformación]
- [Beneficio concreto + transformación]
- [Beneficio concreto + transformación]
- [Beneficio concreto + transformación]

## 💬 Prueba Social
[3 testimonios placeholder realistas con nombre, edad, ciudad y resultado específico en cifras]

## 📦 La Oferta (valor apilado)
- Componente 1 — Valor $XXX
- Componente 2 — Valor $XXX
- Componente 3 — Valor $XXX
- Bonus #1 — Valor $XXX
- Bonus #2 — Valor $XXX
**Valor total: $X,XXX**
**Hoy pagas: $XX**

## 🛡 Garantía
[Garantía concreta con días y mecanismo de devolución]

## 🚀 CTA con urgencia
[Botón + microcopy de urgencia genuina]

## ❓ FAQ
**1. [Pregunta común]**
[Respuesta]
**2. [Pregunta común]**
[Respuesta]
**3. [Pregunta común]**
[Respuesta]
**4. [Pregunta común]**
[Respuesta]
**5. [Pregunta común]**
[Respuesta]`,
  },
  avatar: {
    system:
      "Eres un estratega de marketing de respuesta directa experto en avatares de comprador en español latinoamericano. Devuelve SOLO Markdown.",
    user: (b) => `Crea el avatar profundo del comprador basado en este informe. Sé específico, no genérico.

INFORME:
${b.analysis}

FORMATO EXACTO:

## 👤 Demografía exacta
- **Edad:** [rango]
- **Género:** [predominio]
- **Ingreso:** [rango]
- **Situación familiar:** […]
- **Ubicación:** [países/ciudades]
- **Ocupación típica:** […]

## 😨 Los 5 Miedos Principales
1. […]
2. […]
3. […]
4. […]
5. […]

## 💭 Los 5 Deseos Profundos
1. […]
2. […]
3. […]
4. […]
5. […]

## 📆 Día Típico del Avatar
[Narrativa de 1 día completo: mañana, mediodía, tarde, noche, con sus frustraciones y triggers]

## 🚫 Las 3 Objeciones que SIEMPRE pone
1. **"[objeción literal]"** → respuesta sugerida
2. **"[objeción literal]"** → respuesta sugerida
3. **"[objeción literal]"** → respuesta sugerida

## 🗣 Palabras EXACTAS que usa
[10–15 frases textuales con las que describiría su problema, entre comillas, en primera persona]

## 🧠 Los 5 Niveles de Consciencia (Schwartz) aplicados
**Nivel 1 — Inconsciente:** copy específico que rompe la negación
**Nivel 2 — Consciente del problema:** copy específico
**Nivel 3 — Consciente de la solución:** copy específico
**Nivel 4 — Consciente del producto:** copy específico
**Nivel 5 — Más consciente:** copy específico que cierra venta`,
  },
  funnel: {
    system:
      "Eres un funnel architect de direct response en español latinoamericano. Devuelve SOLO Markdown listo para producción.",
    user: (b) => `Diseña el funnel completo para una oferta similar (mejorada) a la analizada.

INFORME:
${b.analysis}

FORMATO EXACTO:

## 🏗 Estructura del Funnel
\`\`\`
Ad → Landing → Thank you → Upsell 1 → Upsell 2 → Email Sequence
\`\`\`
[Breve explicación de qué hace cada paso y la lógica de monetización]

## 🎥 VSL Script — Primeros 2 minutos completos
[Script palabra por palabra, marcando segundos: 0:00, 0:15, 0:30, etc. Incluye hook + apertura + agitación + promesa]

## ✉️ Secuencia de 5 emails post-compra
### Email 1 (Día 0 — confirmación + onboarding)
**Asunto:** […]
**Cuerpo:** [completo]

### Email 2 (Día 1)
**Asunto:** […]
**Cuerpo:** [completo]

### Email 3 (Día 3)
**Asunto:** […]
**Cuerpo:** [completo]

### Email 4 (Día 5)
**Asunto:** […]
**Cuerpo:** [completo]

### Email 5 (Día 7)
**Asunto:** […]
**Cuerpo:** [completo]

## 💰 Script del Upsell (3 minutos)
[Script palabra por palabra con timestamps 0:00 → 3:00]

## 🛒 Order Bump recomendado
**Producto:** […]
**Precio:** $XX
**Copy del checkbox:** "[microcopy persuasivo en 1 línea]"`,
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    if (!body.kind || !PROMPTS[body.kind]) {
      return new Response(JSON.stringify({ error: "kind inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!body.analysis || body.analysis.trim().length < 80) {
      return new Response(JSON.stringify({ error: "analysis requerido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const p = PROMPTS[body.kind];

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: p.system },
          { role: "user", content: p.user(body) },
        ],
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
    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ error: `AI error ${r.status}`, detail: t.slice(0, 500) }), {
        status: r.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ kind: body.kind, content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
