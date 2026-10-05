import { fnHeaders, fnErrorMessage, readBilling, type ServerBilling } from "@/lib/fnAuth";
import { businessHint, copyLevelHint, type BusinessProfile } from "@/lib/businessProfile";

/**
 * Los generadores de textos (Robot de copy) y la llamada a la IA que los escribe. Viven aquí para
 * que otras pantallas (p. ej. Order bump) usen el MISMO prompt y la MISMA llamada sin copiarlos.
 * El cobro lo hace el servidor (ai-chat con generator_id → edge_guard_charge); el cliente solo
 * refleja el saldo con applyServerCharge.
 */
export interface Generator {
  id: string;
  title: string;
  description: string;
  category: string;
  recommended?: boolean;
  /** Prompt propio para frameworks específicos; si falta, se usa el genérico. */
  prompt?: string;
}

// Framework T→MAES→A/N para videos yapping (talking-head hablado a cámara).
// La versión corta sale calibrada a ~150 palabras A PROPÓSITO: es el límite
// de Media Studio (160), así el guion pasa directo al video con avatar IA.
const YAPPING_PROMPT = `Eres un guionista experto en videos "yapping" (talking-head hablado a cámara, estilo TikTok/Reels/Shorts) para creadores de direct response. Escribes guiones que suenan a una persona real hablando con convicción, no a un anuncio.

ESTRUCTURA OBLIGATORIA — framework T→MAES→A/N:
1) T — THOUGHT o TOPIC: abre con el pensamiento o tema en UNA frase que detiene el scroll (el hook).
2) MAES — desarrolla con las 2-3 herramientas que mejor le queden al tema: Metáfora, Analogía, Ejemplo concreto o Historia breve en primera persona. NO uses las cuatro mecánicamente: elige las que más venden la idea.
3) A/N — cierra con Aplicación (cómo el espectador lo aplica HOY) o Next steps (el siguiente paso claro / CTA).

FORMATO EXACTO de tu respuesta:

## 🎬 Guion corto (~150 palabras — listo para grabar o para un avatar con IA)
[Guion hablado corrido, sin encabezados internos. Tono conversacional, primera persona, frases cortas.]

## 🎬 Versión extendida (90-120 segundos)
**[T] 0:00 —** [apertura con el hook]
**[MAES] 0:10 —** [desarrollo, marcando entre paréntesis qué herramienta usas: (metáfora), (ejemplo), (historia)…]
**[A/N] 1:20 —** [cierre con aplicación o próximo paso + CTA]

## ⚡ 3 hooks alternativos para el mismo tema
1. […]
2. […]
3. […]

## 📌 Nota de grabación
[1-2 líneas: tono, ritmo y dónde enfatizar]`;

// ── Embudo completo ────────────────────────────────────────────────────────
// Una herramienta por cada pieza de una operación de infoproductos que factura a diario:
// ecosistema de productos, tráfico, creativos, VSL, upsell/downsell y ascensiones.
// El objetivo no es ser la mejor herramienta de cada cosa, sino que el usuario tenga
// cada pieza resuelta dentro de SUPERNOVA, en español y lista para usar.
const FORMAT_RULES = `Escribe en español neutro, para alguien que empieza. Frases cortas. Usa títulos con ## y listas. Precios en USD y, entre paréntesis, una referencia en pesos mexicanos o colombianos. No prometas resultados garantizados ni cifras de ingresos: si algo depende del mercado, dilo.`;

const ECOSYSTEM_PROMPT = `Eres un estratega de direct response que diseña ECOSISTEMAS DE PRODUCTOS (escaleras de valor) para infoproductos. A partir del producto del usuario, diseña su escalera completa para que cada cliente valga 2-4 veces más que la primera compra.

Entrega exactamente estas secciones:
## 1. Producto de entrada (front)
Qué es, precio (bajo, para que compren fácil) y por qué es la puerta de entrada.
## 2. Order bump (el extra de un clic antes de pagar)
Qué es, precio (entre 20% y 40% del front) y la frase del checkbox.
## 3. Upsell 1 (justo después de pagar)
Qué es, precio, y por qué quien compró el front lo quiere ya.
## 4. Downsell (si rechaza el upsell)
Versión más barata o en cuotas del upsell. Precio.
## 5. Upsell 2 / continuidad
Una suscripción mensual o un complemento que se repite. Precio.
## 6. Ascensión (ticket alto)
Mentoría, programa o servicio hecho para ti. Precio y cómo llega el cliente (aplicación, llamada, WhatsApp).
## 7. Tabla resumen
Paso | Producto | Precio | % de compradores que suele tomarlo (rango orientativo, dilo como estimación).
## 8. Ticket promedio estimado
Cálculo simple con esos rangos, marcado como estimación.

${FORMAT_RULES}`;

