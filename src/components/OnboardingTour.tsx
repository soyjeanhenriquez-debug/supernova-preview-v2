import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, ChevronRight, ChevronLeft, X } from "lucide-react";

const KEY = "supernova:onboarding-v2-done";

type Step = {
  target?: string;        // data-tour selector value; undefined = centered modal
  title: string;
  page: string;
  body: string;
  placement?: "right" | "left" | "bottom" | "center";
};

// Mismo orden que el menú y los precios REALES (tabla credit_prices): un tour
// que promete otra cosa de la que el usuario encuentra le quita confianza el
// primer minuto.
const STEPS: Step[] = [
  {
    title: "Bienvenido a SUPERNOVA",
    page: "Tour de 1 minuto",
    body: "Aquí no empiezas de cero: cada día te mostramos <strong>negocios digitales que ya están vendiendo</strong>, para que sepas qué vender. Tu plan trae <strong>2.000 créditos al mes</strong> para usar la IA. Mirar ofertas, el radar y los ganchos es gratis.",
    placement: "center",
  },
  {
    target: "nav-Dashboard",
    title: "Tu recorrido",
    page: "Mi negocio en 6 etapas",
    body: "El menú es un camino: <strong>Elegir → Validar → Precio → Construir → Vender → Medir</strong>. En el Inicio siempre verás <strong>tu siguiente paso</strong> y, cada lunes, <strong>Tu semana</strong>: 3 a 5 tareas armadas para tu negocio (gratis).",
    placement: "right",
  },
  {
    target: "nav-Mi negocio",
    title: "Mi ficha",
    page: "Se llena una vez",
    body: "Cuenta qué vendes, para quién y qué logra (o toca <strong>Rellenar con IA</strong>, gratis). Todas las herramientas la usan: no tendrás que repetirlo en cada pantalla.",
    placement: "right",
  },
  {
    target: "nav-Ofertas",
    title: "Ofertas",
    page: "Las 300 ganadoras",
    body: "De más de 7.500 ofertas digitales analizadas, estas 300 llevan meses pagando anuncios (una buena señal de que venden) y son fáciles de replicar. Mirarlas es gratis. Si quieres vigilar una para ver si crece, pulsa <strong>seguir</strong> (5 créditos).",
    placement: "right",
  },
  {
    target: "nav-Mini Apps",
    title: "Mini Apps",
    page: "2 kits nuevos cada semana",
    body: "Negocios completos para copiar: la idea, las instrucciones para construir la app, los mensajes de WhatsApp, el guion del video de venta, anuncios, página de venta y precios por país. Cada uno se desbloquea con 150 créditos y queda tuyo para siempre.",
    placement: "right",
  },
  {
    target: "nav-Buscar Ofertas Winner",
    title: "Radar de anuncios",
    page: "Más de 114.000 anuncios reales",
    body: "Mira qué anuncios está pagando cada negocio y cuánto tiempo llevan activos. Explorar es gratis; la <strong>búsqueda en vivo</strong> en Meta (Facebook e Instagram) cuesta 5 créditos.",
    placement: "right",
  },
  {
    target: "nav-Generadores",
    title: "Generadores",
    page: "26 generadores de textos con IA",
    body: "Te escriben ganchos (la primera frase que hace que alguien se detenga), anuncios, páginas de venta, correos y guiones. Cada uno gasta 15, 30 o 75 créditos. Solo pagas si la IA te entrega el resultado.",
    placement: "right",
  },
  {
    target: "nav-Créditos",
    title: "Créditos",
    page: "Cómo funcionan",
    body: "Tu plan trae <strong>2.000 créditos al mes</strong>. Se recargan cada mes el mismo día en que empezaste, y los que sobran no pasan al mes siguiente. Si la IA falla, el crédito vuelve solo. Si se te acaban, hay paquetes extra desde US$10 que no caducan.",
    placement: "right",
  },
  {
    title: "¿Dudas?",
    page: "Asistente siempre activo",
    body: "Usa el <strong>botón flotante abajo a la derecha</strong> 💬. Pregúntale cualquier cosa sobre la app: es gratis.",
    placement: "center",
  },
];

const PAD = 8;     // padding around spotlight
const RADIUS = 12; // rounded corners of hole

