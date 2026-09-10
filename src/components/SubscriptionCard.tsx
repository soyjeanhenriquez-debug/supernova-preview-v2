import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CreditCard, FileText, Settings2, XCircle, ChevronRight, Loader2, BadgeCheck } from "lucide-react";

// "Mi Suscripción" — gestión self-service estilo Apple.
// El usuario ya está logueado, así que jamás se le vuelve a pedir el correo:
// el edge function `stripe-portal` resuelve su customer de Stripe desde el
// JWT y devuelve una sesión del Billing Portal ya autenticada.

interface StripeInfo {
  found: boolean;
  has_subscription?: boolean;
  status?: string;
  plan?: string | null;
  amount?: number | null;   // centavos
  currency?: string | null;
  interval?: string | null;
  renews_at?: string | null;
  cancel_at_period_end?: boolean;
}

type State =
  | { kind: "loading" }
  | { kind: "stripe"; info: StripeInfo }
  | { kind: "whop"; status: string; periodEnd: string | null }
  | { kind: "none" };

const STATUS_ES: Record<string, { label: string; dot: string }> = {
  active:   { label: "Activa",            dot: "bg-success" },
  trialing: { label: "Período de prueba", dot: "bg-primary" },
  past_due: { label: "Pago pendiente",    dot: "bg-warning" },
  canceled: { label: "Cancelada",         dot: "bg-destructive" },
  completed:{ label: "Activa",            dot: "bg-success" },
};

function statusBadge(status: string, cancelAtEnd?: boolean) {
  if (cancelAtEnd) return { label: "Se cancela al final del período", dot: "bg-warning" };
  return STATUS_ES[status] ?? { label: status, dot: "bg-muted-foreground" };
}

export function SubscriptionCard() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      // 1) ¿Tiene customer en Stripe? (resuelto server-side por email del JWT)
      try {
        const { data, error } = await supabase.functions.invoke("stripe-portal", { body: { action: "info" } });
        if (!error && data?.found && data?.has_subscription) {
          if (alive) setState({ kind: "stripe", info: data as StripeInfo });
          return;
        }
      } catch { /* Stripe aún sin configurar → probar Whop */ }

      // 2) Fallback: membresía vía Whop (tabla subscriptions, RLS filas propias)
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (uid) {
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("status, current_period_end, whop_membership_id")
          .eq("user_id", uid)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (sub?.whop_membership_id) {
          if (alive) setState({ kind: "whop", status: sub.status, periodEnd: sub.current_period_end });
          return;
        }
      }
      if (alive) setState({ kind: "none" });
    })();
    return () => { alive = false; };
  }, []);

  const openPortal = useCallback(async () => {
    setOpening(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-portal", {
        body: { action: "portal", return_url: window.location.origin + "/" },
      });
      if (error || !data?.url) {
        toast.error("No se pudo abrir el portal", { description: data?.error || "Inténtalo de nuevo en un momento." });
        return;
      }
      window.location.href = data.url;
    } finally {
      setOpening(false);
    }
  }, []);

  if (state.kind === "none") return null;

  if (state.kind === "loading") {
    return (
      <div className="card-surface rounded-2xl p-6 flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando tu suscripción…
      </div>
    );
  }

  if (state.kind === "whop") {
    const badge = statusBadge(state.status);
    return (
      <div className="card-surface rounded-2xl overflow-hidden">
        <SubHeader
          title="SUPERNOVA Membresía"
          badge={badge}
          detail={state.periodEnd ? `Renueva el ${new Date(state.periodEnd).toLocaleDateString("es-ES", { day: "numeric", month: "long" })}` : null}
        />
        <MenuRow
          icon={<Settings2 className="w-4 h-4" />}
          label="Administrar suscripción"
          sub="Método de pago, facturas y cancelación en Whop"
          onClick={() => window.open("https://whop.com/orders/", "_blank", "noopener")}
        />
      </div>
    );
  }

  const { info } = state;
  const badge = statusBadge(info.status ?? "", info.cancel_at_period_end);
  const price = info.amount != null && info.currency
    ? `${(info.amount / 100).toLocaleString("es-ES", { style: "currency", currency: info.currency.toUpperCase() })}${info.interval === "year" ? "/año" : "/mes"}`
    : null;
  const renews = info.renews_at
    ? new Date(info.renews_at).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <div className="card-surface rounded-2xl overflow-hidden">
      <SubHeader
        title={info.plan || "SUPERNOVA Membresía"}
        badge={badge}
        detail={[price, renews ? (info.cancel_at_period_end ? `Acceso hasta el ${renews}` : `Renueva el ${renews}`) : null].filter(Boolean).join(" · ") || null}
      />

      {/* Menú agrupado estilo Apple: cada fila entra al portal ya autenticado */}
      <div className="divide-y divide-border/60">
        <MenuRow icon={<Settings2 className="w-4 h-4" />} label="Administrar suscripción" sub="Cambiar de plan o revisar tu membresía" onClick={openPortal} busy={opening} />
        <MenuRow icon={<CreditCard className="w-4 h-4" />} label="Método de pago" sub="Actualizar tu tarjeta" onClick={openPortal} busy={opening} />
        <MenuRow icon={<FileText className="w-4 h-4" />} label="Historial de facturas" sub="Descargar recibos" onClick={openPortal} busy={opening} />
        <MenuRow icon={<XCircle className="w-4 h-4" />} label="Cancelar suscripción" sub="Sin llamadas, sin correos — al instante" onClick={openPortal} busy={opening} danger />
      </div>

      <div className="px-5 py-3 bg-secondary/30 text-[11px] text-muted-foreground flex items-center gap-1.5">
        <BadgeCheck className="w-3.5 h-3.5 text-success shrink-0" />
        Entras directo a tu panel seguro de facturación — sin volver a pedir tu correo.
      </div>
    </div>
  );
}

function SubHeader({ title, badge, detail }: { title: string; badge: { label: string; dot: string }; detail: string | null }) {
  return (
    <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3 flex-wrap">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Mi Suscripción</div>
        <div className="font-display font-bold text-lg text-foreground">{title}</div>
        {detail && <div className="text-xs text-muted-foreground mt-1">{detail}</div>}
      </div>
      <span className="flex items-center gap-1.5 text-xs font-medium text-foreground bg-secondary/60 rounded-full px-3 py-1 mt-1">
        <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
        {badge.label}
      </span>
    </div>
  );
}

function MenuRow({ icon, label, sub, onClick, busy, danger }: {
  icon: React.ReactNode; label: string; sub: string; onClick: () => void; busy?: boolean; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-secondary/40 transition-colors disabled:opacity-60"
    >
      <span className={`shrink-0 ${danger ? "text-destructive" : "text-primary"}`}>{icon}</span>
      <span className="flex-1 min-w-0">
        <span className={`block text-sm font-medium ${danger ? "text-destructive" : "text-foreground"}`}>{label}</span>
        <span className="block text-[11px] text-muted-foreground truncate">{sub}</span>
      </span>
      {busy
        ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
        : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
    </button>
  );
}
