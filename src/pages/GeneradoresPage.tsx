import { useEffect, useState } from "react";
import {
  Sparkles, Heart, Star, Globe, FileText, ShoppingBag, DollarSign,
  Youtube, Instagram, Mail, MessageSquare, BarChart2, Layers, Copy, Loader2, ChevronDown
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCredits, generatorCost } from "@/hooks/useCredits";
import { fnHeaders, fnErrorMessage, readBilling } from "@/lib/fnAuth";
import { useFormAssist } from "@/lib/formAssist";
import { AssistButton } from "@/components/AssistButton";
import { useBusinessProfile, profileText, profileReady, businessHint, copyLevelHint } from "@/lib/businessProfile";
import { CopyLevelPicker } from "@/components/CopyLevelPicker";

const categories = [
  { icon: Sparkles, label: "Todos", id: "all" },
  { icon: Heart, label: "Recomendados", id: "recommended" },
  { icon: Star, label: "Favoritos", id: "favorites" },
  { divider: true },
  { icon: Layers, label: "Embudo de ventas", id: "funnel" },
  { icon: Globe, label: "Anuncios y redes", id: "social" },
  { icon: FileText, label: "Página de ventas", id: "copywriting" },
  { icon: ShoppingBag, label: "Producto", id: "product" },
  { icon: DollarSign, label: "Ventas", id: "sales" },
  { icon: Youtube, label: "YouTube", id: "youtube" },
  { icon: Instagram, label: "Instagram", id: "instagram" },
  { icon: Mail, label: "Correos", id: "emails" },
  { icon: MessageSquare, label: "WhatsApp y DM", id: "messages" },
  { icon: BarChart2, label: "Estrategia", id: "strategy" },
];

