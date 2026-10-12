// SUPERNOVA — Oráculo: generadores inline (creativos, landing, avatar, funnel)
// Toma el informe de inteligencia y produce contenido específico según `kind`.
import { corsHeaders } from "npm:@supabase/supabase-js@2.117.1/cors";
import { HONESTY_RULES } from "../_shared/honesty.ts";
import { createClient as createGuardClient } from "npm:@supabase/supabase-js@2.117.1";
import { safeRefund } from "../_shared/refund.ts";
import { apimartImage } from "../_shared/apimart.ts";
import { MI_VERSION_SYSTEM, miVersionPrompt, normalizeMiVersion } from "./miVersion.ts";

type Kind = "creativos" | "landing" | "avatar" | "funnel" | "master_prompt" | "whatsapp_script" | "vsl_prompt"
  | "mi_version" | "mi_version_image";

interface Body {
  kind: Kind;
  analysis: string;
  brand?: string;
  url?: string;
  /** Solo para whatsapp_script: país/moneda del vendedor para precio y método de cobro. */
  country?: string;
  currency?: string;
  /** Recibo de un cobro de "Mi App": cubre master_prompt, whatsapp_script y vsl_prompt. */
  receipt?: string;
  /** Solo para mi_version_image: la escena y el texto corto que salieron de mi_version. */
  image_prompt?: string;
  image_text?: string;
}

// Qué acción de la lista de precios cobra cada generador. Los dos guiones de
// venta solo se usan dentro de "Mi App" (van cubiertos por su recibo); si
// alguien los pide sueltos pagan como un generador normal.
const KIND_ACTION: Record<Kind, string> = {
  creativos: "gen_ad_copies", landing: "gen_landing", avatar: "gen_avatar", funnel: "gen_funnel",
  master_prompt: "gen_master_prompt", whatsapp_script: "gen_light", vsl_prompt: "gen_medium",
  // "Hacer mi versión" dentro de la app (12-oct-2026): mi_version cobra los 50 de siempre y emite el
  // recibo; la imagen va cubierta por ese recibo. Si el recibo ya no la cubre (vencido o 3 usos), se cobra
  // como una imagen de anuncio normal (gen_ad_image), nunca otra vez los 50.
  mi_version: "gen_master_prompt", mi_version_image: "gen_ad_image",
};

// Clase de uso que se descuenta del recibo. edge_guard_charge (SQL) solo cubre estas cuatro:
// blueprint, master_prompt, whatsapp_script y vsl_prompt (hasta 3 usos cada una, 2 horas). Las piezas
// nuevas usan dos de ellas para no tocar la base: el texto cuenta como master_prompt y la imagen como
// vsl_prompt (el guion de video ya no se pide dentro de Mi versión). Migración propuesta en el reporte
// R2-12 para darles nombre propio.
const RECEIPT_KIND: Record<Kind, string> = {
  creativos: "creativos", landing: "landing", avatar: "avatar", funnel: "funnel",
  master_prompt: "master_prompt", whatsapp_script: "whatsapp_script", vsl_prompt: "vsl_prompt",
  mi_version: "master_prompt", mi_version_image: "vsl_prompt",
};

// Lo que ninguna imagen puede mostrar (mismo texto que generate-ad-creative; se añade en el servidor).
const SAFE_RULES = "Apto para todo público: nada sexual, sin desnudos ni poses o ropa sugerentes; sin cuerpos antes y después ni cambios físicos; sin cifras de dinero, peso o salud; sin logos, nombres ni empaques de marcas existentes, tampoco de la oferta que se modela, ni personas famosas; el único nombre de producto que puede aparecer escrito es el del usuario.";

