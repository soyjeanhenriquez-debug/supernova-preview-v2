import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Copy, FileText, Lightbulb, Loader2, MonitorPlay, RefreshCw, Sparkles, Youtube } from "lucide-react";
import { toast } from "sonner";
import { useCredits, generatorCost } from "@/hooks/useCredits";
import { fnHeaders, fnErrorMessage, readBilling } from "@/lib/fnAuth";
import { YT_REF_KEY, type YtItem } from "@/pages/YouTubeRadarPage";

/**
 * Creador de videos para YouTube (03-oct-2026), UN PASO POR PANTALLA (Jean: "paso a paso, que pueda
 * elegir, entretenido pero no agobiante"): 1 idea → 2 formato → 3 guion. El guion es ORIGINAL: de un
 * video de referencia se toma el tema y la estructura, nunca su texto (YouTube desmonetiza lo copiado
 * o producido en masa). Usa el generador "yt-script" de ai-chat: el servidor cobra antes y devuelve si
 * falla. El guion sale dividido en escenas con su descripción visual, listo para voz e imágenes.
 */
type Source = "tema" | "video" | "guion";
type Format = { id: string; label: string; line: string; minutes: number; size: "16:9" | "9:16" };
type Ref = YtItem & { lang?: string; kind?: string };

const FORMATS: Format[] = [
  { id: "short", label: "Short", line: "Hasta 1 minuto, vertical. Para crecer rápido.", minutes: 1, size: "9:16" },
  { id: "medio", label: "Video de 8 minutos", line: "El largo mínimo que suele monetizar bien.", minutes: 8, size: "16:9" },
  { id: "largo", label: "Video de 12 a 15 minutos", line: "Más tiempo de visualización por video.", minutes: 14, size: "16:9" },
];
const LANGS: [string, string][] = [["es", "Español"], ["en", "Inglés"], ["pt", "Portugués"]];
const GEN = "yt-script";

function systemPrompt(minutes: number, lang: string) {
  const words = Math.round(minutes * 145);
  const idioma = lang === "en" ? "inglés" : lang === "pt" ? "portugués" : "español neutro latinoamericano";
  return `Eres guionista de canales de YouTube sin rostro (faceless) que retienen hasta el final. Escribe en ${idioma}.
Reglas:
- Guion 100 % ORIGINAL. Si te dan un video de referencia, toma solo el tema y el tipo de estructura; nunca copies sus frases, su título ni su miniatura. Aporta un ángulo propio, datos verificables y ejemplos nuevos.
- Narración para voz en off, frases cortas y naturales, sin emojis. Unas ${words} palabras de narración (≈ ${minutes} min).
- Estructura: gancho fuerte en los primeros 15 segundos → promesa de lo que verá → desarrollo en bloques con mini-ganchos para que no se vaya → cierre con una idea que se quede y una invitación suave a suscribirse.
- Sin promesas de dinero, curas ni resultados garantizados. Sin datos inventados: si no estás seguro, dilo como posibilidad.
- Divide TODO el guion en escenas de 8 a 12 segundos. Formato exacto de cada escena:
ESCENA n — [descripción visual breve para generar la imagen: quién, dónde, qué pasa, plano]
Narración: (lo que dice la voz en esa escena)
- Al final, en una línea: "TÍTULO:" con un título que dé curiosidad (máx. 70 caracteres) y otra "MINIATURA:" con la idea de la miniatura (máx. 5 palabras de texto).`;
}

