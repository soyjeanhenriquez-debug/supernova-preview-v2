import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft, ArrowUp, Check, ChevronDown, Clock, Copy, Film, Languages, Link2, Loader2, Monitor, MonitorPlay, Palette,
  RefreshCw, Shuffle, Sparkles, Youtube,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCredits, generatorCost } from "@/hooks/useCredits";
import { fnHeaders, fnErrorMessage, readBilling } from "@/lib/fnAuth";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { YT_REF_KEY, type YtItem } from "@/pages/YouTubeRadarPage";

/**
 * Creador de videos para YouTube (03-oct-2026, rehecho tras ver el "Agente Hacks" de HacksLabs).
 * UNA pantalla: "¿Qué video quieres hacer?" con tres pestañas (Idea · Mi guion · Link de YouTube) y
 * "La IA eligió por ti" (formato, duración, estilo, idioma) ya decidido, con "Otra combinación".
 * El usuario no tiene que pensar: escribe una idea o pega un enlace y la IA hace el resto.
 * - Idea / Mi guion → generador "yt-script" de ai-chat (se escribe en vivo; cobro en el servidor).
 * - Link → función yt-reference: Google Gemini VE el video público y devuelve estructura y un guion
 *   ORIGINAL (nunca su texto: YouTube no paga lo copiado). Traducir → yt-reference (translate).
 */
type Tab = "idea" | "guion" | "link";
type Size = "16:9" | "9:16" | "3:4";
type Analysis = { video: { id: string; title: string; channel: string; seconds: number; views: number; thumb: string | null }; topic: string; why_it_works: string[]; structure: string[]; opening: string; title: string; thumbnail: string };

const SIZES: { id: Size; label: string; line: string }[] = [
  { id: "16:9", label: "16:9 — Horizontal", line: "YouTube tradicional." },
  { id: "9:16", label: "9:16 — Vertical", line: "Shorts, Reels y TikTok." },
  { id: "3:4", label: "3:4 — Vertical suave", line: "Feed de Instagram y Facebook." },
];
const DURATIONS = [1, 3, 8, 12, 15, 20];
const STYLES = ["Cinematográfico", "Animación 2D", "Anime", "Pintura", "Minimalista", "Documental"];
const LANGS: { id: string; label: string }[] = [{ id: "es", label: "Español" }, { id: "en", label: "Inglés" }, { id: "pt", label: "Portugués" }, { id: "fr", label: "Francés" }];
const GEN = "yt-script";

/** La IA elige por ti: estilo según el tema (se puede cambiar). */
function guessStyle(text: string) {
  const t = text.toLowerCase();
  if (/perr|gat|mascot|animal|niñ|cuento|infantil/.test(t)) return "Animación 2D";
  if (/anime|manga|japon/.test(t)) return "Anime";
  if (/tao|espiritu|biblia|dios|zen|budd|estoic|filosof|alma/.test(t)) return "Pintura";
  if (/dato|ciencia|tecnolog|finanz|dinero|econom|salud/.test(t)) return "Documental";
  return "Cinematográfico";
}

function scriptSystem(minutes: number, lang: string) {
  const words = Math.round(minutes * 145);
  const idioma = lang === "en" ? "inglés" : lang === "pt" ? "portugués de Brasil" : lang === "fr" ? "francés" : "español neutro latinoamericano";
  return `Eres guionista de canales de YouTube sin rostro (faceless) que retienen hasta el final. Escribe en ${idioma}.
- Guion 100 % ORIGINAL, con ángulo propio, ejemplos nuevos y datos verificables (si dudas, dilo como posibilidad).
- Narración para voz en off, frases cortas y naturales, sin emojis. Unas ${words} palabras (≈ ${minutes} min).
- Estructura: gancho fuerte en los primeros 15 segundos → promesa → desarrollo en bloques con mini-ganchos → cierre memorable con invitación suave a suscribirse.
- Sin promesas de dinero, curas ni resultados garantizados.
- Divide TODO en escenas de 8 a 12 segundos con este formato exacto:
ESCENA n — [descripción visual breve para generar la imagen: quién, dónde, qué pasa, plano]
Narración: (lo que dice la voz en esa escena)
- Al final: "TÍTULO:" (máx. 70 caracteres, que dé curiosidad) y "MINIATURA:" (idea con máx. 5 palabras de texto).`;
}

