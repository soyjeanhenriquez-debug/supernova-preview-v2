// SUPERNOVA — "Hacer mi versión" dentro de la app (R2-12, 12-oct-2026).
// Antes la persona recibía 3 prompts para pegar en ChatGPT/Lovable y salía de la app. Ahora recibe UN
// recibo con las piezas listas: la oferta en español (nombre, promesa, para quién, qué incluye), 1 anuncio
// de texto, 1 imagen y el mensaje de WhatsApp para cerrar. El PRECIO y el CPA máximo NO los escribe la IA:
// salen de la oferta real (checkout leído) y se ponen en el navegador, donde la IA dejó {PRECIO}.
// Sin dependencias de Deno: lo prueba vitest (src/components/offers/miVersion.test.ts).

export interface MiVersionData {
  name: string;
  promise: string;
  who: string;
  includes: string[];
  why_it_sells: string[];
  ad: { hook: string; primary_text: string; headline: string; cta: string };
  image: { prompt: string; text: string };
  whatsapp: string;
}

/** Marcador que la IA deja donde va el precio: lo reemplaza el navegador con el precio real. */
export const PRICE_TOKEN = "{PRECIO}";

export const MI_VERSION_SYSTEM =
  "Eres copywriter senior de respuesta directa para emprendedores de Latinoamérica que empiezan de cero. Modelas UNA oferta que ya se vende (método «roba como un artista»): mismo producto, mismo tema, misma idea central, misma estructura y mismo mecanismo, contado en español latino neutro, de tú, con frases cortas, con entrega por WhatsApp y pagos locales. No mezclas ideas de otras ofertas. Devuelves SOLO un objeto JSON válido, sin texto antes ni después.";

/**
 * Lo que la IA debe devolver. `facts` son los datos reales de la oferta (los arma el navegador con lo que ya
 * sabe la app: anuncio, días pagando, mecanismo, público). `payment` son los métodos de cobro reales del país.
 */
export function miVersionPrompt(facts: string, payment: { label: string; methods: string }): string {
  return `Haz MI VERSIÓN de esta oferta que lleva tiempo pagando anuncios (prueba de que vende). Tómala casi idéntica: mismo producto y mismo mecanismo, adaptada a ${payment.label}.

DATOS REALES DE LA OFERTA ORIGINAL (solo referencia; nunca uses su nombre ni su marca):
${facts}

DEVUELVE ESTE JSON (todas las claves, todo en español latino neutro, de tú):
{
  "name": "nombre nuevo y propio para mi versión, máx. 6 palabras, sin la marca ni el nombre de la original",
  "promise": "la promesa en 1 frase (máx. 22 palabras): lo que la persona aprende o logra hacer. Sin cifras de dinero, peso o salud y sin plazos",
  "who": "para quién es, en 1 frase concreta (máx. 20 palabras)",
  "includes": ["3 a 5 cosas que incluye, máx. 12 palabras cada una. Solo lo que se deduce de los datos, dicho de forma general (\\"la guía paso a paso\\"), más las mejoras: entrega por WhatsApp y pago en moneda local"],
  "why_it_sells": ["2 o 3 razones por las que la original vende, basadas SOLO en los datos de arriba (días pagando anuncios, anuncios activos, su idea central). Máx. 20 palabras cada una"],
  "ad": {
    "hook": "primera línea del anuncio, máx. 12 palabras, una sola idea",
    "primary_text": "texto principal del anuncio de Facebook/Instagram, 50 a 110 palabras, listo para publicar, que termina pidiendo escribir por WhatsApp. Sin precio",
    "headline": "titular, máx. 7 palabras",
    "cta": "Enviar mensaje"
  },
  "image": {
    "prompt": "descripción de la imagen del anuncio en 2 o 3 frases: escena, persona u objeto, luz y colores. Sin logos, sin marcas, sin famosos, sin cuerpos antes y después, sin cifras",
    "text": "texto corto para escribir grande en la imagen, máx. 6 palabras"
  },
  "whatsapp": "el mensaje de WhatsApp para CERRAR la venta cuando la persona ya preguntó: 4 a 7 líneas cortas, cercano, dice qué recibe, el precio y cómo pagar con ${payment.methods}. Donde va el precio escribe exactamente ${PRICE_TOKEN} (sin inventar ningún número). Donde va el dato de pago escribe [tu número o cuenta]. Máx. 2 emojis"
}

REGLAS:
- Nunca escribas un precio, un número de ventas ni un resultado: el precio lo pone la app en ${PRICE_TOKEN}.
- Nada de garantías, testimonios, urgencia ni cupos si no están en los datos.
- Nunca digas "clonar" ni "copiar": es tu versión.`;
}

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/\s+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim().slice(0, max) : "";