const VSL_MAIN_PROMPT = `Eres un copywriter de respuesta directa. Escribe la VSL PRINCIPAL (la de la oferta de entrada) de 8 a 12 minutos, lista para grabar o para leer con un avatar.

Estructura, con marcas de tiempo aproximadas:
## 0:00 Gancho (primeros 10 segundos)
3 opciones de gancho distintas.
## Historia y problema
## Por qué lo que intentó antes no funcionó
## El mecanismo único (el "por qué" nuevo)
## Prueba (qué tipo de prueba usar y dónde conseguirla si aún no tiene)
## Presentación de la oferta y lo que incluye
## Bonos
## Garantía
## Precio y comparación de valor
## Urgencia o escasez REAL (nada inventado)
## Llamada a la acción (repetida 2 veces)

Al final, una línea con el texto de la pantalla del botón de compra.
${FORMAT_RULES}`;

const ORDER_BUMP_PROMPT = `Eres un especialista en checkouts de infoproductos. Diseña ORDER BUMPS: el extra de un clic que aparece justo antes de pagar.

Entrega 3 opciones distintas. Para cada una:
## Opción N: [nombre]
- Qué es (algo pequeño que complementa el producto principal y se entrega al instante)
- Precio (entre 20% y 40% del producto principal)
- Titular del bump (máx 8 palabras)
- Texto del checkbox: "¡Sí, quiero…!" (una línea)
- Descripción de 2-3 líneas
Al final, cuál recomiendas probar primero y por qué.
${FORMAT_RULES}`;

const ASCENSION_PROMPT = `Eres un estratega de ofertas de ticket alto. Diseña la OFERTA DE ASCENSIÓN: el siguiente escalón para el cliente que ya compró el producto barato y quiere resultados más rápido o con ayuda.

Entrega:
## La oferta
Formato (mentoría grupal, 1 a 1, hecho para ti, programa de X semanas), qué incluye y precio.
## A quién se la ofreces y cuándo
Qué señales indican que un cliente está listo.
## Cómo llega (el puente)
Mensaje de WhatsApp o email para invitarlo, y el formulario de aplicación (5-7 preguntas).
## Guion de la llamada de venta
Apertura, diagnóstico (preguntas), presentación, manejo de 4 objeciones típicas, cierre.
${FORMAT_RULES}`;

const META_CAMPAIGN_PROMPT = `Eres un media buyer de Meta Ads para infoproductos en LATAM. Diseña la ESTRUCTURA DE CAMPAÑA para lanzar y probar esta oferta con poco presupuesto.

Entrega:
## Objetivo y evento de conversión
## Estructura de la campaña de prueba
Campaña, conjuntos de anuncios (cuántos y con qué audiencia: abierta, intereses, similares), presupuesto diario inicial en USD y cuántos creativos por conjunto.
## Qué medir y los umbrales
CTR, CPC, costo por clic en "comprar", costo por venta. Da rangos orientativos y aclara que dependen del nicho y del país.
## Reglas de decisión
Cuándo apagar un anuncio, cuándo dejarlo correr, cuándo escalar y cómo (subir presupuesto, duplicar).
## Calendario de los primeros 7 días
Día por día, qué hacer.
## Errores que queman dinero
5 errores típicos del principiante.
${FORMAT_RULES}`;