interface Generator {
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

const generators: Generator[] = [
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

export function GeneradoresPage() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [activeGenerator, setActiveGenerator] = useState<string | null>(null);
  const [generatorInput, setGeneratorInput] = useState("");
  const [generatorOutput, setGeneratorOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const { applyServerCharge, canAfford } = useCredits();
  // Un solo ejemplo para todos los generadores: la descripción del producto es la misma en todos.
  const assist = useFormAssist("generator", "", activeGenerator !== null);
  // "Mi negocio": el campo llega lleno con lo que el usuario ya contó (se puede editar).
  const { profile, savePatch, loaded: profileLoaded } = useBusinessProfile();
  // El tono se guarda en "Mi negocio" (solo ese campo).
  const changeTone = (next: typeof profile) => { savePatch({ copy_level: next.copy_level }); };
  const myBusiness = profileReady(profile) ? profileText(profile) : "";
  // Desde el Calendario de contenido llega una pieza para escribirle el guion: se abre ese
  // generador con el negocio y la idea ya puestos.
  useEffect(() => {
    if (!profileLoaded) return;
    let pre: { generator?: string; text?: string } | null = null;
    try { pre = JSON.parse(localStorage.getItem("supernova_generator_prefill") || "null"); localStorage.removeItem("supernova_generator_prefill"); } catch { /* sin almacenamiento */ }
    if (!pre?.generator || !generators.some(g => g.id === pre!.generator)) return;
    setActiveGenerator(pre.generator);
    setGeneratorOutput("");
    setGeneratorInput([myBusiness, pre.text ? `Idea de este contenido: ${pre.text}` : ""].filter(Boolean).join("\n\n").slice(0, 2000));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileLoaded]);
  const fillInput = async (title: string) => {
    try {
      const s = await assist.generate({ generador: title, ya_escrito: generatorInput });
      if (typeof s.text === "string" && s.text) setGeneratorInput(s.text.slice(0, 2000));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo escribir el ejemplo. Prueba otra vez.");
    }
  };

  const filteredGenerators = generators.filter((g) => {
    if (activeCategory === "all") return true;
    if (activeCategory === "recommended") return g.recommended;
    if (activeCategory === "favorites") return favorites.includes(g.id);
    return g.category === activeCategory;
  });

  const toggleFavorite = (id: string) => {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  const runGenerator = async (generator: typeof generators[0]) => {
    if (!generatorInput.trim()) {
      toast.error("Primero cuenta qué vendes: qué es, para quién y cuánto cuesta.");
      return;
    }
    // Costo por tipo de generador (el mismo que se ve en la tarjeta y en el botón)
    const { action, cost } = generatorCost(generator.id);
    if (!canAfford(action)) {
      toast.error(`Te faltan créditos: este generador cuesta ${cost}`, {
        description: "Recarga créditos o espera a que se renueven el mes que viene.",
      });
      return;
    }
    // Cobra el servidor: con generator_id decide el nivel (ligero/medio/pesado)
    // y devuelve el crédito si la IA falla.

    setLoading(true);
    setGeneratorOutput("");

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`,
        {
          method: "POST",
          headers: await fnHeaders(),
          body: JSON.stringify({
            generator_id: generator.id,
            generator_title: generator.title,
            messages: [
              {
                role: "user",
                content: generator.prompt
                  ? `${generator.prompt}\n${businessHint(profile)}\n${copyLevelHint(profile)}\n\nTEMA / DETALLES DEL USUARIO:\n${generatorInput}`
                  : `Actúa como un experto en ${generator.category}. Tu tarea: ${generator.description}\n${businessHint(profile)}\n${copyLevelHint(profile)}\n\nDetalles del producto/servicio del usuario:\n${generatorInput}\n\nGenera el contenido completo, listo para usar. Sé específico, persuasivo y orientado a conversiones.`,
              },
            ],
          }),
        }
      );

      if (!resp.ok || !resp.body) throw new Error(await fnErrorMessage(resp, "Error al generar"));
      applyServerCharge(action, readBilling(resp), generator.title);

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
              setGeneratorOutput(fullOutput);
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
      toast.success("Listo. Revísalo y cópialo.");
    } catch (err: unknown) {
      toast.error(err instanceof Error && err.message ? err.message : "No se pudo generar. Inténtalo de nuevo en un momento.");
    } finally {
      setLoading(false);
    }
  };

  const selectedGen = generators.find((g) => g.id === activeGenerator);

  return (
    <div className="flex flex-col md:flex-row md:h-[calc(100vh-8rem)] gap-0 -m-4 md:-m-6 lg:-m-8">
      {/* Categorías: barra lateral en escritorio, fila de chips deslizable en móvil
          (antes la barra fija de 224px dejaba el contenido en ~170px en un teléfono). */}
      <div className="md:w-56 flex-shrink-0 border-b md:border-b-0 md:border-r border-border bg-card/50 p-3 md:p-4 md:overflow-auto">
        <h3 className="hidden md:block font-display font-bold text-foreground text-base mb-4 px-2">Generadores</h3>
        <nav className="flex md:block gap-1.5 md:space-y-0.5 overflow-x-auto md:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {categories.map((cat, i) => {
            if ('divider' in cat && cat.divider) {
              return <div key={`div-${i}`} className="hidden md:block my-3 border-t border-border" />;
            }
            const Icon = cat.icon!;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => { setActiveCategory(cat.id!); setActiveGenerator(null); }}
                className={`flex items-center gap-2.5 flex-shrink-0 whitespace-nowrap md:w-full px-3 py-2 rounded-lg text-sm transition-all ${
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {cat.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 md:overflow-auto p-4 md:p-6 lg:p-8">
        {!activeGenerator ? (
          <>
            {/* Hero banner */}
            <div className="relative rounded-2xl overflow-hidden mb-8 bg-gradient-to-r from-card via-secondary to-card border border-border">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-primary/10 to-accent/5" />
              <div className="relative px-5 py-8 md:px-8 md:py-10 text-center">
                <p className="text-xs uppercase tracking-wider text-primary font-semibold mb-1">Mi negocio · Etapa 5 · Vender</p>
                <h2 className="font-display font-bold text-2xl text-foreground mb-2">
                  {generators.length} generadores de textos para vender
                </h2>
                <p className="text-sm text-muted-foreground max-w-xl mx-auto">
                  Elige qué texto necesitas, cuenta qué vendes y la IA te lo escribe listo para copiar.
                </p>
                <details className="group mt-2 max-w-md mx-auto">
                  <summary className="inline-flex items-center gap-1 cursor-pointer list-none [&::-webkit-details-marker]:hidden select-none text-[12.5px] font-medium text-muted-foreground hover:text-foreground">
                    ¿Cómo funciona? <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
                  </summary>
                  <ul className="mt-2 space-y-1 pl-4 list-disc marker:text-primary text-[12.5px] text-muted-foreground text-left">
                    <li>Cada tarjeta muestra lo que cuesta en créditos antes de abrirla.</li>
                    <li>¿Empiezas de cero? Abre <b className="text-foreground">Recomendados</b> y prueba los hooks o la escalera de productos.</li>
                    <li>Si ya guardaste tu negocio, el formulario viene lleno.</li>
                  </ul>
                </details>
              </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredGenerators.map((gen) => {
                const openGenerator = () => { setActiveGenerator(gen.id); setGeneratorOutput(""); setGeneratorInput(myBusiness); };
                return (
                // div con rol de botón: dentro va el botón de favorito y un <button>
                // no puede contener otro. flex-col + items-start alinea arriba todas
                // las tarjetas de la fila (un <button> centra su contenido en vertical).
                <div
                  key={gen.id}
                  role="button"
                  tabIndex={0}
                  onClick={openGenerator}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openGenerator(); } }}
                  className="card-surface rounded-xl p-5 text-left hover:border-primary/30 transition-all group relative cursor-pointer flex flex-col items-start focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {/* Favorite */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(gen.id); }}
                    onKeyDown={(e) => e.stopPropagation()}
                    aria-label={favorites.includes(gen.id) ? "Quitar de favoritos" : "Marcar como favorito"}
                    className="absolute top-3 right-3 p-1.5 text-muted-foreground hover:text-warning transition-colors"
                  >
                    <Star className={`w-4 h-4 ${favorites.includes(gen.id) ? "fill-warning text-warning" : ""}`} />
                  </button>

                  {/* Icon */}
                  <div className="w-11 h-11 rounded-xl bg-secondary border border-border flex items-center justify-center mb-4 group-hover:border-primary/30 transition-colors">
                    <Layers className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>

                  <h4 className="text-sm font-semibold text-foreground mb-1.5 pr-6">{gen.title}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-4 flex-1">{gen.description}</p>

                  <div className="flex items-center justify-between gap-2 w-full">
                  <span className="text-xs px-2.5 py-1 rounded-md bg-secondary border border-border text-muted-foreground capitalize">
                    {categories.find((c) => "id" in c && c.id === gen.category)?.label ?? gen.category}
                  </span>
                  {/* El precio se ve ANTES de entrar: nadie debería enterarse al cobrarle. */}
                  <span className="text-[11px] font-semibold text-primary tabular-nums whitespace-nowrap">{generatorCost(gen.id).cost} créditos</span>
                  </div>
                </div>
                );
              })}

              {filteredGenerators.length === 0 && (
                <div className="col-span-full py-16 text-center">
                  <div className="text-4xl mb-3">
                    {activeCategory === "favorites" ? "⭐" : "🔍"}
                  </div>
                  <div className="font-display font-semibold text-foreground mb-1">
                    {activeCategory === "favorites" ? "Todavía no tienes favoritos" : "Aún no hay generadores aquí"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {activeCategory === "favorites"
                      ? "Toca la estrella de un generador para tenerlo a mano en esta lista."
                      : "Prueba con otra categoría o mira Todos."}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          /* Generator detail view */
          selectedGen && (
            <div className="max-w-3xl mx-auto space-y-6">
              <button
                onClick={() => setActiveGenerator(null)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Ver todos los generadores
              </button>

              <div>
                <h2 className="font-display font-bold text-xl text-foreground">{selectedGen.title}</h2>
                <p className="text-sm text-muted-foreground mt-1">{selectedGen.description}</p>
              </div>

              <div className="card-surface rounded-xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-sm font-semibold text-foreground">
                    ¿Qué vendes? Cuéntalo en 2 o 3 líneas
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    {myBusiness && generatorInput.trim() !== myBusiness && (
                      <button type="button" onClick={() => setGeneratorInput(myBusiness)}
                        className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground">Usar los datos de mi negocio</button>
                    )}
                    <AssistButton onClick={() => fillInput(selectedGen.title)} loading={assist.loading} filled={!!generatorInput.trim()} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground -mt-2">
                  Qué es, para quién es y cuánto cuesta. ¿No sabes qué poner? Toca <b className="text-foreground">Rellenar con IA</b>: es gratis y te escribe un ejemplo que puedes cambiar.
                </p>
                <CopyLevelPicker profile={profile} onChange={changeTone} />
                <textarea
                  value={generatorInput}
                  onChange={(e) => setGeneratorInput(e.target.value)}
                  placeholder={assist.text() ? `Ej.: ${assist.text()}` : "Ej.: Curso online de repostería para vender postres desde casa. Para mamás de 25 a 45 años en República Dominicana y México. Precio: 27 USD."}
                  rows={5}
                  className="w-full bg-secondary border border-border rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all resize-none"
                />
                <button
                  onClick={() => runGenerator(selectedGen)}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-3 gradient-brand text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 glow-primary"
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Escribiendo…</>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> Escribirlo <span className="opacity-75 font-medium">· {generatorCost(selectedGen.id).cost} créditos</span></>
                  )}
                </button>
              </div>

              {(generatorOutput || loading) && (
                <div className="card-surface rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-foreground">Tu texto</span>
                    {generatorOutput && !loading && (
                      <button
                        onClick={() => { navigator.clipboard.writeText(generatorOutput); toast.success("Copiado. Ya puedes pegarlo donde quieras."); }}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" /> Copiar
                      </button>
                    )}
                  </div>
                  {/* La IA responde en markdown: se pinta como texto con formato (antes salían
                      los ** y ### en crudo). "Copiar" sigue llevándose el texto tal cual. */}
                  <div className="bg-secondary rounded-lg p-4 text-sm text-foreground leading-relaxed min-h-[100px] overflow-x-auto">
                    {generatorOutput ? (
                      <div className="prose prose-invert prose-sm max-w-none prose-headings:font-display prose-headings:mt-4 prose-headings:mb-2 prose-p:leading-relaxed prose-li:leading-relaxed prose-strong:text-foreground prose-blockquote:border-primary/40 prose-blockquote:not-italic">
                        <ReactMarkdown>{generatorOutput}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" /> Escribiendo tu texto… los más largos tardan un poco más.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