const list = (v: unknown, maxItems: number, maxLen: number): string[] =>
  Array.isArray(v) ? v.map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems) : [];

/** Quita el nombre de la marca original de un texto (la regla de honestidad lo prohíbe). */
export function stripBrand(text: string, brand?: string | null): string {
  const b = (brand ?? "").trim();
  if (b.length < 3) return text;
  const esc = b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`\\s*(?:de |por )?${esc}`, "gi"), "").replace(/\s{2,}/g, " ").trim();
}

/** Cualquier número con moneda que la IA haya escrito a pesar de la regla se cambia por {PRECIO}. */
export function scrubPrices(text: string): string {
  return text
    .replace(/(?:US\$|USD|COP|COL\$|RD\$|DOP|MX\$|MXN|R\$|€|\$)\s?\d[\d.,]*(?:\s?(?:USD|COP|DOP|MXN|pesos|dólares))?/gi, PRICE_TOKEN)
    .replace(/\d[\d.,]*\s?(?:USD|COP|DOP|MXN|pesos|dólares)/gi, PRICE_TOKEN);
}

/**
 * Lee la respuesta de la IA (JSON, a veces envuelto en ```json) y la deja limpia y con topes. Devuelve null
 * si falta lo esencial (nombre, anuncio o WhatsApp): el servidor devuelve los créditos en ese caso.
 */
export function normalizeMiVersion(raw: string, brand?: string | null): MiVersionData | null {
  let obj: Record<string, unknown>;
  try {
    const t = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const start = t.indexOf("{"), end = t.lastIndexOf("}");
    obj = JSON.parse(start >= 0 && end > start ? t.slice(start, end + 1) : t);
  } catch { return null; }
  if (!obj || typeof obj !== "object") return null;
  const ad = (obj.ad ?? {}) as Record<string, unknown>;
  const image = (obj.image ?? {}) as Record<string, unknown>;
  // La marca se quita solo del NOMBRE: en el resto del texto un nombre de página genérico ("Calistenia")
  // es una palabra normal y quitarla rompería la frase. Ahí manda la regla del prompt.
  let whatsapp = scrubPrices(str(obj.whatsapp, 1200));
  if (whatsapp && !whatsapp.includes(PRICE_TOKEN)) whatsapp = `${whatsapp}\n\nPrecio: ${PRICE_TOKEN}`;
  const data: MiVersionData = {
    name: stripBrand(str(obj.name, 80), brand) || (str(obj.name, 80) ? "Mi versión" : ""),
    promise: scrubPrices(str(obj.promise, 240)),
    who: str(obj.who, 200),
    includes: list(obj.includes, 5, 140),
    why_it_sells: list(obj.why_it_sells, 3, 200),
    ad: {
      hook: str(ad.hook, 140),
      primary_text: scrubPrices(str(ad.primary_text, 1200)),
      headline: str(ad.headline, 80),
      cta: str(ad.cta, 30) || "Enviar mensaje",
    },
    image: { prompt: str(image.prompt, 900), text: str(image.text, 60) },
    whatsapp,
  };
  if (!data.name || !data.ad.primary_text || !data.whatsapp) return null;
  return data;
}
