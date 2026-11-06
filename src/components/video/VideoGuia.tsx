import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Clapperboard, FileText, Film, Link2, Megaphone, MessageCircle, Mic, MonitorPlay, Palette, Scissors, Send, Shapes, Sparkles, Upload, User, Wand2, X, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { giveMontaje, giveReelStudio } from "@/lib/intentHandoff";
import { toolEvent } from "@/lib/toolEvents";
import { track } from "@/lib/analytics";
import { CREDIT_COSTS } from "@/hooks/useCredits";
import { ASK_ASSISTANT_EVENT } from "@/components/HelpAssistant";

/**
 * «¿Qué video quieres hacer?» de Video (06-nov-2026, pedido de Jean tras el caso de Cindy): ella tenía un reel de recetas
 * de ejemplo y su texto, quería uno parecido y terminó en Motion graphics (lo único que decía «sube un video que te guste»).
 * La persona no elige herramientas: dice para qué es el video y QUÉ TIENE (video de ejemplo, su texto, las dos cosas o
 * nada). La guía usa lo que tiene, le ayuda a crear lo que falta y la lleva a la pantalla correcta con todo cargado:
 * - video (y texto) → «uno parecido» = Reel Studio · «solo su estilo» = Motion graphics;
 * - solo texto → Reel Studio (voz con imágenes o hablando) o Motion graphics (texto animado);
 * - nada → «¿cómo quieres que se vea?».
 * En cada paso, si ninguna opción le sirve, escribe con sus palabras qué quiere y se lo pasa al asistente.
 * La guía nunca cobra: cada herramienta cobra cuando la persona lo confirma. Boceto:
 * docs/propuestas/2026-11-06-boceto-que-quieres-hacer-video.jpg.
 */
export type GuiaModo = "anuncio" | "motion" | "clip" | "serie";
type Para = "redes" | "anuncio" | "editar";
type Tiene = "ambos" | "video" | "texto" | "nada";
type Destino = { modo: GuiaModo } | { hash: string };
type Opcion = { id: string; icon: LucideIcon; titulo: string; desc?: string; ir?: Destino };

const REEL_STUDIO = "#/con-tu-cara/reel-ia";
const SUBE_TU_VIDEO = "#/con-tu-cara/video";
const MONTAJE = "#/con-tu-cara/montaje";
const VISTO_KEY = "sn_video_guia_visto";
const NOMBRE: Record<GuiaModo, string> = { anuncio: "Anuncio en video", motion: "Motion graphics", clip: "Un clip", serie: "Serie" };
const MIN_PALABRAS = 8;