const PROMPTS: Record<Exclude<Kind, "mi_version" | "mi_version_image">, { system: string; user: (b: Body) => string }> = {
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
  master_prompt: {
    system:
      "Eres un prompt engineer senior especializado en direct response marketing y product strategy. Tu output será usado por otra IA (Claude, ChatGPT, Gemini u otra) para generar activos reales. Escribe para un principiante de LATAM: español sencillo, frases cortas, sin jerga sin explicar. Nunca menciones números de versión de modelos de IA (solo la marca) ni ates al usuario a una herramienta concreta. Devuelve SOLO Markdown, sin preámbulos.",
    user: (b) => `A partir del siguiente informe de inteligencia de la oferta de ${b.brand ?? b.url ?? "el competidor"}, construye un MEGA-PROMPT REPLICADOR: un conjunto de prompts autosuficientes y portables que cualquiera pueda pegar en Claude, ChatGPT u otra IA para crear SU PROPIA versión, mejorada y más rentable, de esta oferta — como mini app y como campaña de anuncios.

INFORME ORIGINAL:
${b.analysis}

REGLAS PARA LOS PROMPTS:
- Nombra las IAs solo por su marca ("Claude, ChatGPT u otra IA"), NUNCA con número de versión.
- El PROMPT 2 debe funcionar en CUALQUIER herramienta que crea apps con IA o agente de código (Lovable, Bolt, v0, Claude Code, Codex, ChatGPT u otra). No impongas lenguaje, framework ni proveedor: describe pantallas, datos, lógica y cobros; la herramienta elige la tecnología.
- Español sencillo: frases cortas, cero jerga sin explicar.

FORMATO EXACTO (respeta encabezados y bloques de código):

## 🧬 Tu versión de este negocio

### En 3 líneas
[Qué hace la oferta original, su punto débil clave, y cuál es el ángulo mejorado de TU versión]

### Tu ángulo mejorado
[1 párrafo corto: mecanismo único, idea diferenciada, por qué se vende mejor]

---

## 🎯 PROMPT 1 · Tus anuncios (pégalo en Claude, ChatGPT u otra IA)

\`\`\`
Eres un copywriter senior de respuesta directa. Vamos a crear una oferta SUPERIOR a la siguiente:

[Inserta aquí un brief denso de 8-15 líneas con: nicho, cliente ideal exacto, dolor central, deseo, mecanismo único mejorado, prueba, garantía, precio sugerido, oferta apilada, 3 objeciones principales, y palabras prohibidas]

Tu tarea:
1. 10 ganchos distintos (dolor, curiosidad, prueba, autoridad, urgencia, contrario, historia, pregunta, dato, ruptura de patrón)
2. 3 textos de anuncio completos (corto 80 palabras, medio 180, largo 300+) con titular + texto principal + descripción + llamada a la acción
3. 3 ideas de creativo visual (UGC, persona hablando a cámara, carrusel) con guion segundo a segundo
4. Plan de prueba: 3 públicos + 3 ubicaciones + meta de costo por venta

Tono: [tono]. Idioma: español latinoamericano. Sin emojis salvo donde ayuden a vender.
\`\`\`

---

## 🛠 PROMPT 2 · Tu mini app (pégalo en la herramienta de IA que uses para crear apps)

\`\`\`
Crea una app web sencilla que sea mi versión mejorada de esta oferta. Usa la tecnología que mejor domines; lo importante es que funcione, se vea bien en el celular y pueda cobrar.

QUÉ PROBLEMA RESUELVE Y PARA QUIÉN:
[8-12 líneas: nicho, cliente ideal, dolor que resolvemos mejor que el competidor, mecanismo único]

PANTALLAS (en este orden):
1. Página de inicio: titular ganador, beneficio en una línea, botón para empezar
2. [Pantalla del mecanismo — ej. quiz o formulario — qué pregunta y qué pide]
3. [Pantalla de resultado — qué entrega exactamente al usuario]
4. [Pantalla de pago / acceso]
5. [Otras pantallas imprescindibles, máximo 2]

DATOS QUE GUARDA:
- [Qué información del usuario y de su resultado se guarda, en palabras simples]

LÓGICA:
- [Cómo convierte las respuestas del usuario en su resultado, paso a paso]

COBRO:
- [Pago único o suscripción] de $[precio] con un enlace de pago (Stripe, Whop, Hotmart u otro). Si la herramienta no permite integrar pagos, deja un botón que abra ese enlace.
- Qué es gratis: [límite] · Qué se paga: [qué incluye]

DISEÑO:
- Primero para celular, limpio y claro. Estilo: [según la marca]
- Todos los textos de la interfaz en español, tono: [tono]

Construye paso a paso: primero la página de inicio, luego el mecanismo, luego el resultado y al final el cobro. Al terminar cada paso, debe poder probarse.
\`\`\`

---

## 🧠 PROMPT 3 · Revisa tu negocio antes de pagar anuncios (pégalo en Claude, ChatGPT u otra IA)

\`\`\`
Actúa como un mentor experto en vender por internet. Voy a lanzar esta oferta/app: [resumen de 5 líneas de la oferta y la mini app de arriba].

Antes de gastar dinero en anuncios, dime:
1. Las 5 razones por las que puede fallar en los primeros 30 días
2. Cómo arreglar cada una (en el texto, la oferta o el producto)
3. Qué números revisar cada semana y qué valor es normal
4. Un plan de 14 días de publicaciones gratis (TikTok, Reels) que ayude a vender
5. La primera prueba barata que haría para validar que la gente paga
\`\`\`

---

## ✅ Cómo usar estos prompts
1. **Tu mini app:** copia el PROMPT 2 y pégalo en la herramienta de IA que uses para crear apps (Lovable, Bolt, v0, Claude Code, Codex, ChatGPT u otra).
2. **Revísala:** pega el PROMPT 3 en Claude, ChatGPT u otra IA antes de invertir en anuncios.
3. **Tus anuncios:** pega el PROMPT 1 en Claude, ChatGPT u otra IA y prueba con poco presupuesto ($50-$100) antes de subirlo.`,
  },
  whatsapp_script: {
    system:
      "Eres un vendedor experto en cierre por WhatsApp para LATAM, especializado en cobro manual (transferencia/app local), en español latinoamericano. Devuelve SOLO Markdown listo para copiar y pegar en WhatsApp, sin preámbulos.",
    user: (b) => `A partir de este informe de inteligencia de la oferta de ${b.brand ?? b.url ?? "el competidor"}, arma el guion de venta por WhatsApp de una versión propia de este negocio, con cobro manual en ${paymentHint(b.country, b.currency).label}.

INFORME:
${b.analysis}

MÉTODOS DE COBRO DISPONIBLES EN ESE PAÍS: ${paymentHint(b.country, b.currency).methods}

FORMATO EXACTO:

## 💵 Precio sugerido
[Precio único en ${paymentHint(b.country, b.currency).currency}, redondo y realista para ese mercado, con 1 línea justificando por qué ese precio funciona]

## 👋 Mensaje de apertura (primer contacto)
[Mensaje corto, 3-4 líneas, hook + pregunta que abre conversación — NO vende todavía]

## 🎯 Presentación de la oferta
[Mensaje de seguimiento cuando responden: qué es, qué resuelve, 3 beneficios concretos — 5-6 líneas, tono cercano de WhatsApp, no de anuncio]

## 🙅 Las 2 objeciones más comunes
**"[objeción 1 literal, ej: está caro / no sé si funciona]"**
→ [respuesta lista para copiar y pegar]

**"[objeción 2 literal]"**
→ [respuesta lista para copiar y pegar]

## ✅ Mensaje de cierre + cómo pagar
[Mensaje que pide el pago, menciona el precio y explica EXACTAMENTE cómo pagar usando los métodos de cobro de arriba — número/cuenta como placeholder "[tu número Nequi/cuenta]"]

## 🔁 Mensaje de seguimiento (si no responde en 24h)
[Mensaje corto de reenganche, sin sonar desesperado]

## 📌 Recordatorio
Copia estos mensajes, reemplaza los placeholders con tus datos reales de cobro, y empieza a mandarlos hoy mismo a tu lista de contactos o grupos de WhatsApp.`,
  },
  vsl_prompt: {
    system:
      "Eres un guionista de VSL (video sales letter) de direct response en español latinoamericano, experto en cierre corto de 5-7 minutos. Devuelve SOLO Markdown listo para grabar, sin preámbulos.",
    user: (b) => `A partir de este informe de inteligencia de la oferta de ${b.brand ?? b.url ?? "el competidor"}, escribe el guion completo de una VSL de 5-7 minutos para una versión propia y mejorada de este negocio, con cobro automático vía link de pago.

INFORME:
${b.analysis}

FORMATO EXACTO:

## 🎬 Guion VSL completo (con timestamps)
[Guion palabra por palabra desde 0:00 hasta el cierre, marcando minutos aproximados: 0:00 Hook, 0:30 Problema, 1:30 Agitación, 2:30 Mecanismo único, 4:00 Prueba/autoridad, 5:00 Oferta y precio, 6:00 Garantía, 6:30 CTA final]

## 🎥 Cómo grabarla sin equipo
[3-4 líneas: grabar con el celular o pantalla (Loom/CapCut), sin necesidad de estudio ni editor profesional]

## 🔗 Conectar el cobro automático (Whop)
1. Crea un producto de pago único o suscripción en Whop con el precio de esta oferta.
2. Copia el link de checkout que te da Whop.
3. Pega ese link en la descripción del video y dilo en voz alta en el minuto 6:00 ("el link está justo debajo de este video").
4. Sube el video a YouTube (no listado) o a una página simple, y comparte ese link donde publiques tu VSL.

## 📌 Recordatorio
No necesitas una landing compleja: el video + el link de pago de Whop ya es un funnel completo para empezar a cobrar esta semana.`,
  },
};

