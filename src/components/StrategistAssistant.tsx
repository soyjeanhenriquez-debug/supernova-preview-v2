import { useEffect, useRef, useState } from "react";
import { Target, X, Send, Copy, RotateCcw, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { useCredits } from "@/hooks/useCredits";
import { useFeatureAccess } from "@/lib/features";
import { useBusinessProfile, profileReady, profileText } from "@/lib/businessProfile";
import { fnHeaders, fnErrorMessage, readBilling } from "@/lib/fnAuth";
import { ESTRATEGA_COST, ESTRATEGA_FORMAT_OPTIONS, stepMessage, type EstrategaStep } from "@/lib/estratega";
import { AwarenessLadder } from "@/components/PieceStrategy";
import { LEVEL_AUTO } from "@/lib/awareness";

/**
 * El Estratega de anuncios (20-oct-2026, pedido de Jean): un botón al lado de Ayuda que abre un
 * director creativo de respuesta directa. Dudas gratis (Enter); los entregables van por botones y
 * los cobra el servidor: estrategia y ángulos → guiones de los ángulos elegidos → guion de producción.
 * El método vive en el servidor (ai-chat, agent "estratega"). En prueba: solo admins (aquí y allá).
 */
type Msg = { role: "user" | "assistant"; content: string; step?: EstrategaStep };

const STORAGE_KEY = "supernova:estratega:msgs";
// Lo que viaja en cada llamada: los últimos turnos bastan (la estrategia y los guiones más recientes).
const HISTORY_SENT = 12;
const MAX_FORMATS = 2;

export function StrategistAssistant() {
  const { isAdmin } = useFeatureAccess();
  const [open, setOpen] = useState(false);
  if (!isAdmin) return null;
  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-[calc(72px+env(safe-area-inset-bottom))] lg:bottom-6 right-[68px] lg:right-[92px] z-30 lg:z-50 w-12 h-12 lg:w-14 lg:h-14 rounded-full bg-card border border-border text-primary shadow-2xl hover:scale-105 hover:border-primary/40 transition-transform flex items-center justify-center"
          title="Estratega de anuncios"
          aria-label="Abrir el Estratega de anuncios"
        >
          <Target className="w-6 h-6" strokeWidth={1.8} />
        </button>
      )}
      {open && <StrategistPanel onClose={() => setOpen(false)} />}
    </>
  );
}

