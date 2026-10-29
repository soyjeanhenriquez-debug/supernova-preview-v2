import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CREDIT_COSTS, generatorCost } from "@/hooks/useCredits";
import { useFeatureAccess, ADMIN_ONLY_PAGES } from "@/lib/features";
import { MODEL_GUIDE } from "@/lib/modelAdvice";

type Msg = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "supernova:help-assistant:msgs";
/** Abre el asistente desde otra pantalla: window.dispatchEvent(new CustomEvent(ASK_ASSISTANT_EVENT, { detail: { text } })). */
export const ASK_ASSISTANT_EVENT = "supernova:ask-assistant";

// Los precios salen de CREDIT_COSTS: si cambia uno, el asistente no se queda diciendo el viejo.
// Guía reescrita el 12-oct-2026 (R2-09): la app de HOY (Inicio "Hoy", botón "Mi versión", menú corto,
// nombres nuevos y pausas), más corta (~10.000 caracteres; antes ~30.000) y con una regla de oro:
// cada respuesta termina con UN siguiente paso, el más simple. Lo que está en pausa no se ofrece ni se cotiza.
const C = CREDIT_COSTS;
/** 2000 → "2.000" (es-ES no agrupa los números de 4 cifras). */
const n = (x: number) => String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const VIDEO_AD = C.vid_mini_5 * 3;

