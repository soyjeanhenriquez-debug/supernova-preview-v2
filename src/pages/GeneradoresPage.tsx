import { useState } from "react";
import {
  Sparkles, Heart, Star, Globe, FileText, ShoppingBag, DollarSign,
  Youtube, Instagram, Mail, MessageSquare, BarChart2, Layers, Copy, Loader2
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCredits, generatorCost } from "@/hooks/useCredits";
import { fnHeaders, fnErrorMessage, readBilling } from "@/lib/fnAuth";
import { useFormAssist } from "@/lib/formAssist";
import { AssistButton } from "@/components/AssistButton";

const categories = [
  { icon: Sparkles, label: "Todos", id: "all" },
  { icon: Heart, label: "Recomendados", id: "recommended" },
  { icon: Star, label: "Favoritos", id: "favorites" },
  { divider: true },
  { icon: Layers, label: "Embudo completo", id: "funnel" },
  { icon: Globe, label: "Redes Sociales", id: "social" },
  { icon: FileText, label: "Copywriting", id: "copywriting" },
  { icon: ShoppingBag, label: "Producto", id: "product" },
  { icon: DollarSign, label: "Ventas", id: "sales" },
  { icon: Youtube, label: "YouTube", id: "youtube" },
  { icon: Instagram, label: "Instagram", id: "instagram" },
  { icon: Mail, label: "E-mails", id: "emails" },
  { icon: MessageSquare, label: "Mensajes", id: "messages" },
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

## 🎬 Guion corto (~150 palabras — listo para Media Studio / avatar IA)
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
Al final: "Puedes grabarlo tú, pedírselo a un creador o hacerlo con el avatar de Media Studio (guion de máximo 160 palabras)."
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
    title: "Ecosistema de productos (escalera de valor)",
    description: "Tu producto de entrada, order bump, upsells, downsell, continuidad y ascensión, con precios y ticket promedio estimado.",
    category: "funnel",
    recommended: true,
    prompt: ECOSYSTEM_PROMPT,
  },
  {
    id: "vsl-main",
    title: "VSL principal (8–12 minutos)",
    description: "La VSL de tu oferta de entrada: gancho, historia, mecanismo único, oferta, garantía y cierre, con marcas de tiempo.",
    category: "funnel",
    recommended: true,
    prompt: VSL_MAIN_PROMPT,
  },
  {
    id: "order-bump",
    title: "Order bump (el extra antes de pagar)",
    description: "3 opciones de order bump con precio, titular y el texto del checkbox para tu checkout.",
    category: "funnel",
    prompt: ORDER_BUMP_PROMPT,
  },
  {
    id: "ascension-offer",
    title: "Oferta de ascensión (ticket alto)",
    description: "El siguiente escalón: mentoría o programa, cómo invitar, formulario de aplicación y guion de llamada.",
    category: "funnel",
    prompt: ASCENSION_PROMPT,
  },
  {
    id: "meta-campaign",
    title: "Estructura de campaña en Meta Ads",
    description: "Campaña de prueba, conjuntos, presupuesto inicial, métricas, reglas para apagar o escalar y plan de 7 días.",
    category: "funnel",
    recommended: true,
    prompt: META_CAMPAIGN_PROMPT,
  },
  {
    id: "ugc-script",
    title: "Guiones UGC para anuncios (15–30 s)",
    description: "3 guiones estilo cliente real con gancho, demostración, CTA e indicaciones de grabación. Listos para el avatar de Media Studio.",
    category: "funnel",
    prompt: UGC_PROMPT,
  },
  {
    id: "creative-brief",
    title: "Plan de 10 creativos para testear",
    description: "10 ángulos distintos con gancho, texto del anuncio y qué se ve, más cómo leer los resultados.",
    category: "funnel",
    prompt: CREATIVE_BRIEF_PROMPT,
  },
  {
    id: "yapping-script",
    title: "Guion Video Yapping (T→MAES→A/N)",
    description: "Guion hablado a cámara con el framework T→MAES→A/N: hook, desarrollo con metáfora/ejemplo/historia y cierre con CTA. La versión corta sale lista para Media Studio.",
    category: "social",
    recommended: true,
    prompt: YAPPING_PROMPT,
  },
  {
    id: "vsl-downsell",
    title: "VSL Downsell (5–7 minutos)",
    description: "Genera una VSL de downsell corta y de alta conversión.",
    category: "funnel",
    recommended: true,
  },
  {
    id: "vsl-upsell-2",
    title: "VSL Segundo Upsell (5–7 minutos)",
    description: "Genera una VSL de segundo upsell corta y de alta conversión.",
    category: "funnel",
    recommended: true,
  },
  {
    id: "vsl-upsell-1",
    title: "VSL Primer Upsell (5–7 minutos)",
    description: "Genera una VSL de upsell corta y de alta conversión.",
    category: "funnel",
  },
  {
    id: "landing-copy",
    title: "Copywriting para Páginas de Venta",
    description: "Genera todo el texto para tus páginas de venta con alta conversión.",
    category: "copywriting",
  },
  {
    id: "email-sequence",
    title: "Secuencia de Emails (5-7 emails)",
    description: "Crea una secuencia completa de emails de venta automatizada.",
    category: "emails",
    recommended: true,
  },
  {
    id: "email-launch",
    title: "Emails de Lanzamiento",
    description: "Genera emails persuasivos para lanzamientos de productos digitales.",
    category: "emails",
  },
  {
    id: "hooks-meta",
    title: "Hooks para Meta Ads",
    description: "Genera 10+ hooks de alta conversión para tus anuncios de Facebook e Instagram.",
    category: "social",
    recommended: true,
  },
  {
    id: "hooks-tiktok",
    title: "Hooks para TikTok Ads",
    description: "Crea hooks virales optimizados para TikTok y contenido vertical.",
    category: "social",
  },
  {
    id: "captions-ig",
    title: "Captions para Instagram",
    description: "Genera captions atractivos y optimizados para engagement en Instagram.",
    category: "instagram",
  },
  {
    id: "reels-script",
    title: "Guiones para Reels/Shorts",
    description: "Crea guiones virales para Reels, Shorts y TikToks con estructura probada.",
    category: "instagram",
  },
  {
    id: "yt-script",
    title: "Guión para YouTube",
    description: "Genera guiones completos optimizados para retención y conversión.",
    category: "youtube",
  },
  {
    id: "yt-titles",
    title: "Títulos y Thumbnails YouTube",
    description: "Crea títulos clickbait éticos y conceptos de thumbnails que generan clicks.",
    category: "youtube",
  },
  {
    id: "product-desc",
    title: "Descripción de Producto",
    description: "Genera descripciones persuasivas para productos físicos o digitales.",
    category: "product",
  },
  {
    id: "offer-stack",
    title: "Stack de Oferta Irresistible",
    description: "Diseña una oferta irresistible con bonos, garantía y urgencia.",
    category: "funnel",
    recommended: true,
  },
  {
    id: "dm-script",
    title: "Script de Cierre por DM",
    description: "Genera scripts de cierre de venta por mensajes directos.",
    category: "messages",
  },
  {
    id: "funnel-strategy",
    title: "Estrategia de Funnel Completo",
    description: "Diseña un embudo de ventas optimizado de principio a fin.",
    category: "funnel",
    recommended: true,
  },
  {
    id: "audience-research",
    title: "Investigación de Audiencia",
    description: "Genera un perfil detallado de tu avatar ideal con dolores y deseos.",
    category: "strategy",
  },
  {
    id: "whatsapp-sequence",
    title: "Secuencia de WhatsApp",
    description: "Crea una secuencia de mensajes de WhatsApp para nurturing y cierre.",
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
  const fillInput = async (title: string) => {
    try {
      const s = await assist.generate({ generador: title, ya_escrito: generatorInput });
      if (typeof s.text === "string" && s.text) setGeneratorInput(s.text.slice(0, 2000));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el ejemplo");
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
      toast.error("Escribe los detalles de tu producto/servicio");
      return;
    }
    // Costo interno por tipo de generador (silencioso, sin mostrar en UI)
    const { action } = generatorCost(generator.id);
    if (!canAfford(action)) {
      toast.error("Sin créditos suficientes para generar", {
        description: "Recarga tu saldo o espera al próximo ciclo mensual.",
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
                  ? `${generator.prompt}\n\nTEMA / DETALLES DEL USUARIO:\n${generatorInput}`
                  : `Actúa como un experto en ${generator.category}. Tu tarea: ${generator.description}\n\nDetalles del producto/servicio del usuario:\n${generatorInput}\n\nGenera el contenido completo, listo para usar. Sé específico, persuasivo y orientado a conversiones.`,
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
      toast.success("¡Contenido generado!");
    } catch (err: unknown) {
      toast.error(err instanceof Error && err.message ? err.message : "Error al generar contenido");
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
                <h2 className="font-display font-bold text-2xl text-foreground mb-2">
                  Generadores de Contenido con IA
                </h2>
                <p className="text-sm text-muted-foreground max-w-lg mx-auto">
                  Genera copy, guiones, emails y estrategias con IA entrenada en marketing de alto rendimiento
                </p>
              </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredGenerators.map((gen) => {
                const openGenerator = () => { setActiveGenerator(gen.id); setGeneratorOutput(""); setGeneratorInput(""); };
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
                    {gen.category === "funnel" ? "Embudo completo" :
                     gen.category === "copywriting" ? "Copywriting" :
                     gen.category === "emails" ? "E-mails" :
                     gen.category === "social" ? "Redes Sociales" :
                     gen.category === "instagram" ? "Instagram" :
                     gen.category === "youtube" ? "YouTube" :
                     gen.category === "product" ? "Producto" :
                     gen.category === "sales" ? "Ventas" :
                     gen.category === "messages" ? "Mensajes" :
                     gen.category === "strategy" ? "Estrategia" : gen.category}
                  </span>
                  {/* El precio se ve ANTES de entrar: nadie debería enterarse al cobrarle. */}
                  <span className="text-[11px] font-semibold text-primary tabular-nums whitespace-nowrap">{generatorCost(gen.id).cost} ⚡</span>
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
                    {activeCategory === "favorites" ? "Sin favoritos aún" : "Sin generadores"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {activeCategory === "favorites"
                      ? "Marca generadores como favoritos haciendo clic en la estrella"
                      : "No hay generadores en esta categoría"}
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
                ← Volver a generadores
              </button>

              <div>
                <h2 className="font-display font-bold text-xl text-foreground">{selectedGen.title}</h2>
                <p className="text-sm text-muted-foreground mt-1">{selectedGen.description}</p>
              </div>

              <div className="card-surface rounded-xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-sm font-semibold text-foreground">
                    Describe tu producto o servicio
                  </label>
                  <AssistButton onClick={() => fillInput(selectedGen.title)} loading={assist.loading} filled={!!generatorInput.trim()} />
                </div>
                <textarea
                  value={generatorInput}
                  onChange={(e) => setGeneratorInput(e.target.value)}
                  placeholder={assist.text() ? `Ej.: ${assist.text()}` : "ej: Curso online de marketing digital para emprendedores que quieren escalar sus ventas con Meta Ads. Precio: $497. Público: emprendedores hispanos de 25-45 años..."}
                  rows={5}
                  className="w-full bg-secondary border border-border rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all resize-none"
                />
                <button
                  onClick={() => runGenerator(selectedGen)}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-3 gradient-brand text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 glow-primary"
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Generando...</>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> Generar <span className="opacity-75 font-medium">· {generatorCost(selectedGen.id).cost} ⚡</span></>
                  )}
                </button>
              </div>

              {(generatorOutput || loading) && (
                <div className="card-surface rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-foreground">Resultado</span>
                    {generatorOutput && !loading && (
                      <button
                        onClick={() => { navigator.clipboard.writeText(generatorOutput); toast.success("Copiado"); }}
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
                        <Loader2 className="w-4 h-4 animate-spin" /> Generando contenido...
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