export function YouTubeCreatorPage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { applyServerCharge, canAfford } = useCredits();
  const [step, setStep] = useState(1);
  const [source, setSource] = useState<Source>("tema");
  const [topic, setTopic] = useState("");
  const [ownScript, setOwnScript] = useState("");
  const [ref, setRef] = useState<Ref | null>(null);
  const [format, setFormat] = useState<Format>(FORMATS[2]);
  const [lang, setLang] = useState("es");
  const [script, setScript] = useState("");
  const [writing, setWriting] = useState(false);
  const price = generatorCost(GEN).cost;

  // Viene del Radar con un video de referencia.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(YT_REF_KEY);
      if (!raw) return;
      sessionStorage.removeItem(YT_REF_KEY);
      const r = JSON.parse(raw) as Ref;
      setRef(r); setSource("video");
      if (r.lang) setLang(r.lang);
      setFormat(r.kind === "short" ? FORMATS[0] : r.seconds >= 660 ? FORMATS[2] : FORMATS[1]);
    } catch { /* sin almacenamiento */ }
  }, []);

  const ideaReady = source === "tema" ? topic.trim().length >= 4 : source === "video" ? !!ref : ownScript.trim().length >= 80;

  const write = async () => {
    if (writing) return;
    const { action } = generatorCost(GEN);
    if (!canAfford(action)) { toast.error(`Te faltan créditos: el guion cuesta ${price}`); return; }
    const pedido = source === "video" && ref
      ? `Video de referencia que está funcionando (solo para tema y estructura, NO lo copies): "${ref.title}" del canal ${ref.channel}, ${ref.views.toLocaleString("es")} vistas, dura ${Math.round(ref.seconds / 60)} min. ${topic.trim() ? `Mi ángulo: ${topic.trim()}` : "Propón un ángulo propio mejor."}`
      : source === "guion" ? `Mejora y adapta este guion mío al formato pedido, manteniendo mi idea:\n${ownScript.trim().slice(0, 6000)}`
      : `Tema del video: ${topic.trim()}`;
    setWriting(true); setScript(""); setStep(3);
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`, {
        method: "POST", headers: await fnHeaders(),
        body: JSON.stringify({ generator_id: GEN, generator_title: "Guion de YouTube", systemPrompt: systemPrompt(format.minutes, lang), messages: [{ role: "user", content: pedido }] }),
      });
      if (!resp.ok || !resp.body) throw new Error(await fnErrorMessage(resp, "No se pudo escribir el guion."));
      applyServerCharge(action, readBilling(resp), "Guion de YouTube");
      const reader = resp.body.getReader(); const dec = new TextDecoder();
      let buf = "", full = "", end = false;
      while (!end) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const j = line.slice(6).trim();
          if (j === "[DONE]") { end = true; break; }
          try { const c = JSON.parse(j).choices?.[0]?.delta?.content; if (c) { full += c; setScript(full); } } catch { buf = line + "\n" + buf; break; }
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo escribir el guion.");
      if (!script) setStep(2);
    } finally { setWriting(false); }
  };

  const scenes = (script.match(/ESCENA\s+\d+/gi) ?? []).length;
  const card = (on: boolean) => `text-left rounded-2xl border p-5 transition-colors ${on ? "border-primary/60 bg-primary/[0.06]" : "border-border bg-card/40 hover:border-foreground/30"}`;
  const STEPS = ["Idea", "Formato", "Guion"];

  return (
    <div className="max-w-[860px] mx-auto space-y-6 py-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display font-bold text-2xl text-foreground flex items-center gap-2"><Youtube className="w-6 h-6 text-primary" /> Creador de videos</h1>
        <button onClick={() => onNavigate("Nichos YouTube")} className="text-[12px] text-muted-foreground hover:text-foreground">Buscar nichos →</button>
      </div>

      {/* Pasos: solo se ve el actual; arriba, dónde vas. */}
      <ol className="flex items-center gap-2 text-[12px]">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center border text-[11px] ${step > i + 1 ? "border-emerald-500/50 text-emerald-400" : step === i + 1 ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
              {step > i + 1 ? <Check className="w-3.5 h-3.5" /> : i + 1}
            </span>
            <span className={step === i + 1 ? "text-foreground font-medium" : "text-muted-foreground"}>{s}</span>
            {i < STEPS.length - 1 && <span className="w-8 h-px bg-border" />}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <section className="space-y-4">
          <h2 className="font-display font-semibold text-lg text-foreground">¿De dónde sale la idea?</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            <button onClick={() => setSource("tema")} className={card(source === "tema")}><Lightbulb className="w-5 h-5 mb-3" /><p className="font-medium text-foreground">Un tema</p><p className="text-[12px] text-muted-foreground mt-1">Escribe de qué quieres hablar.</p></button>
            <button onClick={() => setSource("video")} className={card(source === "video")}><MonitorPlay className="w-5 h-5 mb-3" /><p className="font-medium text-foreground">Un video que ya funciona</p><p className="text-[12px] text-muted-foreground mt-1">Toma su tema y estructura, con guion tuyo.</p></button>
            <button onClick={() => setSource("guion")} className={card(source === "guion")}><FileText className="w-5 h-5 mb-3" /><p className="font-medium text-foreground">Ya tengo guion</p><p className="text-[12px] text-muted-foreground mt-1">Lo adaptamos y lo dividimos en escenas.</p></button>
          </div>

          {source === "tema" && (
            <input value={topic} onChange={e => setTopic(e.target.value.slice(0, 200))} autoFocus placeholder="Ej.: 12 señales de que tu perro te ve como su familia"
              className="w-full rounded-lg border border-border bg-background px-3 py-3 text-sm text-foreground focus:outline-none focus:border-primary/60" />
          )}
          {source === "video" && (ref ? (
            <div className="rounded-2xl border border-border p-4 flex gap-4 items-start">
              {ref.thumb && <img src={ref.thumb} alt="" className="w-36 aspect-video object-cover rounded-lg shrink-0" />}
              <div className="min-w-0 space-y-2 flex-1">
                <p className="text-[13px] font-medium text-foreground line-clamp-2">{ref.title}</p>
                <p className="text-[11px] text-muted-foreground">{ref.channel} · {ref.views.toLocaleString("es")} vistas</p>
                <input value={topic} onChange={e => setTopic(e.target.value.slice(0, 200))} placeholder="Tu ángulo (opcional): Ej.: lo mismo pero con gatos"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60" />
              </div>
            </div>
          ) : (
            <button onClick={() => onNavigate("Nichos YouTube")} className="w-full rounded-2xl border border-dashed border-border p-5 text-[13px] text-muted-foreground hover:text-foreground">Elige un video en Nichos de YouTube y toca "Crear mi versión" →</button>
          ))}
          {source === "guion" && (
            <textarea value={ownScript} onChange={e => setOwnScript(e.target.value.slice(0, 6000))} rows={8} placeholder="Pega tu guion aquí"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60" />
          )}

          <div className="flex justify-end">
            <button onClick={() => setStep(2)} disabled={!ideaReady} className="btn-primary-nova inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[14px] font-semibold disabled:opacity-50">Siguiente <ArrowRight className="w-4 h-4" /></button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <h2 className="font-display font-semibold text-lg text-foreground">¿Qué video quieres?</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            {FORMATS.map(f => (
              <button key={f.id} onClick={() => setFormat(f)} className={card(format.id === f.id)}>
                <p className="font-medium text-foreground">{f.label}</p>
                <p className="text-[12px] text-muted-foreground mt-1">{f.line}</p>
                <p className="text-[11px] text-muted-foreground mt-3">{f.size === "9:16" ? "Vertical" : "Horizontal"}</p>
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Idioma del video</p>
            <div className="flex gap-2">{LANGS.map(([l, label]) => <button key={l} onClick={() => setLang(l)} className={`h-8 px-3 rounded-full border text-[12px] ${lang === l ? "border-foreground/40 text-foreground bg-card" : "border-border text-muted-foreground"}`}>{label}</button>)}</div>
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Atrás</button>
            <button onClick={() => void write()} disabled={writing} className="btn-primary-nova inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[14px] font-semibold disabled:opacity-60">
              <Sparkles className="w-4 h-4" /> Escribir mi guion · {price} créditos
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display font-semibold text-lg text-foreground">Tu guion</h2>
            <span className="text-[12px] text-muted-foreground">{writing ? "Escribiendo…" : `${scenes} escenas · ${format.label}`}</span>
          </div>
          <textarea value={script} onChange={e => setScript(e.target.value)} rows={18} readOnly={writing}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[13px] leading-relaxed text-foreground font-mono focus:outline-none focus:border-primary/60" />
          {writing ? (
            <p className="text-[12px] text-muted-foreground inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Puedes leer mientras se escribe.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => { void navigator.clipboard.writeText(script); toast.success("Guion copiado"); }} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-border text-[13px] text-foreground hover:border-foreground/30"><Copy className="w-4 h-4" /> Copiar guion</button>
              <button onClick={() => void write()} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-border text-[13px] text-foreground hover:border-foreground/30"><RefreshCw className="w-4 h-4" /> Otra versión · {price}</button>
              <button onClick={() => onNavigate("Miniaturas")} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-border text-[13px] text-foreground hover:border-foreground/30"><MonitorPlay className="w-4 h-4" /> Hacer la miniatura</button>
              <button onClick={() => setStep(2)} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Cambiar formato</button>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">Consejo: YouTube no paga por contenido copiado o hecho en masa sin aporte propio. Revisa el guion, ponle tu toque y verifica los datos antes de publicar.</p>
        </section>
      )}
    </div>
  );
}
