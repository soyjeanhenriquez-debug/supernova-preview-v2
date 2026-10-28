import { useEffect, useRef, useState } from "react";
import { Check, Clapperboard, Copy, Loader2, RotateCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { ToolFeedback } from "@/components/ToolFeedback";
import { useCredits } from "@/hooks/useCredits";
import { useBusinessProfile, profileReady, profileText } from "@/lib/businessProfile";
import { fnHeaders, fnErrorMessage, readBilling } from "@/lib/fnAuth";
import { ANUNCIO_COST, ANUNCIO_ESTILOS, ANUNCIO_MERCADOS, type AnuncioStep } from "@/lib/anuncioAnimado";

/**
 * Agente «Anuncio animado» (28-oct-2026, pedido de Jean): la persona pone su producto, toca un estilo
 * y el agente hace el resto: cliente, datos, 3 ángulos → guion + storyboard → instrucciones de imagen
 * con estilo fijo y la transición de ese estilo. No escribe prompts. El método y el cobro van en el
 * servidor (ai-chat, agent "anuncio-animado"). En prueba: solo admins (aquí y allá).
 */
type Msg = { role: "user" | "assistant"; content: string; step: AnuncioStep };

const STORAGE_KEY = "supernova:anuncio-animado";
const HISTORY_SENT = 6;

type Guardado = { producto: string; mercado: string; estilo: string; datos: string; msgs: Msg[] };

function leer(): Partial<Guardado> {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

export function AnuncioAnimado({ onHome }: { onHome: () => void }) {
  const { applyServerCharge } = useCredits();
  const { profile, loaded } = useBusinessProfile();
  const g0 = useRef(leer()).current;
  const [producto, setProducto] = useState(g0.producto ?? "");
  const [mercado, setMercado] = useState(g0.mercado ?? ANUNCIO_MERCADOS[0]);
  const [estilo, setEstilo] = useState(g0.estilo ?? ANUNCIO_ESTILOS[0].id);
  const [datos, setDatos] = useState(g0.datos ?? "");
  const [verDatos, setVerDatos] = useState(Boolean(g0.datos));
  const [msgs, setMsgs] = useState<Msg[]>(g0.msgs ?? []);
  const [cambio, setCambio] = useState("");
  const [busy, setBusy] = useState<AnuncioStep | null>(null);
  const finRef = useRef<HTMLDivElement>(null);

  // La app no pregunta lo que ya sabe: si hay producto activo y la caja está vacía, se usa.
  useEffect(() => {
    if (loaded && !producto && profileReady(profile)) setProducto(profileText(profile).slice(0, 2_000));
  }, [loaded, profile, producto]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ producto, mercado, estilo, datos, msgs: msgs.slice(-12) })); } catch { /* sin espacio */ }
  }, [producto, mercado, estilo, datos, msgs]);

  const hecho = (s: AnuncioStep) => msgs.some(m => m.role === "assistant" && m.step === s && m.content);
  const estiloNombre = ANUNCIO_ESTILOS.find(e => e.id === estilo)?.nombre ?? "Fábula";

  const run = async (step: AnuncioStep, texto: string) => {
    if (busy) return;
    if (!producto.trim()) { toast.error("Escribe qué vendes en una frase."); return; }
    const next: Msg[] = [...msgs, { role: "user", content: texto, step }];
    setMsgs(next);
    setBusy(step);
    setTimeout(() => finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`, {
        method: "POST",
        headers: await fnHeaders(),
        body: JSON.stringify({
          agent: "anuncio-animado",
          step,
          messages: next.slice(-HISTORY_SENT).map(m => ({ role: m.role, content: m.content })),
          product: producto,
          opts: { estilo, mercado, datos },
        }),
      });
      if (!res.ok || !res.body) {
        toast.error(await fnErrorMessage(res, "El agente no respondió. No se te cobró: intenta de nuevo."));
        setMsgs(m => m.slice(0, -1));
        return;
      }
      const billing = readBilling(res);
      setMsgs(m => [...m, { role: "assistant", content: "", step }]);
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
            if (delta) setMsgs(m => {
              const copy = [...m];
              copy[copy.length - 1] = { ...copy[copy.length - 1], content: copy[copy.length - 1].content + delta };
              return copy;
            });
          } catch { /* trozo incompleto */ }
        }
      }
      applyServerCharge(ANUNCIO_COST[step].action, billing, "Anuncio animado");
    } catch (e) {
      console.error(e);
      toast.error("Se cortó la conexión. Revisa tu internet e inténtalo de nuevo.");
    } finally {
      setBusy(null);
    }
  };

  const copiar = async (t: string) => {
    try { await navigator.clipboard.writeText(t); toast.success("Copiado"); } catch { toast.error("No se pudo copiar"); }
  };
  const empezar = () => { if (!busy) { setMsgs([]); setCambio(""); } };
  const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-[13px] min-h-[36px] ${on ? "border-primary text-foreground bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`;
  const btn = "inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50 min-h-[44px]";
  const btn2 = "inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground hover:bg-secondary/40 disabled:opacity-50 min-h-[44px]";

  return (
    <div className="space-y-5 max-w-3xl">
      <button type="button" onClick={onHome} className="text-[13px] text-muted-foreground hover:text-foreground">← Con tu cara</button>
      <PageHeader stage="Crear · Anuncio animado · solo admin" title="Tu anuncio animado, como un cortometraje"
        icon={<Clapperboard className="w-5 h-5 text-primary" />}
        line="Dices qué vendes y eliges un estilo. El agente arma el cliente, los datos, el guion, las escenas y las instrucciones de imagen."
        details={[
          "No escribes prompts: tú eliges, el agente hace el trabajo.",
          "Solo usa cifras que traigas con su fuente. Si no tienes, te da las búsquedas para encontrarlas.",
          "Un estilo decide todo: las imágenes y la transición entre escenas.",
        ]} />

      {/* 1 · Producto, mercado y estilo */}
      <div className="card-surface rounded-2xl p-5 space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-foreground">Qué vendes</span>
          <textarea value={producto} onChange={e => setProducto(e.target.value.slice(0, 2_000))} rows={3}
            placeholder="Ej.: Un reto de 14 días donde agentes de IA te hacen el contenido y yo te enseño en vivo a dirigirlos."
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
        </label>
        <div className="space-y-1.5">
          <span className="text-sm font-semibold text-foreground">Para qué país</span>
          <div className="flex flex-wrap gap-2">
            {ANUNCIO_MERCADOS.map(m => <button key={m} type="button" onClick={() => setMercado(m)} className={chip(mercado === m)}>{m}</button>)}
          </div>
        </div>
        <div className="space-y-1.5">
          <span className="text-sm font-semibold text-foreground">Estilo</span>
          <div className="grid gap-2 sm:grid-cols-5 grid-cols-2">
            {ANUNCIO_ESTILOS.map((e, i) => (
              <button key={e.id} type="button" onClick={() => setEstilo(e.id)}
                className={`rounded-xl border p-3 text-left transition-colors ${estilo === e.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}>
                <span className="flex items-center gap-1 font-display text-[15px] font-semibold text-foreground">
                  {e.nombre}{i === 0 && <span className="text-primary text-[11px]">★</span>}
                  {estilo === e.id && <Check className="ml-auto w-4 h-4 text-primary" />}
                </span>
                <span className="mt-1 block text-[12px] leading-snug text-muted-foreground">{e.frase}</span>
              </button>
            ))}
          </div>
        </div>
        {verDatos ? (
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-foreground">Tus datos con fuente (opcional)</span>
            <textarea value={datos} onChange={e => setDatos(e.target.value.slice(0, 12_000))} rows={4}
              placeholder="Pega aquí lo que encontraste en NotebookLM o en Google, con el enlace de cada dato."
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
          </label>
        ) : (
          <button type="button" onClick={() => setVerDatos(true)} className="text-[13px] text-muted-foreground hover:text-foreground underline">Ya tengo datos con fuente</button>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={!!busy} className={btn}
            onClick={() => void run("base", `Arma el cliente, los datos y 3 ángulos para mi anuncio en estilo «${estiloNombre}».`)}>
            {busy === "base" && <Loader2 className="w-4 h-4 animate-spin" />}
            {hecho("base") ? "Rehacer cliente y ángulos" : "Empezar"} · {ANUNCIO_COST.base.cost} créditos
          </button>
          {msgs.length > 0 && <button type="button" onClick={empezar} disabled={!!busy} className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"><RotateCcw className="w-3.5 h-3.5" />Empezar de cero</button>}
        </div>
      </div>

      {/* 2 · Lo que entrega el agente */}
      {msgs.filter(m => m.role === "assistant").map((m, i) => (
        <div key={i} className="card-surface rounded-2xl p-5">
          <div className="prose prose-invert prose-sm max-w-none prose-pre:whitespace-pre-wrap prose-pre:text-[12px] prose-headings:font-display">
            <ReactMarkdown>{m.content || "…"}</ReactMarkdown>
          </div>
          {m.content && !busy && (
            <button type="button" onClick={() => void copiar(m.content)} className="mt-3 inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
              <Copy className="w-3.5 h-3.5" />Copiar todo
            </button>
          )}
        </div>
      ))}
      {busy && <p className="flex items-center gap-2 text-[13px] text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />El agente está trabajando. Puede tardar un minuto.</p>}

      {/* 3 · Siguiente paso */}
      {hecho("base") && !busy && (
        <div className="card-surface rounded-2xl p-5 space-y-4">
          {!hecho("anuncio") ? (
            <>
              <p className="text-sm font-semibold text-foreground">Elige el ángulo</p>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3].map(n => (
                  <button key={n} type="button" className={btn2}
                    onClick={() => void run("anuncio", `Ángulo ${n}. Arma el guion y el storyboard.`)}>
                    Ángulo {n} · {ANUNCIO_COST.anuncio.cost} créditos
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn} onClick={() => void run("prompts", "Dame las instrucciones de imagen del storyboard.")}>
                {hecho("prompts") ? "Rehacer instrucciones de imagen" : "Instrucciones de imagen"} · {ANUNCIO_COST.prompts.cost} créditos
              </button>
            </div>
          )}
          {hecho("anuncio") && (
            <div className="flex flex-col sm:flex-row gap-2">
              <input value={cambio} onChange={e => setCambio(e.target.value.slice(0, 500))}
                placeholder="¿Cambiar algo? Dilo en una frase. Ej.: que el gancho sea más corto."
                className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm min-h-[44px]" />
              <button type="button" disabled={!cambio.trim()} className={btn2}
                onClick={() => { const t = cambio.trim(); setCambio(""); void run("cambio", t); }}>
                Cambiar · {ANUNCIO_COST.cambio.cost} créditos
              </button>
            </div>
          )}
          {hecho("prompts") && <ToolFeedback tool="anuncio-animado" context={{ estilo, mercado, con_datos: Boolean(datos.trim()) }} />}
        </div>
      )}
      <div ref={finRef} />
    </div>
  );
}

export default AnuncioAnimado;
