import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Loader2, Lock, Mail, LogOut } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { PLANS, formatUsd } from "@/lib/plans";
import { startCheckout } from "@/lib/stripe";
import { PlanFeatures, TrialTerms } from "@/components/PlanFeatures";

/**
 * Vitrina (decisión de Jean, 03-oct-2026, como LanzaYa): quien tiene cuenta pero no plan entra a la
 * app y ve todo con candado, en vez de un muro de pago. Nada se le regala: el catálogo sigue cerrado
 * por RLS (has_access), no hay IA ni créditos, y el acceso lo dan SOLO los webhooks de pago de Whop.
 * Cada candado abre la ventana de planes ligada a lo que tocó ("Para usar X, activa tu plan").
 */
type Ctx = { locked: boolean; openPlans: (tool?: string) => void };
const VitrinaContext = createContext<Ctx>({ locked: false, openPlans: () => {} });
export const useVitrina = () => useContext(VitrinaContext);

export function VitrinaProvider({ locked, children }: { locked: boolean; children: ReactNode }) {
  const [tool, setTool] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const openPlans = useCallback((t?: string) => { setTool(t ?? null); setOpen(true); }, []);
  const value = useMemo(() => ({ locked, openPlans }), [locked, openPlans]);
  return (
    <VitrinaContext.Provider value={value}>
      {children}
      {locked && <PlansDialog open={open} onOpenChange={setOpen} tool={tool} />}
    </VitrinaContext.Provider>
  );
}

function PlansDialog({ open, onOpenChange, tool }: { open: boolean; onOpenChange: (o: boolean) => void; tool: string | null }) {
  const { user, signOut } = useAuth();
  const [starting, setStarting] = useState(false);
  const activate = async () => {
    setStarting(true);
    const redirected = await startCheckout({ action: "subscribe", plan: "pro" });
    if (!redirected) setStarting(false);
  };
  const pro = PLANS.pro, com = PLANS.comunidad;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] max-h-[92dvh] overflow-y-auto p-5 sm:p-7 gap-0">
        <div className="flex items-start gap-3 mb-5">
          <span className="w-10 h-10 rounded-xl border border-primary/40 text-primary flex items-center justify-center shrink-0">
            <Lock className="w-[18px] h-[18px]" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <DialogTitle className="font-display text-[19px] leading-snug">
              {tool ? <>Para usar <span className="text-primary">{tool}</span>, activa tu plan</> : "Activa SUPERNOVA PRO"}
            </DialogTitle>
            <DialogDescription className="text-[13px] mt-1">
              Los primeros 3 días son gratis y con todo abierto. En el pago usa este mismo correo y tu acceso se activa solo.
            </DialogDescription>
          </div>
        </div>

        <button onClick={activate} disabled={starting}
          className="w-full text-left rounded-xl border border-primary bg-primary/5 hover:bg-primary/10 p-4 transition-colors disabled:opacity-60">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-display font-bold text-sm tracking-wide text-foreground">
              {pro.name}
              <span className="ml-2 rounded bg-primary/15 px-2 py-0.5 text-[10px] tracking-widest text-primary">INCLUYE {tool ? "ESTA HERRAMIENTA" : "TODO"}</span>
            </span>
            <span className="font-display font-bold text-xl text-primary shrink-0">
              {formatUsd(pro.price)}<span className="text-xs text-muted-foreground font-normal">{pro.period}</span>
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{pro.tagline}</p>
          <PlanFeatures plan="pro" />
          {starting ? (
            <p className="mt-3 text-xs text-primary flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Abriendo el pago seguro…</p>
          ) : (
            <p className="mt-3 text-xs font-semibold text-primary">Empezar mis 3 días gratis →</p>
          )}
        </button>
        <div className="mt-3"><TrialTerms /></div>

        <a href={com.checkout} target="_blank" rel="noopener noreferrer"
          className="mt-3 block w-full text-left rounded-xl border border-border bg-secondary/30 hover:bg-secondary/50 p-4 transition-colors">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-display font-bold text-sm tracking-wide text-foreground">{com.name}</span>
            <span className="font-display font-bold text-xl text-primary shrink-0">
              {formatUsd(com.price)}<span className="text-xs text-muted-foreground font-normal">{com.period}</span>
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{com.tagline}</p>
          <p className="mt-2 text-xs font-semibold text-primary">Ver la comunidad en Skool →</p>
        </a>

        <p className="mt-4 text-[11px] text-muted-foreground text-center">
          Entraste como <span className="text-foreground" data-ph-mask>{user?.email}</span>. Tu plan queda unido a este correo.
        </p>
        <div className="mt-2 flex items-center justify-center gap-4 text-[11px]">
          <a href="mailto:soyjeanhenriquez@gmail.com" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <Mail className="w-3 h-3" /> ¿Ya pagaste y no entras? Escríbenos
          </a>
          <button onClick={signOut} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <LogOut className="w-3 h-3" /> Cerrar sesión
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