async function readStream(resp: Response, onText: (t: string) => void) {
  const reader = resp.body!.getReader(); const dec = new TextDecoder();
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
      try { const c = JSON.parse(j).choices?.[0]?.delta?.content; if (c) { full += c; onText(full); } } catch { buf = line + "\n" + buf; break; }
    }
  }
  return full;
}

async function invokeRef(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("yt-reference", { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const msg = ctx ? await ctx.json().then((b: { error?: string }) => b?.error).catch(() => null) : null;
    throw new Error(msg || "No se pudo completar.");
  }
  return data;
}

export function YouTubeCreatorPage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { applyServerCharge, balance } = useCredits();
  const [tab, setTab] = useState<Tab>("idea");
  const [idea, setIdea] = useState("");
  const [ownScript, setOwnScript] = useState("");
  const [url, setUrl] = useState("");
  const [size, setSize] = useState<Size>("16:9");
  const [minutes, setMinutes] = useState(12);
  const [style, setStyle] = useState("Cinematográfico");
  const [styleTouched, setStyleTouched] = useState(false);
  const [lang, setLang] = useState("es");
  const [busy, setBusy] = useState<"" | "writing" | "analyzing" | "translating">("");
  const [script, setScript] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [showRef, setShowRef] = useState(false);
  const [targetLang, setTargetLang] = useState("en");
  const view: "input" | "script" = script || busy === "writing" ? "script" : "input";

  const PRICE = { idea: generatorCost(GEN).cost, link: 50, translate: 15 };
  const price = tab === "link" ? PRICE.link : PRICE.idea;

  // Viene de Nichos de YouTube: el enlace ya puesto (no se analiza solo: el usuario ve el precio y decide).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(YT_REF_KEY);
      if (!raw) return;
      sessionStorage.removeItem(YT_REF_KEY);
      const r = JSON.parse(raw) as YtItem & { lang?: string; kind?: string };
      setTab("link"); setUrl(`https://www.youtube.com/watch?v=${r.id}`);
      if (r.lang) setLang(r.lang);
      if (r.kind === "short") { setSize("9:16"); setMinutes(1); } else setMinutes(r.seconds >= 900 ? 15 : r.seconds >= 600 ? 12 : 8);
    } catch { /* sin almacenamiento */ }
  }, []);

  // La IA elige el estilo según la idea, hasta que el usuario lo cambie a mano.
  useEffect(() => { if (!styleTouched && idea.trim().length > 5) setStyle(guessStyle(idea)); }, [idea, styleTouched]);
  useEffect(() => { if (size === "9:16" && minutes > 3) setMinutes(1); }, [size]); // eslint-disable-line react-hooks/exhaustive-deps

  const scenesApprox = Math.max(4, Math.round((minutes * 60) / 10));
  const ready = tab === "idea" ? idea.trim().length >= 4 : tab === "guion" ? ownScript.trim().length >= 80 : /youtu\.?be/.test(url);

  const shuffle = () => {
    const s = STYLES.filter(x => x !== style);
    setStyle(s[Math.floor(Math.random() * s.length)]); setStyleTouched(true);
    if (size !== "9:16") setMinutes([8, 12, 15][Math.floor(Math.random() * 3)]);
  };

  const write = async () => {
    if (busy || balance < PRICE.idea) { if (balance < PRICE.idea) toast.error(`Te faltan créditos: el guion cuesta ${PRICE.idea}`); return; }
    const pedido = tab === "guion"
      ? `Adapta este guion mío al formato pedido, manteniendo mi idea y mejorando el gancho y el ritmo:\n${ownScript.trim().slice(0, 8000)}`
      : `Tema del video: ${idea.trim()}\nEstilo visual: ${style}. Formato ${size}.`;
    setBusy("writing"); setScript(""); setAnalysis(null);
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`, {
        method: "POST", headers: await fnHeaders(),
        body: JSON.stringify({ generator_id: GEN, generator_title: "Guion de YouTube", systemPrompt: scriptSystem(minutes, lang), messages: [{ role: "user", content: pedido }] }),
      });
      if (!resp.ok || !resp.body) throw new Error(await fnErrorMessage(resp, "No se pudo escribir el guion."));
      applyServerCharge(generatorCost(GEN).action, readBilling(resp), "Guion de YouTube");
      await readStream(resp, setScript);
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo escribir el guion."); }
    finally { setBusy(""); }
  };

  const analyze = async () => {
    if (busy) return;
    if (balance < PRICE.link) { toast.error(`Te faltan créditos: el análisis cuesta ${PRICE.link}`); return; }
    setBusy("analyzing");
    try {
      const d = await invokeRef({ url, lang, minutes });
      if (d.billing) applyServerCharge("gen_media", d.billing, "Analizar video de YouTube");
      setAnalysis({ video: d.video, topic: d.topic, why_it_works: d.why_it_works, structure: d.structure, opening: d.opening, title: d.title, thumbnail: d.thumbnail });
      setScript(`${d.script}${d.title ? `\n\nTÍTULO: ${d.title}` : ""}${d.thumbnail ? `\nMINIATURA: ${d.thumbnail}` : ""}`);
      if (!styleTouched) setStyle(guessStyle(`${d.topic} ${d.video?.title ?? ""}`));
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo analizar el video."); }
    finally { setBusy(""); }
  };

  const translate = async () => {
    if (busy || !script) return;
    if (balance < PRICE.translate) { toast.error(`Te faltan créditos: traducir cuesta ${PRICE.translate}`); return; }
    setBusy("translating");
    try {
      const d = await invokeRef({ action: "translate", script, lang: targetLang });
      if (d.billing) applyServerCharge("gen_media", d.billing, "Traducir guion");
      setScript(d.script); setLang(targetLang);
      toast.success(`Listo: guion en ${LANGS.find(l => l.id === targetLang)?.label.toLowerCase()}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo traducir."); }
    finally { setBusy(""); }
  };

  const submit = () => { if (!ready) return; if (tab === "link") void analyze(); else void write(); };
  const sceneCount = useMemo(() => (script.match(/ESCENA\s+\d+/gi) ?? []).length, [script]);
  const words = useMemo(() => script.split(/\s+/).filter(Boolean).length, [script]);

  const Chip = ({ icon: Icon, label, value, children }: { icon: typeof Clock; label: string; value: string; children: ReactNode }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex items-center gap-2 h-10 px-3.5 rounded-xl border border-border bg-card/40 text-[13px] hover:border-foreground/30">
          <Icon className="w-4 h-4 text-muted-foreground" strokeWidth={1.7} />
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
          <span className="text-foreground font-medium">{value}</span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[220px]">{children}</DropdownMenuContent>
    </DropdownMenu>
  );

  // ---------------- Pantalla del guion ----------------
  if (view === "script") {
    return (
      <div className="max-w-[920px] mx-auto space-y-5 py-4">
        <button onClick={() => { setScript(""); setAnalysis(null); }} disabled={!!busy} className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground disabled:opacity-50"><ArrowLeft className="w-4 h-4" /> Nueva idea</button>

        {analysis && (
          <div className="rounded-2xl border border-border p-4 space-y-3">
            <div className="flex gap-4 items-start">
              {analysis.video.thumb && <img src={analysis.video.thumb} alt="" className="w-40 aspect-video object-cover rounded-lg shrink-0" />}
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Video de referencia</p>
                <p className="text-[14px] font-medium text-foreground line-clamp-2">{analysis.video.title}</p>
                <p className="text-[12px] text-muted-foreground">{analysis.video.channel} · {Math.round(analysis.video.seconds / 60)} min · {analysis.video.views.toLocaleString("es")} vistas</p>
                {analysis.topic && <p className="text-[12px] text-foreground mt-1">{analysis.topic}</p>}
              </div>
            </div>
            <button onClick={() => setShowRef(s => !s)} className="text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ChevronDown className={`w-3.5 h-3.5 transition-transform ${showRef ? "rotate-180" : ""}`} /> Por qué funciona y su estructura</button>
            {showRef && (
              <div className="grid sm:grid-cols-2 gap-4 text-[12px]">
                <div><p className="text-muted-foreground mb-1">Por qué retiene</p><ul className="space-y-1">{analysis.why_it_works.map((w, i) => <li key={i} className="text-foreground">• {w}</li>)}</ul></div>
                <div><p className="text-muted-foreground mb-1">Su estructura</p><ol className="space-y-1">{analysis.structure.map((s, i) => <li key={i} className="text-foreground">{i + 1}. {s}</li>)}</ol></div>
                {analysis.opening && <p className="sm:col-span-2 text-muted-foreground">Así empieza el original: <span className="italic">"{analysis.opening}"</span></p>}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display font-semibold text-lg text-foreground">{analysis ? "Tu versión (guion original)" : "Tu guion"}</h2>
          <span className="text-[12px] text-muted-foreground">{busy === "writing" ? "Escribiendo…" : `${sceneCount} escenas · ${words.toLocaleString("es")} palabras · ${style} · ${size}`}</span>
        </div>
        <textarea value={script} onChange={e => setScript(e.target.value)} rows={18} readOnly={!!busy}
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[13px] leading-relaxed text-foreground font-mono focus:outline-none focus:border-primary/60" />

        {busy === "writing" ? (
          <p className="text-[12px] text-muted-foreground inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Puedes leer mientras se escribe.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-full border border-border overflow-hidden">
              <span className="pl-3 pr-1 text-muted-foreground"><Languages className="w-4 h-4" /></span>
              <select value={targetLang} onChange={e => setTargetLang(e.target.value)} className="bg-transparent text-[13px] text-foreground h-9 px-1 focus:outline-none">
                {LANGS.filter(l => l.id !== lang).map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
              <button onClick={() => void translate()} disabled={!!busy} className="h-9 px-3 text-[13px] text-foreground border-l border-border hover:bg-secondary/50 disabled:opacity-50">
                {busy === "translating" ? <Loader2 className="w-4 h-4 animate-spin" /> : `Traducir · ${PRICE.translate}`}
              </button>
            </div>
            <button onClick={() => { void navigator.clipboard.writeText(script); toast.success("Guion copiado"); }} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-border text-[13px] text-foreground hover:border-foreground/30"><Copy className="w-4 h-4" /> Copiar</button>
            <button onClick={() => void (analysis ? analyze() : write())} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-border text-[13px] text-foreground hover:border-foreground/30"><RefreshCw className="w-4 h-4" /> Otra versión · {analysis ? PRICE.link : PRICE.idea}</button>
            <button onClick={() => onNavigate("Miniaturas")} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-border text-[13px] text-foreground hover:border-foreground/30"><MonitorPlay className="w-4 h-4" /> Hacer la miniatura</button>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">YouTube no paga por contenido copiado o hecho en masa sin aporte propio: revisa el guion, ponle tu toque y verifica los datos antes de publicar.</p>
      </div>
    );
  }

  // ---------------- Pantalla de entrada ----------------
  return (
    <div className="max-w-[980px] mx-auto space-y-6 py-6">
      <div className="text-center space-y-2">
        <h1 className="font-display font-bold text-[28px] md:text-[38px] tracking-[-0.02em] text-foreground">¿Qué video quieres hacer?</h1>
        <p className="text-[14px] text-muted-foreground">Escribe tu idea o pega un video que ya funciona. La IA decide estructura, escenas y planos; todo se puede cambiar.</p>
      </div>

      <div className="rounded-2xl border border-border bg-card/40 p-3 md:p-4 space-y-3">
        <div className="flex gap-1">
          {([["idea", "Idea"], ["guion", "Mi guion"], ["link", "Link de YouTube"]] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} className={`h-8 px-3 rounded-lg text-[13px] ${tab === t ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>
          ))}
        </div>

        {tab === "link" ? (
          <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Link2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={url} onChange={e => setUrl(e.target.value.slice(0, 300))} autoFocus placeholder="https://www.youtube.com/watch?v=…"
                className="w-full rounded-xl border border-border bg-background pl-9 pr-3 h-12 text-sm text-foreground focus:outline-none focus:border-primary/60" />
            </div>
            <button type="submit" disabled={!ready || !!busy} className="btn-primary-nova h-12 px-5 rounded-xl text-[14px] font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {busy === "analyzing" ? <><Loader2 className="w-4 h-4 animate-spin" /> Analizando… (1 a 2 min)</> : <><Sparkles className="w-4 h-4" /> Analizar · {PRICE.link} créditos</>}
            </button>
          </form>
        ) : (
          <div className="relative">
            <textarea value={tab === "idea" ? idea : ownScript} onChange={e => (tab === "idea" ? setIdea(e.target.value.slice(0, 300)) : setOwnScript(e.target.value.slice(0, 8000)))}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && tab === "idea") { e.preventDefault(); submit(); } }}
              rows={tab === "idea" ? 3 : 8} autoFocus
              placeholder={tab === "idea" ? "Ej.: 12 señales de que tu perro te ve como su familia" : "Pega aquí tu guion (lo mejoramos y lo dividimos en escenas)"}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 pr-14 text-[14px] text-foreground focus:outline-none focus:border-primary/60 resize-none" />
            <button onClick={submit} disabled={!ready || !!busy} aria-label={`Escribir guion · ${PRICE.idea} créditos`} title={`Escribir guion · ${PRICE.idea} créditos`}
              className="absolute right-3 bottom-3 w-9 h-9 rounded-full btn-primary-nova flex items-center justify-center disabled:opacity-40">
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground px-1">
          {tab === "link" ? "Google ve el video público y sacamos su estructura y un guion tuyo, original, en el idioma que elijas. Si falla, no se cobra." : `Escribimos el guion completo, dividido en escenas, en vivo · ${PRICE.idea} créditos.`}
        </p>
      </div>

      {/* La IA eligió por ti */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-muted-foreground">La IA eligió por ti</p>
          <button onClick={shuffle} className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"><Shuffle className="w-3.5 h-3.5" /> Otra combinación</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip icon={Monitor} label="Formato" value={size}>
            {SIZES.map(s => <DropdownMenuItem key={s.id} onClick={() => setSize(s.id)} className="flex-col items-start gap-0"><span className="font-medium">{s.label}</span><span className="text-[11px] text-muted-foreground">{s.line}</span></DropdownMenuItem>)}
          </Chip>
          <Chip icon={Clock} label="Duración" value={`${minutes} min`}>
            {DURATIONS.filter(d => size !== "9:16" || d <= 3).map(d => <DropdownMenuItem key={d} onClick={() => setMinutes(d)}>{d} min {minutes === d && <Check className="w-3.5 h-3.5 ml-auto" />}</DropdownMenuItem>)}
          </Chip>
          <Chip icon={Palette} label="Estilo" value={style}>
            {STYLES.map(s => <DropdownMenuItem key={s} onClick={() => { setStyle(s); setStyleTouched(true); }}>{s} {style === s && <Check className="w-3.5 h-3.5 ml-auto" />}</DropdownMenuItem>)}
          </Chip>
          <Chip icon={Languages} label="Idioma" value={LANGS.find(l => l.id === lang)?.label ?? "Español"}>
            {LANGS.map(l => <DropdownMenuItem key={l.id} onClick={() => setLang(l.id)}>{l.label} {lang === l.id && <Check className="w-3.5 h-3.5 ml-auto" />}</DropdownMenuItem>)}
          </Chip>
        </div>
        <p className="text-[12px] text-muted-foreground">
          Gancho en los primeros 15 s · Voz en off · ~{scenesApprox} escenas con imagen · Guion original · {price} créditos el guion
        </p>
      </div>

      <div className="flex items-center justify-center gap-4 text-[12px] text-muted-foreground pt-2">
        <button onClick={() => onNavigate("Nichos YouTube")} className="inline-flex items-center gap-1.5 hover:text-foreground"><Youtube className="w-4 h-4" /> Buscar videos que funcionan</button>
        <button onClick={() => onNavigate("Series")} className="inline-flex items-center gap-1.5 hover:text-foreground"><Film className="w-4 h-4" /> Serie corta animada</button>
      </div>
    </div>
  );
}