const PARA: Opcion[] = [
  { id: "redes", icon: MonitorPlay, titulo: "Un video para redes", desc: "Reels, TikTok o Shorts para que te conozcan." },
  { id: "anuncio", icon: Megaphone, titulo: "Un video para anunciar", desc: "Para vender tu producto con anuncios pagados." },
  { id: "editar", icon: Scissors, titulo: "Editar lo que ya grabé", desc: "Un video o varias tomas: subtítulos, cortes, unirlas y quitar marcas de agua." },
];
const EDITAR: Opcion[] = [
  { id: "uno", icon: Film, titulo: "Un video ya grabado", desc: "Subtítulos, cortes de silencios y portada.", ir: { hash: SUBE_TU_VIDEO } },
  { id: "tomas", icon: Scissors, titulo: "Varias tomas para unir", desc: "Las que hiciste en la app o grabaste: las unimos como el video que te gusta, sin marcas de agua.", ir: { hash: MONTAJE } },
];
const TIENE: Opcion[] = [
  { id: "ambos", icon: Film, titulo: "Un video de ejemplo y mi texto", desc: "Hacemos tu versión de ese video con tu texto." },
  { id: "video", icon: Film, titulo: "Solo un video de ejemplo", desc: "Lo analizamos y escribimos tu texto con la misma estructura." },
  { id: "texto", icon: FileText, titulo: "Solo mi texto (guion o copy)", desc: "Le ponemos voz, imágenes o animación." },
  { id: "nada", icon: Sparkles, titulo: "Nada todavía", desc: "Lo creamos contigo desde tu idea." },
  { id: "tomas", icon: Scissors, titulo: "Mis tomas ya hechas", desc: "Las que creaste en la app o grabaste: las unimos como tu referencia.", ir: { hash: MONTAJE } },
];
const COMO: Record<Exclude<Para, "editar">, Opcion[]> = {
  redes: [
    { id: "cara", icon: User, titulo: "Yo hablando a cámara", desc: "Tú das el mensaje y la app pone imágenes al ritmo de cada frase.", ir: { hash: REEL_STUDIO } },
    { id: "voz", icon: Mic, titulo: "Mi voz con imágenes, sin salir", desc: "Voz en off con tomas que acompañan lo que dices.", ir: { hash: REEL_STUDIO } },
    { id: "texto", icon: Shapes, titulo: "Texto animado", desc: "Frases que se mueven, sin personas.", ir: { modo: "motion" } },
    { id: "historia", icon: Clapperboard, titulo: "Una historia con escenas de IA", desc: "Novela, dibujos animados o un short en varias escenas.", ir: { modo: "serie" } },
  ],
  anuncio: [
    { id: "persona", icon: User, titulo: "Una persona presentando mi producto", desc: "Creada con IA, en 3 tomas: gancho, demostración y llamada a la acción.", ir: { modo: "anuncio" } },
    { id: "voz", icon: Mic, titulo: "Mi voz con imágenes", desc: "Voz en off con tomas que acompañan lo que dices.", ir: { hash: REEL_STUDIO } },
    { id: "texto", icon: Shapes, titulo: "Texto animado con mi oferta", desc: "Frases que se mueven, sin personas.", ir: { modo: "motion" } },
    { id: "escena", icon: Film, titulo: "Una sola escena de 5 o 10 segundos", desc: "Describes lo que pasa y la IA lo graba.", ir: { modo: "clip" } },
  ],
};
// Solo con su texto: lo que de verdad usa un texto ya escrito.
const CON_TEXTO: Opcion[] = [
  { id: "voz", icon: Mic, titulo: "Mi voz con imágenes, sin salir", desc: "Tu texto con voz y tomas que acompañan cada frase.", ir: { hash: REEL_STUDIO } },
  { id: "cara", icon: User, titulo: "Yo diciéndolo a cámara", desc: "Tu texto dicho por ti, con imágenes al ritmo.", ir: { hash: REEL_STUDIO } },
  { id: "texto", icon: Shapes, titulo: "Texto animado", desc: "Tus frases se mueven en pantalla, sin personas.", ir: { modo: "motion" } },
];
const PASOS_PARECIDO = ["Lo analizamos: su gancho, sus partes y su cierre.", "Usamos tu texto o, si no tienes, lo escribimos por ti.", "Eliges la voz y las imágenes.", "Apruebas el storyboard antes de crear.", "Lo descargas o lo programas."];

/** ¿Se abre sola? La primera vez de cada día; después queda el enlace para volver a abrirla. */
function abiertaAlEntrar(): boolean {
  try { return localStorage.getItem(VISTO_KEY) !== new Date().toDateString(); } catch { return true; }
}
function marcarVista() {
  try { localStorage.setItem(VISTO_KEY, new Date().toDateString()); } catch { /* sin almacenamiento */ }
}
const palabras = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

