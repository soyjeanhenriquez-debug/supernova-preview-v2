import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Clapperboard, Film, Link2, Megaphone, Mic, MonitorPlay, Palette, Scissors, Shapes, Sparkles, Upload, User, Wand2, X, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { giveReelStudioFile } from "@/lib/intentHandoff";
import { toolEvent } from "@/lib/toolEvents";
import { track } from "@/lib/analytics";

/**
 * «¿Qué quieres hacer?» de Video (06-nov-2026, pedido de Jean tras el caso de Cindy): ella tenía un reel de recetas
 * de ejemplo, quería uno parecido y terminó en Motion graphics (lo único que decía «sube un video que te guste").
 * La persona no elige herramientas: responde 2 o 3 preguntas de lo que quiere y la guía la lleva a la pantalla
 * correcta, con su video ya cargado si trae uno. Nunca cobra: solo orienta. Boceto aprobado:
 * docs/propuestas/2026-11-06-boceto-que-quieres-hacer-video.jpg.
 */
export type GuiaModo = "anuncio" | "motion" | "clip" | "serie";
type Destino = { modo: GuiaModo } | { hash: string; archivo?: boolean };
type Opcion = { id: string; icon: LucideIcon; titulo: string; desc?: string; ir?: Destino };
type Paso = { id: string; q: string; sub?: string; opciones: Opcion[] };

const REEL_STUDIO = "#/con-tu-cara/reel-ia";
const SUBE_TU_VIDEO = "#/con-tu-cara/video";
const VISTO_KEY = "sn_video_guia_visto";
const NOMBRE: Record<GuiaModo, string> = { anuncio: "Anuncio en video", motion: "Motion graphics", clip: "Un clip", serie: "Serie" };

const PARA: Paso = {
  id: "para", q: "¿Qué video quieres hacer?", sub: "Elige y te llevamos paso a paso.",
  opciones: [
    { id: "redes", icon: MonitorPlay, titulo: "Un video para redes", desc: "Reels, TikTok o Shorts para que te conozcan." },
    { id: "anuncio", icon: Megaphone, titulo: "Un video para anunciar", desc: "Para vender tu producto con anuncios pagados." },
    { id: "editar", icon: Scissors, titulo: "Editar un video que ya grabé", desc: "Subtítulos, cortes de silencios y portada.", ir: { hash: SUBE_TU_VIDEO } },
  ],
};
const EJEMPLO: Paso = {
  id: "ejemplo", q: "¿Tienes un video de ejemplo que te gustaría hacer parecido?",
  sub: "Uno que descargaste de TikTok o Instagram, o un anuncio que viste.",
  opciones: [
    { id: "si", icon: Film, titulo: "Sí, tengo uno" },
    { id: "no", icon: Sparkles, titulo: "No, empiezo desde mi idea" },
  ],
};
const TOMAR: Paso = {
  id: "tomar", q: "¿Qué quieres tomar de ese video?",
  opciones: [
    { id: "todo", icon: Wand2, titulo: "Hacer uno parecido con mi producto", desc: "Mismas partes, mismo ritmo y un texto parecido. Con tu cara o solo con tu voz.", ir: { hash: REEL_STUDIO, archivo: true } },
    { id: "estilo", icon: Palette, titulo: "Solo copiar su estilo", desc: "Los colores, la letra y la forma en que se mueve el texto.", ir: { modo: "motion" } },
  ],
};
const COMO: Record<"redes" | "anuncio", Paso> = {
  redes: {
    id: "como", q: "¿Cómo quieres que se vea?",
    opciones: [
      { id: "cara", icon: User, titulo: "Yo hablando a cámara", desc: "Tú das el mensaje y la app pone imágenes al ritmo de cada frase.", ir: { hash: REEL_STUDIO } },
      { id: "voz", icon: Mic, titulo: "Mi voz con imágenes, sin salir", desc: "Voz en off con tomas que acompañan lo que dices.", ir: { hash: REEL_STUDIO } },
      { id: "texto", icon: Shapes, titulo: "Texto animado", desc: "Frases que se mueven, sin personas.", ir: { modo: "motion" } },
      { id: "historia", icon: Clapperboard, titulo: "Una historia con escenas de IA", desc: "Novela, dibujos animados o un short en varias escenas.", ir: { modo: "serie" } },
    ],
  },
  anuncio: {
    id: "como", q: "¿Cómo quieres que se vea tu anuncio?",
    opciones: [
      { id: "persona", icon: User, titulo: "Una persona presentando mi producto", desc: "Creada con IA, en 3 tomas: gancho, demostración y llamada a la acción.", ir: { modo: "anuncio" } },
      { id: "voz", icon: Mic, titulo: "Mi voz con imágenes", desc: "Voz en off con tomas que acompañan lo que dices.", ir: { hash: REEL_STUDIO } },
      { id: "texto", icon: Shapes, titulo: "Texto animado con mi oferta", desc: "Frases que se mueven, sin personas.", ir: { modo: "motion" } },
      { id: "escena", icon: Film, titulo: "Una sola escena de 5 o 10 segundos", desc: "Describes lo que pasa y la IA lo graba.", ir: { modo: "clip" } },
    ],
  },
};

/** ¿Se abre sola? La primera vez de cada día; después queda el enlace para volver a abrirla. */
function abiertaAlEntrar(): boolean {
  try { return localStorage.getItem(VISTO_KEY) !== new Date().toDateString(); } catch { return true; }
}
function marcarVista() {
  try { localStorage.setItem(VISTO_KEY, new Date().toDateString()); } catch { /* sin almacenamiento */ }
}