/** Métodos de cobro manual reales por país, para que la IA no invente apps que no existen ahí. */
function paymentHint(country?: string, currency?: string): { label: string; methods: string; currency: string } {
  const key = (country ?? currency ?? "").toUpperCase();
  const map: Record<string, { label: string; methods: string; currency: string }> = {
    CO: { label: "Colombia (COP)", methods: "Nequi, Daviplata o transferencia Bancolombia", currency: "COP" },
    COP: { label: "Colombia (COP)", methods: "Nequi, Daviplata o transferencia Bancolombia", currency: "COP" },
    DO: { label: "República Dominicana (DOP)", methods: "transferencia Banco Popular, BHD o Banreservas", currency: "DOP" },
    DOP: { label: "República Dominicana (DOP)", methods: "transferencia Banco Popular, BHD o Banreservas", currency: "DOP" },
    MX: { label: "México (MXN)", methods: "transferencia SPEI, Mercado Pago o depósito OXXO", currency: "MXN" },
    MXN: { label: "México (MXN)", methods: "transferencia SPEI, Mercado Pago o depósito OXXO", currency: "MXN" },
    US: { label: "Estados Unidos (USD)", methods: "Zelle, PayPal o Venmo", currency: "USD" },
    USD: { label: "dólares (USD)", methods: "Zelle, PayPal o Venmo", currency: "USD" },
  };
  return map[key] ?? { label: "su país", methods: "PayPal o Wise (transferencia internacional)", currency: "USD" };
}

