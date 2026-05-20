import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { LayoutDashboard, Trophy, Telescope, FileText, Brain, Coins, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";

const KEY = "supernova:onboarding-v1-done";

type Step = {
  icon: any;
  title: string;
  page: string;
  body: string;
};

const STEPS: Step[] = [
  {
    icon: Sparkles,
    title: "Bienvenido a SUPERNOVA",
    page: "Tu motor DR Intelligence",
    body: "En 6 pasos te enseño cómo sacarle el máximo. Tienes **1,500 créditos gratis cada mes** que se renuevan automáticamente. Empecemos.",
  },
  {
    icon: LayoutDashboard,
    title: "Dashboard",
    page: "Tu centro de mando",
    body: "Aquí ves **tus métricas reales**: créditos consumidos, proyectos activos, anuncios analizados y actividad reciente. Es tu punto de partida cada día.",
  },
  {
    icon: Trophy,
    title: "Buscar Ofertas Winner",
    page: "Encuentra anuncios ganadores",
    body: "Scraper automático que rastrea **Meta Ads Library** y detecta ofertas con mayor temperatura (escala 1-6). Filtra por nicho y mira el HeatMap de cada tarjeta. **Costo: 5 créditos** por búsqueda.",
  },
  {
    icon: Telescope,
    title: "Oráculo + Generadores",
    page: "Copy listo para usar",
    body: "**Oráculo** te da insights estratégicos y predicciones DR. **Generadores** tiene 18 templates: landing pages, ad copies, avatares, funnels, master prompts. Cada uno calcula su costo en créditos.",
  },
  {
    icon: Brain,
    title: "SUPERNOVA BRAIN (Proyectos)",
    page: "6 pilares para tu campaña",
    body: "Estructura cada campaña en **6 pilares**: Detectar → Analizar → Diseñar → Producir → Lanzar → Escalar. Cada pilar tiene un botón **\"Ayuda IA\" (15c)** que te guía paso a paso con contexto real de tu proyecto.",
  },
  {
    icon: Coins,
    title: "Créditos",
    page: "Cómo funcionan",
    body: "**1,500 gratis cada mes** (se renuevan en el aniversario de tu registro, NO acumulan). Si necesitas más: **Boost 500c/$10**, **Power 2,000c/$20**, **Nuclear 4,500c/$39**. Los comprados nunca expiran y se usan después de los gratis.",
  },
  {
    icon: Sparkles,
    title: "¿Dudas?",
    page: "Asistente siempre disponible",
    body: "Mira el botón **azul flotante abajo a la derecha** 💬. Es tu asistente IA personal: pregúntale cualquier duda sobre cómo usar la app y te responde al instante. Ya estás listo para empezar.",
  },
];

export function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!localStorage.getItem(KEY)) {
      setTimeout(() => setOpen(true), 600);
    }
  }, []);

  const close = () => {
    localStorage.setItem(KEY, "1");
    setOpen(false);
  };

  const s = STEPS[step];
  const Icon = s.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden bg-card border-border">
        <div className="px-6 pt-7 pb-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <Icon className="w-5 h-5 text-primary" strokeWidth={1.7} />
            </div>
            <div className="leading-tight">
              <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium">{s.page}</div>
              <div className="font-display font-semibold text-foreground text-[17px] tracking-tight">{s.title}</div>
            </div>
          </div>

          <div
            className="text-[13.5px] text-muted-foreground leading-relaxed [&_strong]:text-foreground [&_strong]:font-semibold"
            dangerouslySetInnerHTML={{ __html: s.body.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") }}
          />
        </div>

        <div className="px-6 py-4 border-t border-border bg-secondary/30 flex items-center justify-between">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all ${i === step ? "w-6 bg-primary" : "w-1.5 bg-muted"}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="text-[12px] text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md hover:bg-secondary flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Atrás
              </button>
            )}
            {!isLast ? (
              <button
                onClick={() => setStep(s => s + 1)}
                className="text-[12px] font-medium bg-primary text-primary-foreground px-3.5 py-1.5 rounded-md hover:opacity-90 flex items-center gap-1"
              >
                Siguiente <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={close}
                className="text-[12px] font-medium bg-primary text-primary-foreground px-3.5 py-1.5 rounded-md hover:opacity-90"
              >
                Empezar 🚀
              </button>
            )}
          </div>
        </div>

        {step === 0 && (
          <button
            onClick={close}
            className="absolute top-3 right-12 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            Saltar
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}