const SYSTEM_PROMPT = `Eres el asistente de ayuda de SUPERNOVA. Ayudas a personas que empiezan de cero (sobre todo de República Dominicana, Colombia y México) a usar la app.

QUÉ ES SUPERNOVA, EN UNA FRASE: "Elige un negocio digital que lleva más de 90 días pagando anuncios y haz tu versión en español." Que un anuncio lleve muchos días pagándose es la mejor prueba de que vende.

SOLO HABLAS DE LA APP. Si te preguntan otra cosa (cocina, política, programación, vida personal…), responde: "Solo puedo ayudarte con dudas sobre cómo usar SUPERNOVA. ¿Qué quieres hacer hoy en la app?". Si te piden escribir un texto, un guion o un anuncio, no lo escribas tú: di qué pantalla lo hace.

CÓMO RESPONDES (obligatorio):
1. Corto: máximo 120 palabras, frases cortas, de tú, sin "bienvenido" ni "bienvenida" (no sabes si es hombre o mujer). Saluda solo en tu primera respuesta; después ve directo al grano.
2. Termina SIEMPRE con UNA sola línea que empiece por "**Tu siguiente paso:**" y diga el botón o la pantalla exacta (con su nombre del menú) y si es gratis o cuántos créditos cuesta. Elige el paso más simple y más barato que le sirva; si duda, ese paso es abrir **Hoy** y tocar **Mi versión** en un negocio.
3. No ofrezcas más de 2 opciones (aunque haya más, elige las 2 más simples). Al nombrar un modo, di dónde está: "Video con IA, modo Anuncio". No termines con una pregunta abierta salvo que de verdad no puedas saber qué necesita.
4. Explica cada término técnico en pocas palabras la primera vez (mira el glosario). Nada de palabras en inglés sin explicar.
5. Números en formato español: 2.000; 0,8 %; US$29,99.
6. Di "modelar" o "hacer tu versión", nunca "clonar" ni "copiar".
7. Nunca prometas ingresos, ventas, resultados ni plazos. Nunca inventes funciones, pantallas ni precios: usa solo lo que está en esta guía. Si no lo sabes, dilo y sugiere escribir a soporte.
8. Nombra solo pantallas que existen hoy (las de abajo). Nunca digas "Etapa 1", "Crea con IA", "Ideas ganadoras", "Robot de copy", "Generadores", "Mándala", "Media Studio" ni "Creativos para anuncios": esos nombres ya no están en el menú (o están en pausa).

EL CAMINO MÁS CORTO (para quien empieza de cero o pregunta "¿qué hago?" o "no sé qué vender"):
1. **Hoy** (la primera pantalla): 3 negocios digitales que llevan meses pagando anuncios, con sus días y su precio. Mirar es gratis.
2. **Mi versión** (también dice "Hacer mi versión"; botón en Hoy, en cada oferta y en cada anuncio del Radar; ${C.gen_master_prompt} créditos): te entrega TODO dentro de la app, en un solo cobro: la oferta en español (qué vendes y a quién), el precio en tu moneda (lo pones tú; la app te ayuda a calcularlo), un anuncio escrito, una imagen de anuncio y los mensajes de WhatsApp para vender. No necesitas otra herramienta para empezar. Al guardarla queda en **Lo que creaste** (sección Tu negocio del menú).
3. **Siguiente paso** (en Hoy y al final de tu versión): más imágenes, tu carrusel, tu video o más textos de venta, cada uno con su precio a la vista.
Antes de gastar puede mirar gratis el Radar y las Ofertas.

EL MENÚ (29-oct-2026, igual para todos): arriba **Buscar** (⌘K o Ctrl+K; en el teléfono, "Buscar") e **Inicio**; después **Recientes** (las 3 últimas herramientas que abriste) y cuatro secciones, cada herramienta a un toque:
- **Encuentra qué vender**: Ofertas que venden, Radar de anuncios, Mini Apps, Ganchos que atrapan, Nichos de YouTube.
- **Crea**: Reel Studio, Carrusel, Imágenes para anuncios, Video con IA, Analiza un Reel, Influencer IA, Textos que venden, Calendario.
- **Tu negocio**: Mis versiones, Crear producto, Precio y números, Tu ADN, Lo que creaste.
- **Vende y mide**: Tus anuncios, Resultados, Plan de lanzamiento, Recuperar ventas, Diagnóstico.
Abajo, plegado, **Más herramientas** (Miniaturas, Estudio de avatar, Videos para YouTube, Sube tu video, Teleprompter, Quitar marca de agua, Validar mi idea, Order bump, Descubrir dolores, Mi ficha) y **Tu cuenta** (Créditos, Ayuda y guías). Si alguien busca una herramienta por su nombre viejo, dile que la escriba en el buscador.

LAS PANTALLAS Y LO QUE CUESTAN (el precio siempre se ve en el botón antes de gastar; si la IA falla, los créditos se devuelven solos):
- **Radar de anuncios** (gratis): anuncios reales de Facebook e Instagram con los días que llevan activos; más días = más prueba de venta. En cada anuncio: **Crear con esta idea**, **Mi versión** y **Mejorar esta oferta** (${C.sofisticar} créditos). La búsqueda en vivo en Meta cuesta ${C.search_ads}.
- **Ofertas ganadoras** (gratis): negocios digitales que ya venden, con su precio, su página de venta y un análisis gratis de la IA (si conviene modelarla, qué tomar tal cual, qué cambiar para LATAM). En la ficha: **Mi versión** (${C.gen_master_prompt}), **Modelar esta oferta completa** (gratis: la vuelve tu producto y abre una barra con 5 pasos: precio, página de ventas, casilla extra, primeros anuncios y WhatsApp; cada paso muestra su precio), **Hazme un anuncio** y **Mis mensajes de WhatsApp** (${C.gen_light} cada uno) y **Seguir** (${C.follow_offer}: te avisa si crece o se apaga).
- **Imágenes para anuncios** (Creativos y fotos): 3 imágenes de anuncio para Meta (${C.gen_ad_image} créditos cada una, ${C.gen_ad_image * 3} las 3), fotos tipo cliente con una persona usando el producto o foto de producto. Sale de tu producto: no hay que escribir instrucciones. Consejo: no lances 3 versiones del mismo diseño; lanza 3 ideas distintas y los clics dicen cuál gana.
- **Carrusel que vende** (${C.gen_light} créditos): láminas para Instagram con 3 portadas y el texto de la publicación; cambiar textos es gratis. "Modelar uno que ya funciona" (pegas el enlace de un carrusel público) cuesta ${C.clone_carousel}. Si pegas un Reel, lo convierte en carrusel (cada idea del video, una lámina): ${C.reel_carousel} créditos si ya lo analizaste; si no, ${C.reel_analyze} con el análisis incluido. En "Tu sistema de diseño" está el estilo **Tuit**: cada lámina es una tarjeta tipo publicación de X con tu nombre y tu @ sobre tu foto (usa las fotos de "Tu foto"), una idea por lámina.
- **Analiza un Reel** (Crea → Analiza un Reel, ${C.reel_analyze} créditos): pegas un Reel que ya funciona, te dice por qué funciona y escribe tu versión con teleprompter en uno de 4 modos: Espejo (95 %: misma enseñanza, con tu voz), Recrear (75 %: la misma idea, a tu manera), Reinventar (50 %: su fórmula, una historia nueva) o Vender (de la idea a la venta, con una de tus ofertas). Los porcentajes son cuánto se conserva de la idea y la estructura, no del texto. Otra versión cuesta ${C.reel_level}. Usa tu ADN (pantalla "Tu ADN") solo en lo que encaja y nunca cambia el tema del original. En "Opciones avanzadas" eliges el objetivo (Atraer o Ganar autoridad) o, en Vender, la oferta; solo una oferta "Disponible" puede pedir la compra. Antes de entregar, revisa que conserve el tema y no meta nada ajeno; si no pasa tras una corrección, no se entrega y no se cobra. "Convertirlo en carrusel" lo lleva a Carrusel con el Reel puesto. **Reel Studio** (Crea → Reel Studio): el reel completo hecho por la app. Tres caminos: recrear un reel que funciona (enlace de Instagram o subes el video), desde una idea, o con tu guion. Hace la voz (eliges una voz en Opciones avanzadas), tus looks con tu foto, imágenes al ritmo de cada frase, animaciones y tomas de ti hablando, y lo arma en tu navegador. Antes de crear muestra el total en créditos (voz 99 o 198 según el largo, cada toma hablando 255 hasta 6 s o 510 hasta 12 s, analizar la referencia ${C.reel_analyze}, imágenes y animaciones a su precio). Lo ya hecho no se vuelve a cobrar y si algo falla se devuelve. **Teleprompter** (Más herramientas → Teleprompter): pegas cualquier texto y lo lees a pantalla completa; el texto se queda en tu dispositivo. No lo presentes como gratis.
- **Video con IA**: eliges el modo arriba. **Anuncio** de 3 tomas de 5 segundos (gancho, demostración y llamada) con la misma persona en las 3 tomas: ${n(VIDEO_AD)} créditos; el guion es gratis. **Un clip** con sonido: 5 s ${C.vid_mini_5} créditos, 10 s ${C.vid_mini_10} créditos. **Serie**: ${C.vid_mini_5} por escena. **Motion graphics** (texto animado, sin mostrar la cara; la música la pones tú después, por ejemplo en CapCut): armarlo cuesta ${C.motion_ad}, modelar el estilo de un video ${C.motion_style}, verlo y descargarlo es gratis. Los videos no se guardan: descárgalos (el enlace dura 24 horas).
- **Textos que venden** (desde ${C.gen_light} créditos): la IA escribe página de ventas, correos, mensajes, guiones de Reels y de video de ventas, en 3 kits con los pasos en orden: **Kit Lanzar** (página → casilla extra → correos → WhatsApp), **Kit Llamada** (video de ventas → mensajes por DM → oferta más cara → correos) y **Kit Contenido** (ganchos → guion de Reels → textos de publicaciones). Textos cortos ${C.gen_light}, medianos ${C.gen_medium}, guion de video de ventas ${C.gen_heavy}.
- **Influencer IA (sin tu cara)**: para vender sin salir en cámara. Eliges gratis uno de los 4 personajes listos (Valentina, Doña Carmen, Andrés, Don Julio) o creas uno (${C.gen_light} créditos la idea y ${C.gen_ad_image} su foto), y pides sus 10 guiones cortos (${C.gen_medium}). La bio dice "Personaje creado con IA"; nunca finge ser cliente ni experto.
- **Mis versiones**: tus productos y cuánto avanzó cada uno. El selector "Producto" de arriba elige en cuál trabajas.
- **Mis créditos**: tu saldo, el historial y las recargas.
- **Ayuda y guías**: guías paso a paso de Jean.
Otras pantallas, cada una en su sección del menú: Lo que creaste, Mi ficha (tus ofertas: qué vendes, a quién, resultado, precio y estado Borrador, En validación, Disponible o Pausado; no hace falta llenarla antes), Tu ADN (gratis: 6 preguntas esenciales y 8 opcionales sobre quién eres y cómo hablas, se guarda solo; la pregunta 8 es privada hasta que actives su uso; también ves y borras tus preferencias editoriales), Nichos de YouTube (gratis), Videos para YouTube (guion ${C.gen_medium}; producir el video: voz ${C.yt_voice_scene} e imagen ${C.yt_scene_image} por escena), Miniaturas (${C.gen_ad_image * 2}), Ganchos (gratis), Tus anuncios (tus primeros 5, ${C.gen_light} por anuncio; ahí anotas gasto, clics y ventas y te dice qué apagar), Mini Apps (ver es gratis; desbloquear un kit ${C.unlock_kit}), Validar mi idea (gratis), Precio y números (gratis), Order bump (ideas gratis; el texto ${C.gen_light}), Recuperar ventas, ¿Dónde se me escapan las ventas? (gratis), Plan de lanzamiento y Calendario de contenido (gratis; publicar algo hecho en SUPERNOVA y subir la captura da 50 créditos, 1 al día).

PREGUNTAS FRECUENTES (responde en esta línea):
- "No sé qué vender": abre **Hoy**, elige el negocio con más días pagando anuncios y toca **Mi versión** (${C.gen_master_prompt}).
- "¿Cómo hago mi primer anuncio?": **Mi versión** (${C.gen_master_prompt}) ya te trae un anuncio escrito y una imagen. Si quieres más imágenes: **Creativos y fotos** (${C.gen_ad_image * 3} créditos las 3). El video viene después.
- "¿Cuánto cuesta un video?": anuncio de 3 tomas con la misma persona ${n(VIDEO_AD)}; un clip de 5 s ${C.vid_mini_5}; motion graphics desde ${C.motion_ad}.
- "¿Puedo vender sin mostrar mi cara?": sí: imágenes (Creativos y fotos), Carrusel, Motion graphics y los guiones de Influencer IA.
- "¿Cómo cobro?": la app no cobra por ti; te ayuda a poner el precio en tu moneda (Precio y ganancia, gratis) y a vender por WhatsApp.
- "Se me acabaron los créditos": **Mis créditos** → recargar, o la ruedita ámbar de arriba a la derecha.

CRÉDITOS Y PLANES: SUPERNOVA PRO cuesta US$29,99 al mes, con 3 días de prueba (Whop pide la tarjeta y no cobra esos 3 días) y 2.000 créditos al mes que se renuevan y no se acumulan. Garantía de 30 días: si no terminas tu producto, te devolvemos el 100 %. Recargas (los comprados no caducan): Pack Boost 500 por US$10, Pack Power 2.000 por US$20, Pack Máximo 4.500 por US$39; y Pack 100 (12.000) y Pack 250 (30.000) para quien produce mucho. Mirar el Radar, las Ofertas y los Ganchos es gratis, y este chat también. Nunca digas el valor en dinero de cada crédito.

EN PAUSA (no los ofrezcas, no expliques cómo usarlos y no des su precio; si preguntan, di que llegarán más adelante y ofrece la alternativa): el video del avatar que habla con su voz (si en Influencer IA ve "Pronto", puede usar la foto y los guiones del personaje y grabar la voz en CapCut o Edits; o hacer un video en **Video con IA**, modo Anuncio), el **Estudio de avatar** (fotos y videos del avatar o con tu foto con plantillas; alternativa mientras abre: Influencer IA y Video con IA), Crear mi producto (alternativa: empieza con Mi versión), **Quitar marca de agua**, Mercado, Oráculo, Media Studio o video con presentador, Descubrir dolores, Gana con tu contenido y los idiomas inglés y portugués.

${MODEL_GUIDE}

GLOSARIO (úsalo para explicar): CTR = % de personas que hacen clic al ver tu anuncio (menos de 0,8 % → cambia el gancho). CPA = lo que te cuesta cada venta en anuncios. ROAS = cuánto vuelve por cada dólar en anuncios. Gancho (hook) = la primera frase que detiene a la gente. Embudo = el camino de venta: anuncio → página → pago. Página de ventas (landing) = la página que explica y vende. Video de ventas (VSL) = video que vende tu producto. Order bump = casilla extra de un clic antes de pagar. Upsell = oferta extra después de pagar; downsell = opción más barata si dice que no. UGC = contenido con estilo de cliente real grabado con el celular. Creativo = la imagen o el video del anuncio. Nicho = el tema y el público. Low ticket = producto barato (US$7 a US$47); high ticket = programa caro que se cierra en una llamada. Prompt = instrucciones para una IA.`;

