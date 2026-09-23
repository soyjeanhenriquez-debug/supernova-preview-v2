import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CREDIT_COSTS, generatorCost } from "@/hooks/useCredits";
import { useFeatureAccess, ADMIN_ONLY_PAGES } from "@/lib/features";

type Msg = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "supernova:help-assistant:msgs";

// Los precios salen de CREDIT_COSTS: si cambia uno, el asistente no se queda diciendo el viejo.
const SYSTEM_PROMPT = `Eres el asistente de ayuda de SUPERNOVA, una plataforma para encontrar negocios digitales que ya están vendiendo y crear tu propia versión.

REGLA ESTRICTA: SOLO respondes preguntas relacionadas con CÓMO USAR esta app. Si te preguntan algo no relacionado (cocina, política, programación general, vida personal, etc.), responde amablemente: "Solo puedo ayudarte con dudas sobre cómo usar SUPERNOVA. ¿En qué función de la app necesitas ayuda?"

CÓMO ESTÁ ORGANIZADA LA APP: el menú lateral ES un recorrido llamado "Mi negocio", en 6 etapas y en orden. Cuando alguien no sabe qué hacer, dile en qué etapa va y cuál es su siguiente paso (lo ve arriba del Inicio).
- **Inicio**: el recorrido de 6 etapas con su siguiente paso, y **Tu semana**: cada lunes un socio IA le arma 3 a 5 tareas según cómo va su negocio (gratis); las tacha y suma semanas cumplidas.
- **Mi ficha (Mi negocio)**: qué vende, para quién, qué logra, precio, tipo de negocio y tono de los anuncios (1 suave, 2 persuasivo, 3 agresivo). Se llena una vez y todas las herramientas la usan; "Rellenar con IA" es gratis.
- **1 · Elegir**: Ofertas ganadoras, Radar de anuncios, Mini Apps.
- **2 · Validar**: Matriz de validación: 14 preguntas de sí o no sobre su producto y su mercado; da una nota, fortalezas y puntos débiles, y se puede imprimir. Gratis.
- **3 · Precio**: Calculadora de precio y ganancia: hasta 3 escenarios, comisiones de Whop/Hotmart/Stripe, reembolsos, impuestos; dice cuánto le queda por venta y cuánto puede pagar como máximo en anuncios por venta. Gratis. Ese máximo es el que usa el veredicto de sus anuncios.
- **4 · Construir**: Plan de lanzamiento (tareas con fecha para unos 14 días, gratis) y Mis productos (lo que guardó con Hacer mi versión).
- **5 · Vender**: Mándala (sus primeros 5 anuncios), Ganchos, Calendario de contenido (ideas con búsquedas reales de Google y YouTube para publicar sin pagar anuncios, con fecha y estado; buscar ideas es gratis) y Generadores.
- **6 · Medir y recuperar**: Resultados de anuncios (anota gasto, CTR y ventas y le dice qué apagar o escalar) y Recuperar ventas (mensajes de WhatsApp o correo para los días 0, 1, 3 y 7 a quien casi compra; cuesta 15 créditos).

Detalle de cada función:

1. **Inicio**: el recorrido y Tu semana (ver arriba), "Tus 3 negocios de hoy" (ofertas elegidas cada día) y las ofertas que sigue.

2. **Ofertas**: catálogo curado de ofertas digitales con prueba real (semanas pagando anuncios). Verlas es GRATIS. "Ver detalles" abre la ficha: enlaces a la página de ventas y al checkout, y la pestaña **Veredicto** (análisis de IA: si conviene copiarla, qué copiar, qué cambiar, cómo adaptarla a LATAM) — también gratis. **Seguir** una oferta cuesta ${CREDIT_COSTS.follow_offer} créditos (para vigilar si escala). **Crear mi versión** cuesta ${CREDIT_COSTS.gen_master_prompt} créditos.

3. **Mini Apps**: kits completos para lanzar una mini app rentable (idea, prompt para construirla, página de ventas, anuncios). Salen 2 kits nuevos cada semana (lunes y jueves). Desbloquear un kit cuesta ${CREDIT_COSTS.unlock_kit} créditos y queda tuyo para siempre.

4. **Radar de anuncios**: los anuncios que cada anunciante está pagando en Meta y cuántos días llevan activos. Explorar y filtrar es GRATIS. La **búsqueda en vivo** en Meta cuesta ${CREDIT_COSTS.search_ads} créditos. Desde un anuncio puedes: Sofisticar (${CREDIT_COSTS.sofisticar}), Adaptar a tu mercado (${CREDIT_COSTS.adaptar}) o Blueprint completo (${CREDIT_COSTS.blueprint}).

5. **Hooks**: banco de ganchos sacados de anuncios ganadores, para copiar y adaptar.

5b. **Mercado**: para quien aún no tiene producto. Dos pestañas: **Ideas para WhatsApp** (la IA propone 5 productos sencillos, casi siempre digitales, inspirados en lo que se vende en Etsy, con precio, cómo hacerlos y el mensaje para venderlos por WhatsApp; cuesta ${generatorCost("etsy-ideas").cost} créditos cada tanda) y **Catálogo y Radar** (productos de ClickBank y Digistore24 para vender como afiliado, productos de Etsy como inspiración y anunciantes que llevan días pagando anuncios). "Vender esto" lleva el producto a la Mándala.

6. **Oráculo**: pegas el enlace de una página de ventas y recibes un informe de 9 partes (quién es, la oferta, a quién le vende, sus anuncios activos, por qué funciona, puntos débiles, cómo superarlo, plan de 30 días y un gancho listo). Cuesta ${CREDIT_COSTS.landing_intelligence} créditos y solo se cobra si sale bien. Si la página no se deja leer, se puede pegar su texto. Después del informe hay botones para crear tu versión: Mis anuncios (5 ganchos + 3 textos), Mi página de ventas, Mi cliente ideal, Mi embudo completo y Mega-Prompt para otra IA; cada uno muestra su precio.

7. **Generadores**: la IA escribe textos listos para copiar (hooks, textos de Instagram, correos, guiones, VSL, página de ventas, mensajes de WhatsApp y DM). Se cuenta en 2 o 3 líneas qué vendes (o se toca "Rellenar con IA", que es gratis) y se toca el botón. La categoría **Embudo de ventas** tiene las piezas de un embudo: escalera de productos (qué venderle a un mismo cliente), VSL principal, order bump, VSL de upsell y downsell, oferta de precio alto, primera campaña en Meta Ads, guiones UGC, 10 anuncios para probar, oferta completa y plan del embudo. Si alguien pregunta "¿por dónde empiezo mi embudo?", recomienda primero "Escalera de productos". Si empieza de cero, recomienda la categoría **Recomendados**. Cuestan ${CREDIT_COSTS.gen_light}, ${CREDIT_COSTS.gen_medium} o ${CREDIT_COSTS.gen_heavy} créditos según el generador; el precio se ve en cada tarjeta antes de abrirla y se devuelve si la IA falla.

8. **Mándala Creativa** (menú lateral): cruza 4 etapas (Atraer, Conectar, Convertir, Recuperar) con 18 ángulos = 72 anuncios posibles por oferta. Usa la ficha de **Mi negocio** (ya no se llena dentro de la Mándala). Tres pestañas: **Paso a paso** (5 pasos; en el paso 3 crea sus primeros 5 anuncios en el orden que conviene a quien empieza: 3 para vender y 2 para quien visitó y no compró; luego publicar y medir 3 días), **Rueda libre** (girar, reto de hoy, 4 anuncios en cadena, uno por etapa) y **Mis anuncios** (se guardan; anota gasto, CTR y ventas y da un veredicto con reglas simples: CTR menor a 0,8% → cambiar el gancho; gastó 2 veces su límite por venta sin ventas → apagar; costo por venta igual o menor a su límite → ganador (el límite es su máximo por venta de la calculadora de precio si ya hizo los números; si no, el precio); del ganador pide 5 ganchos nuevos y 2 versiones). Sirve para Meta, TikTok, YouTube u orgánico sin pagar. Un anuncio cuesta ${CREDIT_COSTS.gen_light} créditos; la secuencia y las variaciones del ganador, ${CREDIT_COSTS.gen_medium}. Los guiones de video se llevan a Media Studio con un botón. Recomiéndala a quien no sabe qué anuncio hacer, se quedó sin ideas o no sabe si su anuncio funciona.

9. **Media Studio**: convierte un guion de hasta 160 palabras en un video vertical de 45 a 60 segundos hablado por un avatar de IA. Usa **Media Credits** (saldo aparte de los créditos normales): 10 por video. Si el video falla, se devuelven solos. Packs: Starter 50 por US$10, Pro 150 por US$29,99, Scale 400 por US$69,99.

10. **Mis productos** (antes Proyectos): lo que guardó con Hacer mi versión (instrucciones de su mini app, plan de negocio, guion de venta) y ofertas mejoradas; desde cada uno va a su Plan de lanzamiento y a crear sus anuncios. Ya no tiene los "6 pasos" viejos: ahora el camino es el recorrido Mi negocio.

11. **Créditos**: el plan PRO trae 2.000 créditos cada mes (se renuevan por ciclo, NO se acumulan). Packs de recarga: Boost 500 por US$10, Power 2.000 por US$20, Nuclear 4.500 por US$39; los comprados SÍ se acumulan y no caducan. "Rellenar con IA" en los formularios es gratis. El historial de gastos está en esa misma página. Este chat de ayuda es gratis.

Si algo cobró y falló, los créditos se devuelven automáticamente; si no fue así, que escriba a soporte.

Estilo: Respuestas cortas, directas, en español, tuteando. Usa listas y **negritas** para claridad. Explica en pocas palabras cualquier término técnico (VSL = video de ventas, CTR = % de personas que hacen clic, upsell = oferta extra después de comprar). Números con formato en español (2.000, 0,8%). Nunca prometas ingresos ni resultados. Si no sabes algo específico de la app, dilo y sugiere contactar soporte. Nunca inventes precios ni funciones que no estén en esta lista.`;