export function VideoGuia({ onModo, onEstilo, disabled, fija }: {
  /** Ir a un modo de esta pantalla, con el texto de la persona si lo trajo (Motion graphics lo usa como guion). */
  onModo: (m: GuiaModo, texto?: string) => void;
  /** «Solo copiar su estilo»: Motion graphics con el video de ejemplo (y su texto como guion). */
  onEstilo: (file: File, texto?: string) => void;
  disabled?: boolean;
  /** Página Video del menú (06-nov-2026): la guía es lo primero y no se cierra; la cuadrícula queda debajo como atajo. */
  fija?: boolean;
}) {
  const [abierta, setAbierta] = useState(() => !!fija || abiertaAlEntrar());
  const [para, setPara] = useState<Para | null>(null);
  const [tiene, setTiene] = useState<Tiene | null>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [texto, setTexto] = useState("");
  const [textoListo, setTextoListo] = useState(false);
  const [escribir, setEscribir] = useState(false); // «no está lo que busco»: lo escribe con sus palabras
  const [pedido, setPedido] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const reiniciar = () => { setPara(null); setTiene(null); setVideo(null); setTexto(""); setTextoListo(false); setEscribir(false); setPedido(""); };
  const cerrar = () => { marcarVista(); if (!fija) setAbierta(false); reiniciar(); };

  const quiereVideo = tiene === "ambos" || tiene === "video";
  const quiereTexto = tiene === "ambos" || tiene === "texto";
  // Qué pantalla toca ahora, en orden: para qué → qué tienes → tu video → tu texto → qué hacemos.
  const etapa = !para ? "para" : para === "editar" ? "editar" : !tiene ? "tiene" : quiereVideo && !video ? "video" : quiereTexto && !textoListo ? "texto" : "final";
  const total = 3 + (quiereVideo ? 1 : 0) + (quiereTexto ? 1 : 0);
  const n = { para: 1, editar: 2, tiene: 2, video: 3, texto: quiereVideo ? 4 : 3, final: total }[etapa];
  const textoFinal = textoListo ? texto.trim() : "";

  const medir = (fin: string) => {
    toolEvent("video-guia", "resultado");
    track("video_guia_destino", { ruta: [para ?? "", tiene ?? "", fin].filter(Boolean).join(">") });
  };
  const irA = (d: Destino, quien: string) => {
    medir(quien);
    marcarVista();
    if ("modo" in d) {
      const t = textoFinal;
      setAbierta(false); reiniciar();
      onModo(d.modo, t || undefined);
      toast.success(`Listo: estás en «${NOMBRE[d.modo]}»`, { description: t && d.modo === "motion" ? "Tu texto ya está puesto. Sigue los pasos de abajo." : "Sigue los pasos de abajo, en orden." });
      return;
    }
    if (d.hash === REEL_STUDIO) giveReelStudio({ file: video ?? undefined, texto: textoFinal });
    if (d.hash === MONTAJE) giveMontaje({ file: video ?? undefined, texto: textoFinal });
    window.location.hash = d.hash;
  };
  const elegirPara = (o: Opcion) => (o.ir ? irA(o.ir, o.id) : setPara(o.id as Para));
  const atras = () => {
    setEscribir(false);
    if (etapa === "final" && quiereTexto) { setTextoListo(false); return; }
    if (etapa === "final" && quiereVideo) { setVideo(null); return; }
    if (etapa === "texto" && quiereVideo) { setVideo(null); return; }
    if (etapa === "video" || etapa === "texto" || etapa === "final") { setTiene(null); return; }
    if (etapa === "tiene" || etapa === "editar") setPara(null);
  };
  const elegirVideo = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("video/")) { toast.error("Elige un video (MP4 o MOV)."); return; }
    setVideo(f);
  };
  const seguirConTexto = () => {
    if (palabras(texto) < MIN_PALABRAS) { toast.error(`Pega tu texto completo (al menos ${MIN_PALABRAS} palabras).`); return; }
    setTextoListo(true);
  };
  const soloEstilo = () => {
    if (!video) return;
    medir("estilo");
    const f = video, t = textoFinal;
    cerrar();
    onEstilo(f, t || undefined);
  };
  const enviarPedido = () => {
    const q = pedido.trim();
    if (q.length < 5) { toast.error("Cuéntanos en una frase qué quieres hacer."); return; }
    const contexto = [
      para === "editar" ? "Quiero editar lo que ya grabé." : para ? `Quiero hacer un video ${para === "redes" ? "para redes" : "para anunciar"}.` : "Quiero hacer un video.",
      video ? `Tengo un video de ejemplo (${video.name}).` : "",
      textoFinal ? "Ya tengo mi texto." : "",
    ].filter(Boolean).join(" ");
    medir("escribe");
    window.dispatchEvent(new CustomEvent(ASK_ASSISTANT_EVENT, { detail: { text: `${contexto} ${q}`.slice(0, 500) } }));
    cerrar();
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

  const opcion = (o: Opcion, onClick: () => void) => (
    <button key={o.id} type="button" onClick={onClick} disabled={disabled}
      className="flex items-start gap-3 rounded-xl border border-border bg-background/40 p-3.5 text-left min-h-[56px] hover:border-primary/60 hover:bg-primary/5 disabled:opacity-60">
      <span className="w-9 h-9 shrink-0 rounded-lg bg-muted flex items-center justify-center"><o.icon className="w-[18px] h-[18px] text-primary" /></span>
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold text-foreground leading-snug">{o.titulo}</span>
        {o.desc && <span className="block text-[12px] text-muted-foreground mt-0.5 leading-snug">{o.desc}</span>}
      </span>
    </button>
  );
  const pregunta = (q: string, sub?: string) => (
    <div>
      <h2 className="font-display font-bold text-xl text-foreground">{q}</h2>
      {sub && <p className="text-sm text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
  const grid = (ops: Opcion[], on: (o: Opcion) => void) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">{ops.map(o => opcion(o, () => on(o)))}</div>
  );

  return (
    <section className="rounded-2xl border border-primary/40 bg-card p-4 sm:p-5 space-y-4" aria-label="Guía: qué video quieres hacer">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Paso {n} de {total}</span>
        <div className="flex items-center gap-1">
          {etapa !== "para" && (
            <button type="button" onClick={atras} className="inline-flex items-center gap-1 h-9 px-2.5 rounded-full text-[13px] text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" /> Atrás
            </button>
          )}
          {!fija && (
            <button type="button" onClick={cerrar} aria-label="Cerrar la guía" className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {etapa === "para" && <div className="space-y-3">{pregunta("¿Qué video quieres hacer?", "Elige y te llevamos paso a paso.")}{grid(PARA, elegirPara)}</div>}

      {etapa === "editar" && <div className="space-y-3">{pregunta("¿Qué quieres editar?")}{grid(EDITAR, o => o.ir && irA(o.ir, o.id))}</div>}

      {etapa === "tiene" && (
        <div className="space-y-3">
          {pregunta("¿Qué tienes ya?", "Usamos lo que tengas. Lo que falte, lo creamos contigo.")}
          {grid(TIENE, o => (o.ir ? irA(o.ir, o.id) : setTiene(o.id as Tiene)))}
        </div>
      )}

      {etapa === "video" && (
        <div className="space-y-3">
          {pregunta("Sube tu video de ejemplo", "El que descargaste de TikTok o Instagram, o el anuncio que viste.")}
          <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; elegirVideo(f); }} />
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground text-[15px] font-semibold">
            <Upload className="w-4 h-4" /> Subir el video (hasta 18 MB)
          </button>
          <button type="button" onClick={() => irA({ hash: REEL_STUDIO }, "enlace")}
            className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border text-sm text-foreground">
            <Link2 className="w-4 h-4" /> Lo tengo en un enlace de Instagram
          </button>
          <p className="text-[12px] text-muted-foreground">¿Es de TikTok o YouTube? Descárgalo y súbelo: esos enlaces no se pueden leer.</p>
        </div>
      )}

      {etapa === "texto" && (
        <div className="space-y-3">
          {video && <p className="text-[12px] text-muted-foreground truncate">Tu video: {video.name}</p>}
          {pregunta("Pega tu texto", "El guion o el copy que quieres que diga tu video. Lo usamos tal cual.")}
          <textarea value={texto} onChange={e => setTexto(e.target.value.slice(0, 4000))} rows={6} aria-label="Tu texto"
            placeholder="Ej.: Si trabajas todo el día, lo último que necesitas al llegar a casa es…"
            className="w-full rounded-xl border border-border bg-background/40 p-3 text-[16px] sm:text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/60" />
          <button type="button" onClick={seguirConTexto} disabled={disabled}
            className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground text-[15px] font-semibold disabled:opacity-60">
            Seguir <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {etapa === "final" && video && (
        <div className="space-y-3">
          <p className="text-[12px] text-muted-foreground truncate">Tu video: {video.name}{textoFinal ? " · tu texto listo" : ""}</p>
          {pregunta("¿Qué quieres hacer con este video?")}
          <div className="rounded-xl border border-primary/50 bg-primary/5 p-3.5 space-y-3">
            <div className="flex items-start gap-3">
              <span className="w-9 h-9 shrink-0 rounded-lg bg-muted flex items-center justify-center"><Wand2 className="w-[18px] h-[18px] text-primary" /></span>
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold text-foreground leading-snug">Hacer uno parecido con mi producto</span>
                <span className="block text-[12px] text-muted-foreground mt-0.5 leading-snug">Mismas partes y mismo ritmo{textoFinal ? ", con tu texto" : ", con un texto parecido"}. Con tu cara o solo con tu voz.</span>
              </span>
            </div>
            <ol className="space-y-1.5">
              {PASOS_PARECIDO.map((x, k) => (
                <li key={k} className="flex items-start gap-2.5 text-[13px] text-foreground">
                  <span className="w-5 h-5 shrink-0 rounded-full bg-primary/15 text-primary text-[11px] font-bold flex items-center justify-center">{k + 1}</span>{x}
                </li>
              ))}
            </ol>
            <button type="button" onClick={() => irA({ hash: REEL_STUDIO }, "parecido")} disabled={disabled}
              className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground text-[15px] font-semibold disabled:opacity-60">
              Sí, hacer uno parecido <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          {opcion({ id: "tomas", icon: Scissors, titulo: "Ya tengo mis tomas: unirlas como este video", desc: "Elige las tomas que hiciste en la app o súbelas. Las armamos con su ritmo y quitamos marcas de agua." }, () => irA({ hash: MONTAJE }, "tomas"))}
          {opcion({ id: "estilo", icon: Palette, titulo: `Solo copiar su estilo · ${CREDIT_COSTS.motion_style} créditos`, desc: "Los colores, la letra y la forma en que se mueve el texto, para tus propias frases animadas." }, soloEstilo)}
        </div>
      )}

      {etapa === "final" && !video && (
        <div className="space-y-3">
          {textoFinal && <p className="text-[12px] text-muted-foreground">Tu texto está listo.</p>}
          {pregunta(textoFinal ? "¿Cómo quieres que se vea tu texto?" : para === "anuncio" ? "¿Cómo quieres que se vea tu anuncio?" : "¿Cómo quieres que se vea?")}
          {grid(textoFinal ? CON_TEXTO : COMO[para === "anuncio" ? "anuncio" : "redes"], o => o.ir && irA(o.ir, o.id))}
        </div>
      )}

      {/* Siempre una salida: si ninguna opción encaja, lo escribe con sus palabras y le responde el asistente. */}
      <div className="pt-1 border-t border-border/60">
        {!escribir ? (
          <button type="button" onClick={() => setEscribir(true)} className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
            <MessageCircle className="w-4 h-4" /> ¿No ves lo que buscas? <span className="font-semibold text-primary">Escríbenos qué quieres hacer</span>
          </button>
        ) : (
          <div className="mt-3 space-y-2">
            <textarea value={pedido} onChange={e => setPedido(e.target.value.slice(0, 400))} rows={3} aria-label="Qué quieres hacer"
              placeholder="Ej.: quiero un video como este pero con mis recetas y que diga el precio arriba"
              className="w-full rounded-xl border border-border bg-background/40 p-3 text-[16px] sm:text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/60" />
            <button type="button" onClick={enviarPedido}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-primary/60 text-sm font-semibold text-foreground hover:bg-primary/10">
              <Send className="w-4 h-4" /> Enviar al asistente
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