const UGC_PROMPT = `Eres un director de anuncios UGC (contenido estilo cliente real) para Reels y TikTok. Escribe 3 GUIONES UGC de 15 a 30 segundos para anunciar este producto.

Para cada guion:
## Guion N: [ángulo]
- Gancho (0-3 s): lo que se dice y lo que se ve
- Desarrollo (3-20 s): demostración o historia breve
- Prueba o resultado (sin cifras inventadas)
- Llamada a la acción
- Texto en pantalla (subtítulos clave)
- Indicaciones de grabación: plano, lugar, tono, qué mostrar
Al final: "Puedes grabarlo tú, pedírselo a un creador o hacerlo con un avatar de IA (guion de máximo 160 palabras)."
${FORMAT_RULES}`;

const CREATIVE_BRIEF_PROMPT = `Eres un estratega de creativos para Meta Ads. Arma un PLAN DE 10 CREATIVOS para testear esta oferta, cada uno con un ángulo distinto (dolor, deseo, miedo, curiosidad, prueba social, autoridad, contrario, historia, comparación, oferta).

Para cada creativo:
## Creativo N: [ángulo]
- Formato: video corto, imagen o carrusel
- Gancho / titular
- Texto principal del anuncio (2-4 líneas)
- Qué se ve (descripción de la imagen o de las escenas)
Al final: en qué orden lanzarlos y cómo leer los resultados después de 3 días.
${FORMAT_RULES}`;