// Secciones en pausa (src/lib/features.ts): el asistente no debe mandar a los clientes a pantallas que no ven.
// Nombres como los ve la persona (la clave interna "Crear" es "Descubrir dolores").
const PAUSED_NAME: Record<string, string> = { "Crear": "Descubrir dolores", "Media Studio": "Media Studio (video con presentador)", "Recompensas": "Gana con tu contenido" };
const PAUSED_NOTE = `\n\nRECUERDA: para este usuario NO están disponibles: ${[...ADMIN_ONLY_PAGES].map(p => PAUSED_NAME[p] ?? p).join(", ")}, ni el video del avatar que habla. No las recomiendes ni des su precio.`;
// El admin (Jean) ve y prueba lo que está en pausa: si pregunta, se le explica sin ocultarlo.
const ADMIN_NOTE = `\n\nEste usuario es ADMIN: ve y puede probar lo que está en pausa para clientes. Si pregunta por esas secciones, explícalas en pocas líneas y recuérdale que los clientes no las ven.`;

export function HelpAssistant() {
  const { isAdmin } = useFeatureAccess();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30))); } catch (e) { console.error("Failed to save messages", e); }
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streaming]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  // Las sugerencias del Inicio abren el asistente con la pregunta ya escrita (no se envía sola).
  useEffect(() => {
    const onAsk = (e: Event) => {
      const text = (e as CustomEvent<{ text?: string }>).detail?.text;
      if (typeof text === "string") setInput(text.slice(0, 500));
      setOpen(true);
    };
    window.addEventListener(ASK_ASSISTANT_EVENT, onAsk);
    return () => window.removeEventListener(ASK_ASSISTANT_EVENT, onAsk);
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setStreaming(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          messages: next.map(m => ({ role: m.role, content: m.content })),
          systemPrompt: SYSTEM_PROMPT + (isAdmin ? ADMIN_NOTE : PAUSED_NOTE),
          model: "google/gemini-3-flash-preview",
        }),
      });

      if (!res.ok || !res.body) {
        if (res.status === 429) toast.error("Hiciste muchas preguntas seguidas. Espera un minuto y vuelve a intentarlo.");
        else if (res.status === 402) toast.error("El asistente no está disponible ahora mismo. Inténtalo más tarde.");
        else toast.error("No pudimos hablar con el asistente. Inténtalo de nuevo.");
        setStreaming(false);
        return;
      }

      setMessages(m => [...m, { role: "assistant", content: "" }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              setMessages(m => {
                const copy = [...m];
                copy[copy.length - 1] = { role: "assistant", content: copy[copy.length - 1].content + delta };
                return copy;
              });
            }
          } catch (e) { console.error("Failed to parse streaming response", e); }
        }
      }
    } catch (e) {
      console.error(e);
      toast.error("Se cortó la conexión. Revisa tu internet e inténtalo de nuevo.");
    } finally {
      setStreaming(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <>
      {/* Teléfono: botón más chico (48 px), pegado a la esquina y por debajo del menú lateral
          (z-30 < z-40) para tapar menos contenido y no flotar encima del menú abierto. Escritorio: como siempre. */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-[calc(72px+env(safe-area-inset-bottom))] lg:bottom-6 right-3 lg:right-6 z-30 lg:z-50 w-12 h-12 lg:w-14 lg:h-14 rounded-full bg-primary text-primary-foreground shadow-2xl hover:scale-105 transition-transform flex items-center justify-center"
          title="Asistente de ayuda"
          aria-label="Abrir asistente de ayuda"
        >
          <MessageCircle className="w-6 h-6" strokeWidth={1.8} />
        </button>
      )}

      {open && (
        <div className="fixed bottom-[calc(72px+env(safe-area-inset-bottom))] lg:bottom-6 right-3 lg:right-6 z-50 w-[380px] max-w-[calc(100vw-24px)] lg:max-w-[calc(100vw-32px)] h-[560px] max-h-[calc(100dvh-100px)] lg:max-h-[calc(100vh-48px)] rounded-2xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/40">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary" strokeWidth={1.8} />
              </div>
              <div className="leading-tight">
                <div className="text-[13px] font-semibold text-foreground">Asistente SUPERNOVA</div>
                <div className="text-[10px] text-muted-foreground">Dudas sobre cómo usar la app · gratis</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-secondary" aria-label="Cerrar">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-6 space-y-3">
                <div className="text-[12px] text-muted-foreground">
                  Pregúntame cómo usar cualquier parte de SUPERNOVA. Es gratis: no gasta créditos.
                </div>
                <div className="flex flex-col gap-1.5">
                  {[
                    "No sé qué vender, ¿por dónde empiezo?",
                    "¿Qué es «Mi versión» y cuánto cuesta?",
                    "¿Cómo hago mi primer anuncio?",
                  ].map(q => (
                    <button
                      key={q}
                      onClick={() => setInput(q)}
                      className="text-[11px] text-left px-3 py-2 rounded-lg border border-border hover:border-primary/40 hover:bg-secondary/40 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                {m.role === "user" ? (
                  <div className="max-w-[85%] bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-3 py-2 text-[12.5px] leading-relaxed">
                    {m.content}
                  </div>
                ) : (
                  <div className="text-[12.5px] leading-relaxed text-foreground prose prose-sm prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-strong:text-foreground prose-headings:text-foreground">
                    <ReactMarkdown>{m.content || "..."}</ReactMarkdown>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-border p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKey}
                placeholder="Escribe tu pregunta…"
                rows={1}
                className="flex-1 resize-none bg-secondary/50 border border-border rounded-lg px-3 py-2 text-[12.5px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 max-h-24"
                disabled={streaming}
              />
              <button
                onClick={send}
                disabled={!input.trim() || streaming}
                className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:opacity-90"
                aria-label="Enviar"
              >
                <Send className="w-4 h-4" strokeWidth={1.8} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
