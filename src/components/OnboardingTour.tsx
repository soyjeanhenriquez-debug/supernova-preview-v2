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

const STEPS: Step[] = [
  {
    title: "Bienvenido a SUPERNOVA",
    page: "Tu Motor DR Intelligence",
    body: "<strong>JARVIS</strong> es tu sistema de inteligencia artificial que trabaja 24/7 escaneando Facebook Ads Library en busca de ofertas ganadoras.<br/><br/>Tú eres el estratega. JARVIS es la máquina que nunca duerme.<br/><br/>Tienes <strong>2,000 créditos gratis cada mes</strong> para activar a JARVIS en lo que necesites.",
    placement: "center",
  },
  {
    target: "nav-Dashboard",
    title: "Dashboard",
    page: "Tu centro de mando",
    body: "Métricas reales: créditos consumidos, proyectos activos, anuncios procesados por JARVIS y actividad reciente.",
    placement: "right",
  },
  {
    target: "nav-Buscar Ofertas Winner",
    title: "Buscar Ofertas Winner",
    page: "Anuncios ganadores",
    body: "JARVIS escanea Meta Ads Library y TikTok usando <strong>47 keywords en 4 idiomas</strong>. Detecta temperatura (1-6) y te muestra solo los anuncios donde hay dinero real fluyendo.<br/><br/>Costo: <strong>10 créditos por búsqueda</strong>.",
    placement: "right",
  },
  {
    target: "nav-Oráculo",
    title: "Oráculo — Powered by JARVIS",
    page: "Inteligencia DR completa",
    body: "Pega cualquier URL y JARVIS hace todo: entra a la landing, busca los anuncios activos del anunciante en Ads Library, y genera un informe completo de inteligencia DR — ángulo, avatar, debilidades y cómo superarlo.",
    placement: "right",
  },
  {
    target: "nav-Generadores",
    title: "Generadores",
    page: "18 templates de copy",
    body: "Landing pages, ad copies, avatares, funnels y master prompts. Cada uno activa a JARVIS y descuenta créditos al ejecutarse.",
    placement: "right",
  },
  {
    target: "nav-brain",
    title: "SUPERNOVA BRAIN",
    page: "JARVIS + 6 PILARES",
    body: "Detectar → Analizar → Diseñar → Producir → Lanzar → Escalar. Cada pilar tiene <strong>Ayuda JARVIS (15c)</strong> que te guía paso a paso.",
    placement: "right",
  },
  {
    target: "nav-Créditos",
    title: "Créditos",
    page: "Energía para JARVIS",
    body: "Cada acción activa a JARVIS. <strong>2,000 créditos gratis cada mes</strong> se renuevan automáticamente. Si los agotás antes, recarga cuando quieras. Los créditos comprados nunca expiran.",
    placement: "right",
  },
  {
    title: "¿Dudas? JARVIS te responde",
    page: "Siempre activo",
    body: "El <strong>botón flotante abajo a la derecha</strong> 💬 abre el chat con JARVIS. Pregúntale cualquier cosa sobre DR marketing, cómo usar la app, o estrategias para encontrar tu primer winner. JARVIS responde al instante.",
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
      const el = document.querySelector<HTMLElement>(`[data-tour="${s.target}"]`);
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
    const tipW = 340;
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
        className="absolute w-[340px] bg-card border border-border rounded-xl shadow-2xl overflow-hidden pointer-events-auto animate-fade-in"
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