export const generators: Generator[] = [
  {
    id: "ecosystem",
    title: "Escalera de productos: qué venderle a un mismo cliente",
    description: "Todo lo que puedes ofrecerle a quien te compra, en orden: un producto de entrada barato, un extra antes de pagar (order bump), ofertas justo después de comprar (upsell y downsell), una suscripción y un servicio de precio alto. Con precios sugeridos y cuánto te dejaría cada cliente, como estimación. Si no sabes por dónde empezar tu embudo, empieza aquí.",
    category: "funnel",
    recommended: true,
    prompt: ECOSYSTEM_PROMPT,
  },
  {
    id: "vsl-main",
    title: "VSL principal: guion del video que vende (8–12 min)",
    description: "El guion completo del video de ventas de tu producto, con los minutos marcados: 3 formas de abrir, tu historia, por qué tu método es distinto, la oferta, la garantía y el cierre. Listo para grabarlo tú o leerlo con un avatar.",
    category: "funnel",
    recommended: true,
    prompt: VSL_MAIN_PROMPT,
  },
  {
    id: "order-bump",
    title: "Order bump: el extra que se agrega antes de pagar",
    description: "3 ideas de un producto pequeño que el cliente suma con un clic en la página de pago. Cada una con precio, titular y el texto de la casilla (\"¡Sí, lo quiero!\").",
    category: "funnel",
    prompt: ORDER_BUMP_PROMPT,
  },
  {
    id: "ascension-offer",
    title: "Oferta de precio alto para quien ya te compró",
    description: "El siguiente paso para tus clientes (una mentoría o un programa): qué incluye y cuánto cobrar, el mensaje para invitarlos, un formulario de 5 a 7 preguntas y el guion de la llamada de venta.",
    category: "funnel",
    prompt: ASCENSION_PROMPT,
  },
  {
    id: "meta-campaign",
    title: "Tu primera campaña en Meta Ads (Facebook e Instagram)",
    description: "Cómo armar una campaña de prueba con poco dinero: cuántos anuncios poner, a quién mostrarlos, cuánto gastar al día, qué números mirar, cuándo apagar o subir el presupuesto y qué hacer cada día de la primera semana.",
    category: "funnel",
    recommended: true,
    prompt: META_CAMPAIGN_PROMPT,
  },
  {
    id: "ugc-script",
    title: "Guiones UGC: anuncios que parecen de un cliente real (15–30 s)",
    description: "3 guiones de video corto con qué decir en los primeros 3 segundos, qué mostrar, cómo cerrar y cómo grabarlo. Puedes grabarlos tú, pedírselos a un creador o hacerlos con un avatar de IA.",
    category: "funnel",
    prompt: UGC_PROMPT,
  },
  {
    id: "creative-brief",
    title: "10 anuncios distintos para probar cuál funciona",
    description: "10 anuncios, cada uno contado desde un enfoque distinto (dolor, deseo, curiosidad, historia, comparación…): la primera frase, el texto y qué se ve en la imagen o el video. Te dice en qué orden lanzarlos y cómo leer los resultados a los 3 días.",
    category: "funnel",
    prompt: CREATIVE_BRIEF_PROMPT,
  },
  {
    id: "yapping-script",
    title: "Guion para hablarle a la cámara (video yapping)",
    description: "Un guion para grabarte hablando, estilo TikTok o Reels: una primera frase que frena el scroll, una explicación con un ejemplo o una historia y un cierre que dice qué hacer. Trae una versión corta de unas 150 palabras (ideal para un video con avatar), una larga y 3 aperturas más. Usa el método T→MAES→A/N.",
    category: "social",
    recommended: true,
    prompt: YAPPING_PROMPT,
  },
  {
    id: "vsl-downsell",
    title: "VSL downsell: video para quien dijo que no (5–7 min)",
    description: "Guion de un video de ventas de 5 a 7 minutos que le ofrece una versión más barata (downsell) a quien no aceptó tu oferta anterior.",
    category: "funnel",
    recommended: true,
  },
  {
    id: "vsl-upsell-2",
    title: "VSL segundo upsell: segunda oferta tras la compra (5–7 min)",
    description: "Guion de un video de ventas de 5 a 7 minutos para ofrecer un segundo producto extra (upsell) a quien ya compró y aceptó el primero.",
    category: "funnel",
    recommended: true,
  },
  {
    id: "vsl-upsell-1",
    title: "VSL primer upsell: oferta justo después de comprar (5–7 min)",
    description: "Guion de un video de ventas de 5 a 7 minutos para ofrecer un producto extra (upsell) a quien acaba de comprar.",
    category: "funnel",
  },
  {
    id: "landing-copy",
    title: "Textos para tu página de ventas",
    description: "Todo el texto de tu página de ventas, de arriba abajo: titular, el problema, qué gana la persona, qué incluye la oferta, bonos, garantía, preguntas frecuentes y el botón de compra.",
    category: "copywriting",
  },
  {
    id: "email-sequence",
    title: "Secuencia de 5 a 7 correos de venta",
    description: "De 5 a 7 correos para enviar, uno por día, a quien te dejó su email: presentan el problema, tu solución y tu oferta. Cada uno con asunto y texto listos para pegar en tu herramienta de correo.",
    category: "emails",
    recommended: true,
  },
  {
    id: "email-launch",
    title: "Correos para lanzar un producto digital",
    description: "Los correos para anunciar un producto nuevo: antes de abrir la venta, el día que abre y el último día. Cada uno con asunto y texto listos.",
    category: "emails",
  },
  {
    id: "hooks-meta",
    title: "10 hooks para anuncios de Facebook e Instagram",
    description: "10 ganchos (hooks) para tu anuncio: la primera frase o los primeros 3 segundos, lo que hace que la gente deje de deslizar y se quede a ver.",
    category: "social",
    recommended: true,
  },
  {
    id: "hooks-tiktok",
    title: "10 hooks para anuncios de TikTok",
    description: "10 ganchos (hooks) para los primeros 3 segundos de tus videos verticales en TikTok, con qué decir y qué mostrar.",
    category: "social",
  },
  {
    id: "captions-ig",
    title: "Textos para tus publicaciones de Instagram",
    description: "Captions (el texto que va debajo de la foto o del Reel) que invitan a comentar, guardar y escribirte, con una llamada a la acción y hashtags.",
    category: "instagram",
  },
  {
    id: "reels-script",
    title: "Guiones para Reels, Shorts y TikTok",
    description: "Guiones de videos cortos con gancho, desarrollo y cierre, pensados para que la gente los vea hasta el final.",
    category: "instagram",
  },
  {
    id: "yt-script",
    title: "Guion para un video de YouTube",
    description: "Un guion completo: una apertura que retiene, el contenido en orden y un cierre que invita a comprar o a suscribirse.",
    category: "youtube",
  },
  {
    id: "yt-titles",
    title: "Títulos y miniaturas para YouTube",
    description: "Títulos que dan ganas de hacer clic sin engañar, y una idea de miniatura (thumbnail) para cada uno.",
    category: "youtube",
  },
  {
    id: "product-desc",
    title: "Descripción de tu producto",
    description: "Una descripción que vende tu producto físico o digital: qué es, para quién es, qué gana la persona y por qué comprarlo ahora. Sirve para tu tienda, tu catálogo o WhatsApp.",
    category: "product",
  },
  {
    id: "offer-stack",
    title: "Tu oferta completa: bonos, garantía y urgencia",
    description: "Tu oferta armada y lista para presentar (lo que en inglés llaman offer stack): qué incluye, qué bonos sumar, qué garantía dar y una razón real para comprar hoy.",
    category: "funnel",
    recommended: true,
  },
  {
    id: "dm-script",
    title: "Guion para cerrar ventas por mensaje directo (DM)",
    description: "Qué responder, paso a paso, cuando alguien te escribe por Instagram o Facebook: saludo, preguntas, oferta, dudas y cierre.",
    category: "messages",
  },
  {
    id: "funnel-strategy",
    title: "Plan de tu embudo de ventas",
    description: "El camino de tu cliente, del anuncio a la compra (el funnel o embudo): qué pieza necesitas en cada paso (anuncio, página, correos, WhatsApp) y en qué orden hacerlas.",
    category: "funnel",
    recommended: true,
  },
  {
    id: "audience-research",
    title: "Perfil de tu cliente ideal",
    description: "Quién te va a comprar: qué le duele, qué desea, qué lo frena y qué palabras usa. Es la base para escribir todos tus anuncios.",
    category: "strategy",
  },
  {
    id: "whatsapp-sequence",
    title: "Secuencia de mensajes de WhatsApp",
    description: "Los mensajes para escribirle por WhatsApp a quien mostró interés: conversar, resolver dudas y cerrar la venta sin sonar insistente.",
    category: "messages",
  },
];
export const generatorById = (id: string) => generators.find(g => g.id === id);