function StrategistPanel({ onClose }: { onClose: () => void }) {
  const { applyServerCharge } = useCredits();
  const { profile, loaded } = useBusinessProfile();
  const [input, setInput] = useState("");
  const [formats, setFormats] = useState<string[]>([]);
  const [level, setLevel] = useState<string>(LEVEL_AUTO);
  const [busy, setBusy] = useState<EstrategaStep | null>(null);
  const [messages, setMessages] = useState<Msg[]>(() => {
    try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30))); } catch { /* sin espacio o modo privado */ }
  }, [messages]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, busy]);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);

  const ready = loaded && profileReady(profile);
  const hasStrategy = messages.some(m => m.role === "assistant" && m.step === "estrategia" && m.content);
  const hasScripts = messages.some(m => m.role === "assistant" && m.step === "guiones" && m.content);

  const toggleFormat = (id: string) =>
    setFormats(f => f.includes(id) ? f.filter(x => x !== id) : f.length >= MAX_FORMATS ? [...f.slice(1), id] : [...f, id]);

  const run = async (step: EstrategaStep) => {
    if (busy) return;
    const typed = input.trim();
    if (step === "chat" && !typed) return;
    const text = step === "chat" ? typed : stepMessage(step, typed, formats, level);
    setInput("");
    const next: Msg[] = [...messages, { role: "user", content: text, step }];
    setMessages(next);
    setBusy(step);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`, {
        method: "POST",
        headers: await fnHeaders(),
        body: JSON.stringify({
          agent: "estratega",
          step,
          messages: next.slice(-HISTORY_SENT).map(m => ({ role: m.role, content: m.content })),
          product: ready ? profileText(profile) : "",
          formats,
        }),
      });
      if (!res.ok || !res.body) {
        toast.error(await fnErrorMessage(res, "El Estratega no respondió. No se te cobró: intenta de nuevo."));
        setMessages(m => m.slice(0, -1));
        setInput(typed);
        return;
      }
      const billing = readBilling(res);
      setMessages(m => [...m, { role: "assistant", content: "", step }]);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
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
            const delta = JSON.parse(data).choices?.[0]?.delta?.content;
            if (delta) setMessages(m => {
              const copy = [...m];
              copy[copy.length - 1] = { ...copy[copy.length - 1], content: copy[copy.length - 1].content + delta };
              return copy;
            });
          } catch { /* trozo incompleto */ }
        }
      }
      const cost = ESTRATEGA_COST[step];
      if (cost.action) applyServerCharge(cost.action, billing, "Estratega de anuncios");
    } catch (e) {
      console.error(e);
      toast.error("Se cortó la conexión. Revisa tu internet e inténtalo de nuevo.");
    } finally {
      setBusy(null);
    }
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success("Copiado"); } catch { toast.error("No se pudo copiar"); }
  };

  const placeholder = !hasStrategy
    ? "Pregúntame algo o cuéntame qué vendes…"
    : !hasScripts
      ? "Números de los ángulos (ej.: 1, 4, 7) y toca Escribir guiones…"
      : "¿Qué ajusto? O toca Guion de producción…";

  const stepButton = (step: Exclude<EstrategaStep, "chat">, label: string, primary?: boolean) => (
    <button
      key={step}
      onClick={() => run(step)}
      disabled={!!busy}
      className={`shrink-0 text-[11px] px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-40 ${primary
        ? "bg-primary text-primary-foreground border-primary hover:opacity-90"
        : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"}`}
    >
      {busy === step ? <Loader2 className="inline w-3 h-3 mr-1 animate-spin" /> : null}
      {label} · {ESTRATEGA_COST[step].cost} créditos
    </button>
  );

  return (
    <div className="fixed bottom-[calc(72px+env(safe-area-inset-bottom))] lg:bottom-6 right-3 lg:right-6 z-50 w-[440px] max-w-[calc(100vw-24px)] lg:max-w-[calc(100vw-32px)] h-[620px] max-h-[calc(100dvh-100px)] lg:max-h-[calc(100vh-48px)] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/40">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <Target className="w-4 h-4 text-primary" strokeWidth={1.8} />
          </div>
          <div className="leading-tight min-w-0">
            <div className="text-[13px] font-semibold text-foreground font-display">Estratega de anuncios</div>
            <div className="text-[10px] text-muted-foreground truncate">
              {ready ? `Producto: ${profile.product}` : "Dudas gratis · guiones para Meta y TikTok"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button onClick={() => setMessages([])} disabled={!!busy} className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-secondary disabled:opacity-40" title="Empezar de nuevo" aria-label="Empezar de nuevo">
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-secondary" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="py-4 space-y-3 text-[12px] text-muted-foreground">
            <p>Convierto tu producto en guiones de video que venden en Meta y TikTok. Así trabajamos:</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li><span className="text-foreground">Armar estrategia</span>: lo que siente tu cliente, de 8 a 12 ángulos con su gancho y el porqué de tu producto.</li>
              <li><span className="text-foreground">Escribir guiones</span>: eliges los ángulos y el formato, y te escribo un guion por ángulo.</li>
              <li><span className="text-foreground">Guion de producción</span>: el guion que te guste, clip a clip, listo para grabar o hacer con IA.</li>
            </ol>
            <p>{ready ? "Uso la ficha de tu producto activo." : "Cuéntame qué vendes y a quién, o llena la ficha de tu producto."} Las preguntas sueltas son gratis: escríbelas y pulsa Enter.</p>
            <div className="flex flex-col gap-1.5 pt-1">
              {["¿Qué ángulo uso si nadie me conoce todavía?", "¿Cómo hago un gancho que frene el scroll?", "Pego un anuncio que ya funciona: ¿cómo hago mi versión?"].map(q => (
                <button key={q} onClick={() => setInput(q)} className="text-[11px] text-left px-3 py-2 rounded-lg border border-border hover:border-primary/40 hover:bg-secondary/40 hover:text-foreground transition-colors">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "group"}>
            {m.role === "user" ? (
              <div className="max-w-[85%] bg-secondary text-foreground rounded-2xl rounded-tr-sm px-3 py-2 text-[12.5px] leading-relaxed whitespace-pre-wrap">{m.content}</div>
            ) : (
              <>
                <div className="text-[12.5px] leading-relaxed text-foreground prose prose-sm prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-pre:text-[11.5px] prose-pre:whitespace-pre-wrap prose-strong:text-foreground prose-headings:text-foreground prose-headings:font-display prose-h2:text-[14px] prose-h2:mt-4 prose-h2:mb-1.5">
                  <ReactMarkdown>{m.content || "..."}</ReactMarkdown>
                </div>
                {m.content && busy === null && (
                  <button onClick={() => copy(m.content)} className="mt-1 text-[10.5px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                    <Copy className="w-3 h-3" /> Copiar
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-border p-3 space-y-2">
        {hasStrategy && <AwarenessLadder value={level} onChange={setLevel} />}
        {hasStrategy && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5" aria-label="Formato de los guiones">
            {ESTRATEGA_FORMAT_OPTIONS.map(f => (
              <button
                key={f.id}
                onClick={() => toggleFormat(f.id)}
                className={`shrink-0 text-[10.5px] px-2 py-1 rounded-full border transition-colors ${formats.includes(f.id) ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {stepButton("estrategia", hasStrategy ? "Nueva estrategia" : "Armar estrategia", !hasStrategy)}
          {stepButton("guiones", "Escribir guiones", hasStrategy && !hasScripts)}
          {hasScripts && stepButton("produccion", "Guion de producción", true)}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); run("chat"); } }}
            placeholder={placeholder}
            rows={2}
            maxLength={4000}
            className="flex-1 resize-none bg-secondary/50 border border-border rounded-lg px-3 py-2 text-[12.5px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 max-h-32"
            disabled={!!busy}
          />
          <button
            onClick={() => run("chat")}
            disabled={!input.trim() || !!busy}
            className="w-9 h-9 rounded-lg border border-border text-foreground flex items-center justify-center disabled:opacity-40 hover:border-primary/40"
            aria-label="Enviar duda (gratis)"
            title="Enviar duda (gratis)"
          >
            <Send className="w-4 h-4" strokeWidth={1.8} />
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground">Enter = duda gratis. Los botones escriben con lo que pongas en la caja.</p>
      </div>
    </div>
  );
}