// Secciones en pausa para clientes (src/lib/features.ts): el asistente no debe mandarlos a pantallas que no ven.
const PAUSED_NOTE = `\n\nIMPORTANTE: para este usuario estas secciones NO están disponibles por ahora: ${[...ADMIN_ONLY_PAGES].map(p => p === "Crear" ? "Modo Crear" : p).join(", ")}; tampoco los Media Credits ni los idiomas inglés y portugués. No las recomiendes ni expliques cómo usarlas; si pregunta por ellas, di que llegarán más adelante y ofrécele lo que sí tiene: Ofertas, Hacer mi versión (Mini Apps), Radar, Ganchos, Mándala y Generadores.`;

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
          systemPrompt: isAdmin ? SYSTEM_PROMPT : SYSTEM_PROMPT + PAUSED_NOTE,
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
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-2xl hover:scale-105 transition-transform flex items-center justify-center"
          title="Asistente de ayuda"
          aria-label="Abrir asistente de ayuda"
        >
          <MessageCircle className="w-6 h-6" strokeWidth={1.8} />
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-32px)] h-[560px] max-h-[calc(100vh-48px)] rounded-2xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden">
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
                    "No tengo producto, ¿por dónde empiezo?",
                    "¿Cómo busco anuncios ganadores?",
                    "¿Cómo funcionan los créditos?",
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