/** El mensaje que se manda a la IA: prompt del generador + negocio + tono + lo que escribió el usuario. */
export function generatorMessage(generator: Generator, profile: BusinessProfile, input: string): string {
  return generator.prompt
    ? `${generator.prompt}\n${businessHint(profile)}\n${copyLevelHint(profile)}\n\nTEMA / DETALLES DEL USUARIO:\n${input}`
    : `Actúa como un experto en ${generator.category}. Tu tarea: ${generator.description}\n${businessHint(profile)}\n${copyLevelHint(profile)}\n\nDetalles del producto/servicio del usuario:\n${input}\n\nGenera el contenido completo, listo para usar. Sé específico, persuasivo y orientado a conversiones.`;
}

/**
 * Llama a ai-chat con el generator_id (el servidor decide el precio, cobra ANTES de gastar y
 * devuelve los créditos si la IA falla) y va entregando el texto por partes.
 * `onCharged` llega en cuanto el servidor aceptó (con lo que cobró), antes del texto.
 */
export async function streamGenerator(opts: {
  generator: Generator;
  profile: BusinessProfile;
  input: string;
  onCharged: (billing: ServerBilling) => void;
  onText: (fullText: string) => void;
}): Promise<string> {
  const { generator, profile, input, onCharged, onText } = opts;
  const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`, {
    method: "POST",
    headers: await fnHeaders(),
    body: JSON.stringify({
      generator_id: generator.id,
      generator_title: generator.title,
      messages: [{ role: "user", content: generatorMessage(generator, profile, input) }],
    }),
  });
  if (!resp.ok || !resp.body) throw new Error(await fnErrorMessage(resp, "Error al generar"));
  onCharged(readBilling(resp));

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = "";
  let fullOutput = "";
  let streamDone = false;
  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) break;
    textBuffer += decoder.decode(value, { stream: true });
    let newlineIndex: number;
    while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
      let line = textBuffer.slice(0, newlineIndex);
      textBuffer = textBuffer.slice(newlineIndex + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") { streamDone = true; break; }
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          fullOutput += content;
          onText(fullOutput);
        }
      } catch {
        textBuffer = line + "\n" + textBuffer;
        break;
      }
    }
  }
  return fullOutput;
}