// Tope de tamaño del cuerpo: este texto acaba en un modelo que cobra por token.
// deno-lint-ignore no-explicit-any
async function readJson(req: Request, maxChars: number): Promise<any> {
  const raw = await req.text();
  if (raw.length > maxChars) throw new Error("La solicitud es demasiado grande.");
  return raw ? JSON.parse(raw) : {};
}

// ── Compuerta de usuario + cobro en el servidor ─────────────────────────
// verify_jwt del gateway NO basta: la llave pública (anon) que viaja en el
// bundle de la web también es un JWT válido. Aquí se exige un USUARIO real con
// acceso vigente, se aplica el tope de uso y —si la acción tiene precio— se
// cobra ANTES de gastar dinero real (RPC edge_guard_charge; el precio lo decide
// la tabla credit_prices, nunca el cliente). Si después la IA falla,
// refundCharge() devuelve el crédito.
interface Gate { userId: string; txId: string | null; charged: number; balance: number | null; receipt: string | null }
interface Billing { action: string; label?: string; kind?: string; receipt?: unknown }

function guardClient() {
  return createGuardClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requireUser(req: Request, fn: string, maxHour: number, maxDay: number, billing?: Billing): Promise<Gate | Response> {
  const deny = (status: number, error: string, extra: Record<string, unknown> = {}) =>
    new Response(JSON.stringify({ error, ...extra }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return deny(401, "Inicia sesión para usar esta función.");
  const guard = guardClient();
  const { data } = await guard.auth.getUser(token);
  const userId = data?.user?.id;
  if (!userId) return deny(401, "Sesión inválida o expirada. Vuelve a iniciar sesión.");
  const receipt = typeof billing?.receipt === "string" && /^[0-9a-f-]{36}$/i.test(billing.receipt) ? billing.receipt : null;
  const { data: g, error } = await guard.rpc("edge_guard_charge", {
    p_user_id: userId, p_fn: fn, p_max_hour: maxHour, p_max_day: maxDay,
    p_action: billing?.action ?? null, p_label: billing?.label?.slice(0, 120) ?? null,
    p_kind: billing?.kind ?? null, p_receipt: receipt,
  });
  if (error) return deny(503, "No se pudo verificar el acceso. Intenta de nuevo.");
  if (g?.ok !== true) {
    switch (g?.reason) {
      case "rate_limited": return deny(429, "Alcanzaste el límite de uso de esta función. Intenta más tarde.");
      case "recharge_required":
        return deny(402, "Ya usaste tus pruebas gratis de esta herramienta. Recarga al menos US$20 para seguir usándola; mientras, puedes probar todo lo demás.", { code: "recharge_required", min_usd: 20 });
      case "insufficient_credits":
        return deny(402, "No tienes créditos suficientes para esta acción.", { code: "insufficient_credits", balance: g.balance, cost: g.cost });
      case "disabled": return deny(503, "Esta función no está disponible por ahora.");
      case "unknown_action": return deny(500, "Acción sin precio configurado.");
      default: return deny(403, "Tu cuenta no tiene acceso activo.");
    }
  }
  return {
    userId, txId: g.tx_id ?? null, charged: Number(g.charged) || 0,
    balance: typeof g.balance === "number" ? g.balance : null, receipt: g.receipt ?? null,
  };
}

// Cabeceras para que la app actualice el saldo sin otra consulta (también en streams).
function billingHeaders(gate: Gate): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Expose-Headers": "x-credits-charged, x-credits-balance, x-credit-receipt",
    "x-credits-charged": String(gate.charged),
  };
  if (gate.balance !== null) h["x-credits-balance"] = String(gate.balance);
  if (gate.receipt) h["x-credit-receipt"] = gate.receipt;
  return h;
}

// La IA falló después de cobrar: se devuelve el crédito (idempotente en la base).
async function refundCharge(gate: Gate | null, reason: string): Promise<void> {
  if (!gate?.txId) return;
  await safeRefund(guardClient(), gate.txId, reason, "oraculo-generate");
}

const json = (status: number, payload: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, ...extra, "Content-Type": "application/json" } });

