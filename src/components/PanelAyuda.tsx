import { PlayCircle, Send, Sparkles } from "lucide-react";
import { useCredits } from "@/hooks/useCredits";
import { useFeatureAccess } from "@/lib/features";
import { useTrialState } from "@/hooks/useTrialState";
import { useVitrina } from "@/contexts/VitrinaContext";
import { ASK_ASSISTANT_EVENT } from "@/components/HelpAssistant";
import { OPEN_TOUR_EVENT } from "@/components/OnboardingTour";
import { fmtNumber } from "@/lib/gemelo";
import { track } from "@/lib/analytics";

/**
 * Panel de ayuda siempre a la vista (06-nov-2026, pedido de Jean): antes vivía solo en el Inicio. Ahora va a la
 * derecha en todas las pantallas grandes para que la persona sepa que tiene ayuda: sus créditos, «Pregúntale a la
 * IA» y «Ver cómo funciona». Los créditos se ven como el círculo que decidimos el 06-oct (CreditRing): un anillo
 * ámbar que se vacía con el uso del mes; el detalle está en «Ver mis créditos». En el teléfono siguen el anillo de
 * arriba y el botón flotante del asistente.
 */
export const ASK_SUGGESTIONS = [
  "Empiezo de cero: ¿qué herramienta uso primero?",
  "¿Cómo hago mi primer anuncio para Meta?",
  "¿Qué negocio digital me conviene vender por WhatsApp?",
];

const R = 30, C = 2 * Math.PI * R;

function Anillo({ left, low, centro }: { left: number; low: boolean; centro: string }) {
  return (
    <div className="relative w-[76px] h-[76px] shrink-0" aria-hidden>
      <svg width="76" height="76" viewBox="0 0 76 76" className="-rotate-90">
        <circle cx="38" cy="38" r={R} fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
        <circle cx="38" cy="38" r={R} fill="none" strokeWidth="6" strokeLinecap="round"
          stroke={low ? "hsl(var(--destructive))" : "hsl(var(--primary))"}
          strokeDasharray={C} strokeDashoffset={C * (1 - Math.max(0, Math.min(1, left)))}
          style={{ transition: "stroke-dashoffset 700ms ease, stroke 300ms" }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display font-bold text-[15px] text-foreground tabular-nums">{centro}</span>
    </div>
  );
}

function Creditos({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { balance, monthly, purchased, limit, renewalDate } = useCredits();
  const { isAdmin } = useFeatureAccess();
  const trial = useTrialState();
  const free = !isAdmin && trial.kind === "free";
  // Igual que la ruedita de arriba: sigue a los del mes; si se acabaron y quedan comprados, muestra esos.
  const shown = monthly > 0 || purchased === 0 ? monthly : balance;
  const left = isAdmin ? 1 : free ? trial.leftPct / 100 : limit > 0 ? shown / limit : 0;
  const pct = Math.round(Math.max(0, Math.min(1, left)) * 100);
  const low = !isAdmin && (free ? pct <= 20 : balance < 100);
  const renew = renewalDate.toLocaleDateString("es", { day: "numeric", month: "long" });
  const linea = isAdmin ? "Créditos ilimitados (admin)."
    : free ? `Tu prueba gratis: prueba cada herramienta hasta ${trial.perTool} veces.`
    : purchased > 0 && monthly <= 0 ? "créditos disponibles (comprados, no caducan)."
    : `créditos disponibles. Los del mes se renuevan el ${renew}.`;
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-5">
      <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-foreground">Tus créditos</p>
      <div className="mt-3 flex items-center gap-4">
        {/* Dato seco (06-nov-2026, Jean): el saldo en número, sin «te rinde para…». En la prueba gratis, el % que queda. */}
        <Anillo left={left} low={low} centro={isAdmin ? "∞" : free ? `${pct} %` : fmtNumber(balance)} />
        <p className="text-[12.5px] text-muted-foreground leading-snug">
          {linea}
        </p>
      </div>
      <p className="mt-3 text-[11.5px] text-muted-foreground leading-snug">Mirar ofertas, el radar y los ganchos no gasta créditos.</p>
      <button onClick={() => onNavigate("Créditos")}
        className={`mt-4 w-full h-10 rounded-xl text-[13px] font-semibold ${low ? "bg-primary text-primary-foreground" : "border border-border text-foreground hover:border-foreground/30"}`}>
        {free ? "Activar PRO" : low ? "Recargar créditos" : "Ver mis créditos"}
      </button>
    </div>
  );
}

export function PanelAyuda({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { locked } = useVitrina();
  const ask = (text: string) => {
    track("home_ask_assistant", { text });
    window.dispatchEvent(new CustomEvent(ASK_ASSISTANT_EVENT, { detail: { text } }));
  };
  return (
    <div className="flex flex-col gap-4">
      {!locked && <Creditos onNavigate={onNavigate} />}
      <div className="rounded-2xl border border-border bg-card/40 p-5">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-xl border border-border flex items-center justify-center text-primary"><Sparkles className="w-4 h-4" strokeWidth={1.8} /></span>
          <span className="min-w-0">
            <span className="block font-display font-semibold text-[14px] text-foreground">Pregúntale a la IA</span>
            <span className="block text-[11px] text-muted-foreground">Te dice qué herramienta usar. Gratis.</span>
          </span>
        </div>
        <div className="mt-4 space-y-2">
          {ASK_SUGGESTIONS.map(s => (
            <button key={s} onClick={() => ask(s)} className="w-full text-left rounded-xl border border-border px-3 py-2.5 text-[12.5px] text-foreground/90 hover:border-foreground/30 hover:text-foreground leading-snug">
              {s}
            </button>
          ))}
        </div>
        <button onClick={() => ask("")} className="mt-3 w-full h-10 rounded-xl bg-secondary text-[13px] text-muted-foreground hover:text-foreground inline-flex items-center justify-between px-3">
          Escribe tu pregunta… <Send className="w-4 h-4" strokeWidth={1.8} />
        </button>
      </div>
      <button onClick={() => window.dispatchEvent(new Event(OPEN_TOUR_EVENT))} className="rounded-2xl border border-border bg-card/40 p-4 text-left hover:border-foreground/30 flex items-center gap-3">
        <PlayCircle className="w-5 h-5 text-muted-foreground shrink-0" strokeWidth={1.7} />
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold text-foreground">Ver cómo funciona</span>
          <span className="block text-[11.5px] text-muted-foreground">Un recorrido de 1 minuto por la app.</span>
        </span>
      </button>
    </div>
  );
}