export function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!localStorage.getItem(KEY)) {
      setTimeout(() => setOpen(true), 700);
    }
  }, []);

  const s = STEPS[step];

  // Measure target element
  useLayoutEffect(() => {
    if (!open) return;
    if (!s.target) { setRect(null); return; }

    let raf = 0;
    const measure = () => {
      // En móvil el menú vive en un cajón cerrado: el destino existe pero mide 0.
      // Sin destino visible el paso se muestra centrado, sin foco en una esquina.
      const el = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${s.target}"]`))
        .find((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      if (el) {
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
        setRect(el.getBoundingClientRect());
      } else {
        setRect(null);
      }
    };
    measure();
    const onResize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    const id = setInterval(measure, 400); // keep aligned during transitions
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      clearInterval(id);
      cancelAnimationFrame(raf);
    };
  }, [open, step, s.target]);

  if (!open) return null;

  const close = () => { localStorage.setItem(KEY, "1"); setOpen(false); };
  const next = () => step < STEPS.length - 1 ? setStep(step + 1) : close();
  const prev = () => step > 0 && setStep(step - 1);

  const isLast = step === STEPS.length - 1;
  const centered = !rect || s.placement === "center";

  // Compute tooltip position
  let tipStyle: React.CSSProperties;
  if (centered) {
    tipStyle = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  } else if (rect) {
    const tipW = Math.min(340, window.innerWidth - 32);
    const placement = s.placement ?? "right";
    if (placement === "right") {
      tipStyle = {
        top: Math.max(16, rect.top + rect.height / 2 - 80),
        left: Math.min(window.innerWidth - tipW - 16, rect.right + PAD + 16),
      };
    } else if (placement === "left") {
      tipStyle = { top: rect.top, left: Math.max(16, rect.left - tipW - 16) };
    } else {
      tipStyle = { top: rect.bottom + 16, left: Math.max(16, rect.left) };
    }
  } else {
    tipStyle = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  }

  const W = typeof window !== "undefined" ? window.innerWidth : 1920;
  const H = typeof window !== "undefined" ? window.innerHeight : 1080;

  // Build SVG mask path: full screen minus rounded rect hole
  const hole = rect ? {
    x: rect.left - PAD,
    y: rect.top - PAD,
    w: rect.width + PAD * 2,
    h: rect.height + PAD * 2,
  } : null;

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      {/* Dim + spotlight via SVG mask */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-auto"
        style={{ cursor: "default" }}
        onClick={(e) => { if (e.target === e.currentTarget) {/* swallow */} }}
      >
        <defs>
          <mask id="spotlight-mask">
            <rect x="0" y="0" width={W} height={H} fill="white" />
            {hole && (
              <rect
                x={hole.x}
                y={hole.y}
                width={hole.w}
                height={hole.h}
                rx={RADIUS}
                ry={RADIUS}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0" y="0" width={W} height={H}
          fill="rgba(0,0,0,0.72)"
          mask="url(#spotlight-mask)"
          style={{ transition: "all 200ms ease" }}
        />
        {/* glow ring around hole */}
        {hole && (
          <rect
            x={hole.x} y={hole.y} width={hole.w} height={hole.h}
            rx={RADIUS} ry={RADIUS}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="1.5"
            opacity="0.6"
            style={{ transition: "all 200ms ease" }}
          />
        )}
      </svg>

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        className="absolute w-[340px] max-w-[calc(100vw-32px)] bg-card border border-border rounded-xl shadow-2xl overflow-hidden pointer-events-auto animate-fade-in"
        style={tipStyle}
      >
        <button
          onClick={close}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-secondary"
          aria-label="Cerrar tour"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <div className="px-5 pt-5 pb-4">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" strokeWidth={1.7} />
            </div>
            <div className="leading-tight">
              <div className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground font-medium">{s.page}</div>
              <div className="font-display font-semibold text-foreground text-[15px] tracking-tight">{s.title}</div>
            </div>
          </div>
          <div
            className="text-[13px] text-muted-foreground leading-relaxed [&_strong]:text-foreground [&_strong]:font-semibold"
            dangerouslySetInnerHTML={{ __html: s.body }}
          />
        </div>

        <div className="px-5 py-3 border-t border-border bg-secondary/30 flex items-center justify-between">
          <div className="text-[11px] text-muted-foreground tabular-nums">
            {step + 1} de {STEPS.length}
          </div>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={prev}
                className="text-[12px] text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md hover:bg-secondary flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Atrás
              </button>
            )}
            <button
              onClick={next}
              className="text-[12px] font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:opacity-90 flex items-center gap-1"
            >
              {isLast ? "Empezar 🚀" : <>Siguiente <ChevronRight className="w-3.5 h-3.5" /></>}
            </button>
          </div>
        </div>

        {/* progress bar */}
        <div className="h-0.5 bg-secondary">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