async function logUsage(userId: string, fn: string, model: string, input: number, output: number, images: number) {
  try {
    const { error } = await guardClient().rpc("log_ai_usage", { p_user_id: userId, p_fn: fn, p_model: model, p_input: input, p_output: output, p_images: images });
    if (error) console.error("log_ai_usage:", error.message);
  } catch (e) { console.error("log_ai_usage:", e instanceof Error ? e.message : e); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let gate: Gate | null = null;
  try {
    const apiKey = (Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));
    if (!apiKey) return json(500, { error: "Missing LOVABLE_API_KEY" });

    const body = (await readJson(req, 80000).catch(() => ({}))) as Body;
    if (!body.kind || !Object.prototype.hasOwnProperty.call(KIND_ACTION, body.kind)) return json(400, { error: "kind inválido" });

    // Topes por campo: todo esto se interpola en el prompt.
    const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : undefined);
    body.brand = clip(body.brand, 200);
    body.url = clip(body.url, 500);
    body.country = clip(body.country, 40);
    body.currency = clip(body.currency, 40);

    // ── Imagen de "Mi versión": va cubierta por el recibo del cobro de mi_version ──────────────
    if (body.kind === "mi_version_image") {
      const scene = String(clip(body.image_prompt, 1200) ?? "").trim();
      const text = String(clip(body.image_text, 60) ?? "").replace(/["“”]/g, "").trim();
      if (scene.length < 10) return json(400, { error: "Falta la descripción de la imagen." });
      if (typeof body.receipt !== "string") return json(400, { error: "Primero haz tu versión: la imagen va incluida en ella." });
      const g = await requireUser(req, "oraculo-generate", 40, 200, {
        action: KIND_ACTION.mi_version_image, kind: RECEIPT_KIND.mi_version_image, receipt: body.receipt,
        label: `Imagen de Mi versión${body.brand ? ` · ${body.brand}` : ""}`.slice(0, 80),
      });
      if (g instanceof Response) return g;
      gate = g;
      const fullPrompt = `${scene}${text ? `\nTexto grande y legible en la imagen, en español, escrito exactamente así: "${text}". Ningún otro texto.` : "\nSin texto en la imagen."}\n\nFormato: square 1:1 format, Instagram/Facebook feed ad. Estilo publicitario profesional, alta calidad, listo para usar como creativo de anuncio en redes sociales. ${SAFE_RULES}`;
      const am = await apimartImage(fullPrompt, "1:1");
      if (am) {
        await logUsage(gate.userId, "oraculo-generate:mi_version_image", "apimart/gpt-image-2", 0, 0, 1);
        return json(200, { kind: body.kind, image: `data:${am.mime};base64,${am.b64}`, billing: { charged: gate.charged, balance: gate.balance, receipt: gate.receipt } }, billingHeaders(gate));
      }
      // Respaldo: Gemini directo (más caro, mismo resultado para la persona).
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gemini-2.5-flash-image", prompt: fullPrompt, response_format: "b64_json", n: 1 }),
      });
      if (!r.ok) {
        await refundCharge(gate, `imagen IA ${r.status}`);
        console.error("oraculo-generate imagen:", r.status, (await r.text()).slice(0, 300));
        return json(r.status === 429 ? 429 : 502, { error: "No se pudo crear la imagen. No se te cobró: toca Reintentar." });
      }
      const data = await r.json();
      const b64 = data?.data?.[0]?.b64_json;
      await logUsage(gate.userId, "oraculo-generate:mi_version_image", "gemini-2.5-flash-image", 0, 0, b64 ? 1 : 0);
      if (!b64) {
        await refundCharge(gate, "sin imagen");
        return json(502, { error: "La IA no devolvió la imagen. No se te cobró: toca Reintentar." });
      }
      return json(200, { kind: body.kind, image: `data:image/png;base64,${b64}`, billing: { charged: gate.charged, balance: gate.balance, receipt: gate.receipt } }, billingHeaders(gate));
    }

    if (!body.analysis || body.analysis.trim().length < 80) return json(400, { error: "analysis requerido" });
    body.analysis = String(body.analysis).slice(0, 40_000);
    const isMi = body.kind === "mi_version";

    const g = await requireUser(req, "oraculo-generate", 40, 200, {
      action: KIND_ACTION[body.kind], kind: RECEIPT_KIND[body.kind], receipt: body.receipt,
      label: isMi
        ? `Mi versión${body.brand ? ` · ${body.brand}` : ""}`.slice(0, 80)
        : body.brand ? `${body.kind} · ${body.brand}`.slice(0, 80) : undefined,
    });
    if (g instanceof Response) return g;
    gate = g;

    const kind = body.kind as Exclude<Kind, "mi_version" | "mi_version_image">;
    const system = isMi ? MI_VERSION_SYSTEM : PROMPTS[kind].system;
    const user = isMi ? miVersionPrompt(body.analysis, paymentHint(body.country, body.currency)) : PROMPTS[kind].user(body);

    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-3-flash-preview",
        messages: [
          { role: "system", content: system + HONESTY_RULES },
          { role: "user", content: user },
        ],
        ...(isMi ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    if (!r.ok) await refundCharge(gate, `IA ${r.status}`);
    if (r.status === 429) return json(429, { error: "La IA está saturada. No se te cobró: intenta en un momento." });
    if (r.status === 402) {
      console.error("oraculo-generate: el proveedor de IA respondió 402 (saldo prepago agotado)");
      return json(503, { error: "La IA no está disponible en este momento. No se te cobró: inténtalo más tarde." });
    }
    if (!r.ok) {
      const t = await r.text();
      console.error("oraculo-generate IA:", r.status, t.slice(0, 300));
      return json(502, { error: "La IA no respondió. No se te cobró: inténtalo de nuevo." });
    }

    const data = await r.json();
    // Costo real (tabla ai_usage). Salida = total − entrada: incluye el razonamiento, que se cobra.
    const u = data?.usage;
    if (u) {
      const input = Number(u.prompt_tokens) || 0;
      const output = Math.max(Number(u.completion_tokens) || 0, (Number(u.total_tokens) || 0) - input);
      await logUsage(gate.userId, `oraculo-generate:${body.kind}`, "gemini-3-flash-preview", input, output, 0);
    }
    const content = data?.choices?.[0]?.message?.content ?? "";
    if (!String(content).trim()) {
      await refundCharge(gate, "respuesta vacía");
      return json(502, { error: "La IA devolvió una respuesta vacía. No se te cobró: inténtalo de nuevo." });
    }

    const billing = { charged: gate.charged, balance: gate.balance, receipt: gate.receipt };
    if (isMi) {
      const mi = normalizeMiVersion(String(content), body.brand);
      if (!mi) {
        await refundCharge(gate, "mi_version sin JSON válido");
        console.error("oraculo-generate mi_version JSON:", String(content).slice(0, 300));
        return json(502, { error: "La IA no armó bien tu versión. No se te cobró: toca Reintentar." });
      }
      return json(200, { kind: body.kind, content: JSON.stringify(mi), data: mi, billing }, billingHeaders(gate));
    }
    return json(200, { kind: body.kind, content, billing }, billingHeaders(gate));
  } catch (e) {
    await refundCharge(gate, "excepción");
    return json(500, { error: e instanceof Error ? e.message : "Unknown" });
  }
});
