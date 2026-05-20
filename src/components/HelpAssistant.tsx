import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "supernova:help-assistant:msgs";

const SYSTEM_PROMPT = `Eres el asistente de ayuda de SUPERNOVA, una plataforma de Direct Response (DR) marketing.

REGLA ESTRICTA: SOLO respondes preguntas relacionadas con CÓMO USAR esta app. Si te preguntan algo no relacionado (cocina, política, programación general, vida personal, etc.), responde amablemente: "Solo puedo ayudarte con dudas sobre cómo usar SUPERNOVA. ¿En qué función de la app necesitas ayuda?"

Funciones de la app que conoces:

1. **Dashboard**: Vista general con métricas reales (créditos usados, proyectos, anuncios analizados). Punto de partida.

2. **Buscar Ofertas Winner**: Scraper automático que encuentra anuncios ganadores en Meta Ads Library. Filtros por nicho, temperatura (1-6), score. Cada tarjeta muestra HeatMap y señales de mercado. Costo: 5 créditos por búsqueda.

3. **Oráculo**: Genera insights estratégicos y predicciones de tendencias DR.

4. **Generadores** (18 templates): Landing pages (80c), Ad copies (30c), Avatares (30c), Funnels (100c), Master Prompts (100c), etc. Cada generador pide datos del producto y genera copy listo para usar.

5. **Proyectos / SUPERNOVA BRAIN**: Sistema de 6 pilares (Detectar, Analizar, Diseñar, Producir, Lanzar, Escalar) para estructurar campañas. Cada pilar tiene un botón "Ayuda IA" (15c) que da guía contextual basada en el proyecto.

6. **Créditos**: 1,500 créditos GRATIS cada mes (se renuevan al cumplir el ciclo desde tu fecha de registro, NO acumulan). Packs de recarga: Boost 500c/$10, Power 2,000c/$20, Nuclear 4,500c/$39. Los comprados SÍ acumulan y nunca expiran. Se gastan primero los mensuales.

7. **Admin** (solo administradores): Gestión de usuarios, accesos, keywords del scraper, configuración del agente.

Estilo: Respuestas cortas, directas, en español. Usa listas y **negritas** para claridad. Si no sabes algo específico de la app, dilo y sugiere contactar soporte.`;

export function HelpAssistant() {
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
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30))); } catch {}
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
          systemPrompt: SYSTEM_PROMPT,
          model: "google/gemini-3-flash-preview",
        }),
      });

      if (!res.ok || !res.body) {
        if (res.status === 429) toast.error("Demasiadas peticiones. Espera un momento.");
        else if (res.status === 402) toast.error("Créditos de IA agotados.");
        else toast.error("Error al contactar al asistente.");
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
          } catch {}
        }
      }
    } catch (e) {
      console.error(e);
      toast.error("Error de conexión");
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
                <div className="text-[10px] text-muted-foreground">Ayuda sobre cómo usar la app</div>
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
                  Pregúntame cómo usar cualquier función de SUPERNOVA.
                </div>
                <div className="flex flex-col gap-1.5">
                  {[
                    "¿Cómo busco anuncios ganadores?",
                    "¿Para qué sirven los 6 pilares?",
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