export function VideoGuia({ onModo, disabled }: { onModo: (m: GuiaModo) => void; disabled?: boolean }) {
  const [abierta, setAbierta] = useState(abiertaAlEntrar);
  const [ruta, setRuta] = useState<string[]>([]); // respuestas elegidas, en orden
  const [archivo, setArchivo] = useState(false); // último paso: subir el video de ejemplo
  const fileRef = useRef<HTMLInputElement>(null);

  const cerrar = () => { marcarVista(); setAbierta(false); setRuta([]); setArchivo(false); };
  const para = ruta[0] as "redes" | "anuncio" | undefined;
  const paso: Paso = ruta.length === 0 ? PARA : ruta.length === 1 ? EJEMPLO : ruta[1] === "si" ? TOMAR : COMO[para ?? "redes"];
  const total = ruta[0] === "editar" ? 1 : 3;

  const irA = (d: Destino, quien: string) => {
    toolEvent("video-guia", "resultado");
    track("video_guia_destino", { ruta: [...ruta, quien].join(">") });
    if ("modo" in d) {
      cerrar();
      onModo(d.modo);
      toast.success(`Listo: estás en «${NOMBRE[d.modo]}»`, { description: "Sigue los pasos de abajo, en orden." });
      return;
    }
    if (d.archivo) { setRuta(r => [...r, quien]); setArchivo(true); return; }
    marcarVista();
    window.location.hash = d.hash;
  };
  const elegir = (o: Opcion) => (o.ir ? irA(o.ir, o.id) : setRuta(r => [...r, o.id]));
  const atras = () => { if (archivo) { setArchivo(false); setRuta(r => r.slice(0, -1)); } else setRuta(r => r.slice(0, -1)); };

  const subir = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("video/")) { toast.error("Elige un video (MP4 o MOV)."); return; }
    toolEvent("video-guia", "resultado");
    track("video_guia_destino", { ruta: [...ruta, "sube-ejemplo"].join(">") });
    giveReelStudioFile(f);
    marcarVista();
    window.location.hash = REEL_STUDIO;
  };

  if (!abierta) {
    return (
      <button type="button" onClick={() => setAbierta(true)} disabled={disabled}
        className="w-full flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left hover:border-primary/50 disabled:opacity-60">
        <span className="text-sm text-foreground"><b className="font-semibold">¿No sabes por dónde empezar?</b> <span className="text-muted-foreground">Dinos qué quieres hacer y te llevamos.</span></span>
        <span className="text-sm font-semibold text-primary whitespace-nowrap">Te ayudo <ArrowRight className="inline w-4 h-4" /></span>
      </button>
    );
  }

  return (
    <section className="rounded-2xl border border-primary/40 bg-card p-4 sm:p-5 space-y-4" aria-label="Guía: qué video quieres hacer">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          {archivo ? "Último paso" : `Paso ${Math.min(ruta.length + 1, total)} de ${total}`}
        </span>
        <div className="flex items-center gap-1">
          {(ruta.length > 0 || archivo) && (
            <button type="button" onClick={atras} className="inline-flex items-center gap-1 h-9 px-2.5 rounded-full text-[13px] text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" /> Atrás
            </button>
          )}
          <button type="button" onClick={cerrar} aria-label="Cerrar la guía" className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {archivo ? (
        <div className="space-y-3">
          <div>
            <h2 className="font-display font-bold text-xl text-foreground">Sube tu video de ejemplo</h2>
            <p className="text-sm text-muted-foreground mt-1">Así sigue todo:</p>
          </div>
          <ol className="space-y-2">
            {["Lo analizamos: su gancho, sus partes y su cierre.", "Pegas tu texto si ya lo tienes. Si no, lo escribimos por ti.", "Eliges la voz y las imágenes.", "Apruebas el storyboard antes de crear.", "Lo descargas o lo programas."].map((x, k) => (
              <li key={k} className="flex items-start gap-2.5 text-sm text-foreground">
                <span className="w-6 h-6 shrink-0 rounded-full bg-primary/15 text-primary text-[12px] font-bold flex items-center justify-center">{k + 1}</span>{x}
              </li>
            ))}
          </ol>
          <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; subir(f); }} />
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground text-[15px] font-semibold">
            <Upload className="w-4 h-4" /> Subir el video (hasta 18 MB)
          </button>
          <button type="button" onClick={() => { marcarVista(); window.location.hash = REEL_STUDIO; }}
            className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border text-sm text-foreground">
            <Link2 className="w-4 h-4" /> Lo tengo en un enlace de Instagram
          </button>
          <p className="text-[12px] text-muted-foreground">¿Es de TikTok o YouTube? Descárgalo y súbelo: esos enlaces no se pueden leer.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <h2 className="font-display font-bold text-xl text-foreground">{paso.q}</h2>
            {paso.sub && <p className="text-sm text-muted-foreground mt-1">{paso.sub}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {paso.opciones.map(o => (
              <button key={o.id} type="button" onClick={() => elegir(o)} disabled={disabled}
                className="flex items-start gap-3 rounded-xl border border-border bg-background/40 p-3.5 text-left min-h-[56px] hover:border-primary/60 hover:bg-primary/5 disabled:opacity-60">
                <span className="w-9 h-9 shrink-0 rounded-lg bg-muted flex items-center justify-center"><o.icon className="w-[18px] h-[18px] text-primary" /></span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold text-foreground leading-snug">{o.titulo}</span>
                  {o.desc && <span className="block text-[12px] text-muted-foreground mt-0.5 leading-snug">{o.desc}</span>}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
