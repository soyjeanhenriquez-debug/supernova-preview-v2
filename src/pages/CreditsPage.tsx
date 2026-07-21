import { useMemo } from "react";
import { useCredits, CREDIT_COSTS, ACTION_LABEL } from "@/hooks/useCredits";
import { useMediaCredits, MEDIA_COST_PER_VIDEO } from "@/hooks/useMediaCredits";
import { Zap, Coins, Sparkles, AlertTriangle, Video } from "lucide-react";
import { toast } from "sonner";
import { CountUp } from "@/components/CountUp";

const PACKS = [
  { id: "boost",   name: "PACK BOOST",   credits: 500,  price: 10, tagline: "Para seguir sin parar esta semana", save: null },
  { id: "power",   name: "PACK POWER",   credits: 2000, price: 20, tagline: "Otro mes completo de uso intensivo", save: "50%", popular: true },
  { id: "nuclear", name: "PACK NUCLEAR", credits: 4500, price: 39, tagline: "Para los que no se detienen", save: "57%" },
];

// Pool separado del de texto: el costo real de video con avatar IA (HeyGen,
// ~$1 USD/min) es órdenes de magnitud mayor al de un generador de texto.
const MEDIA_PACKS = [
  { id: "media-starter", name: "STARTER", credits: 50,  price: 12, tagline: "~5 videos para probar el hook de hoy", save: null },
  { id: "media-pro",     name: "PRO",     credits: 150, price: 29, tagline: "~15 videos — ritmo de testing semanal", save: null, popular: true },
  { id: "media-scale",   name: "SCALE",   credits: 400, price: 69, tagline: "~40 videos para escalar creativos", save: null },
];

export function CreditsPage() {
  const { balance, monthly, purchased, limit, renewalDate, history } = useCredits();
  const { balance: mediaBalance, loading: mediaLoading } = useMediaCredits();
  // Anillo: progreso del saldo mensual (los comprados se muestran aparte)
  const pct = (monthly / limit) * 100;

  const renewFormatted = renewalDate.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
  const renewDays = Math.max(0, Math.ceil((renewalDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));

  // Proyección basada en últimos 7 días
  const projection = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = history.filter((h) => new Date(h.date).getTime() > sevenDaysAgo);
    const totalSpent = recent.reduce((s, h) => s + h.cost, 0);
    const avgDaily = totalSpent / 7;
    if (avgDaily <= 0 || history.length === 0) return null;
    return { days: Math.floor(balance / avgDaily), avgDaily: Math.round(avgDaily) };
  }, [history, balance]);

  const handleRecharge = () => {
    toast.info("Recarga disponible próximamente", {
      description: "Escríbenos por WhatsApp para recargar manualmente.",
    });
  };

  const handleMediaRecharge = () => {
    toast.info("Recarga de Media Credits disponible próximamente", {
      description: "Escríbenos por WhatsApp para recargar manualmente.",
    });
  };

  const scrollToPacks = () => {
    document.getElementById("recharge-packs")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="page-heading font-display text-2xl text-foreground">TUS CRÉDITOS</h2>
        <p className="text-sm text-muted-foreground mt-3">Energía SUPERNOVA para tu motor DR</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="card-surface rounded-xl p-6 flex flex-col items-center justify-center text-center">
          <div className="relative w-44 h-44 flex items-center justify-center">
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" stroke="hsl(var(--secondary))" strokeWidth="8" fill="none" />
              <circle cx="50" cy="50" r="42" stroke="hsl(var(--primary))" strokeWidth="8" fill="none"
                strokeDasharray={`${(pct / 100) * 264} 264`} strokeLinecap="round" />
            </svg>
            <div>
              <div className="text-4xl font-display font-extrabold text-primary"><CountUp value={balance} /></div>
              <div className="text-xs text-muted-foreground">/ {limit.toLocaleString()}</div>
            </div>
          </div>
          <div className="text-sm text-foreground mt-3">Créditos disponibles</div>
          <div className="text-xs text-primary mt-1">Se renuevan en {renewDays} días ({renewFormatted})</div>
          {purchased > 0 && (
            <div className="text-[11px] text-muted-foreground mt-1">
              {monthly.toLocaleString()} mensuales + <span className="text-success font-semibold">{purchased.toLocaleString()} comprados</span>
            </div>
          )}

          {/* Proyección de consumo */}
          <ProjectionBadge projection={projection} onRecharge={scrollToPacks} />
        </div>

        <div className="card-surface rounded-xl p-6 lg:col-span-2">
          <h3 className="font-display font-bold text-base mb-3">Costo por acción</h3>
          <div className="grid sm:grid-cols-2 gap-2">
            {Object.entries(CREDIT_COSTS).map(([action, cost]) => (
              <div key={action} className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/40">
                <span className="text-sm text-foreground">{ACTION_LABEL[action as keyof typeof ACTION_LABEL]}</span>
                <span className="flex items-center gap-1 text-primary font-bold text-sm">
                  <Zap className="w-3.5 h-3.5" /> {cost}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/40">
              <span className="text-sm text-foreground">Guardar anuncio</span>
              <span className="text-success font-bold text-xs">GRATIS</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recarga */}
      <div id="recharge-packs">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="font-display font-bold text-lg">RECARGA TUS CRÉDITOS</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-5 max-w-xl">
          Tus 2,000 créditos mensuales están incluidos con tu membresía. Si los agotás antes del próximo ciclo, recarga cuando quieras.
        </p>

        <div className="grid md:grid-cols-3 gap-4">
          {PACKS.map((p) => (
            <div key={p.id} className={`card-surface rounded-xl p-6 relative flex flex-col ${p.popular ? "border-primary shadow-[0_0_30px_hsl(var(--primary)/0.15)]" : ""}`}>
              {p.popular && (
                <span className="absolute -top-2 right-4 text-[10px] bg-primary text-primary-foreground px-2 py-0.5 rounded font-bold tracking-widest">
                  ⭐ MÁS POPULAR
                </span>
              )}
              <div className="font-display font-extrabold text-lg tracking-wide">{p.name}</div>
              <div className="flex items-baseline gap-2 mt-3">
                <span className="text-3xl font-display font-bold text-primary tabular-nums">{p.credits.toLocaleString()}</span>
                <span className="text-xs text-muted-foreground">créditos</span>
              </div>
              <div className="flex items-baseline gap-2 mt-3">
                <span className="text-2xl font-display font-bold text-foreground">${p.price}</span>
                {p.save && <span className="text-[11px] text-success font-semibold">ahorra {p.save}</span>}
              </div>
              <p className="text-[13px] text-muted-foreground mt-3 leading-relaxed flex-1">"{p.tagline}"</p>
              <button onClick={handleRecharge} className="btn-primary-nova w-full py-2.5 rounded-lg text-sm mt-5">
                Recargar ${p.price} →
              </button>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-4 text-center">
          Los créditos comprados no expiran. Se suman a tu saldo actual.
        </p>
      </div>

      {/* Media Credits — pool separado, para dejar clarísimo que es otra economía */}
      <div className="border-t-2 border-dashed border-border pt-8">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
          <div className="flex items-center gap-2">
            <Video className="w-4 h-4 text-primary" />
            <h3 className="font-display font-bold text-lg">MEDIA CREDITS · VIDEO CON AVATAR IA</h3>
          </div>
          <div className="card-surface rounded-lg px-4 py-2 text-right">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Tu saldo</div>
            <div className="font-display font-bold text-lg text-primary">{mediaLoading ? "…" : mediaBalance}</div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-5 max-w-xl">
          Pool separado de tus créditos de texto — el video con avatar IA (HeyGen) cuesta mucho más de producir.
          Cada video ({MEDIA_COST_PER_VIDEO} Media Credits) es un hook de ~1 minuto, listo para subir a Meta o TikTok.
        </p>

        <div className="grid md:grid-cols-3 gap-4">
          {MEDIA_PACKS.map((p) => (
            <div key={p.id} className={`card-surface rounded-xl p-6 relative flex flex-col ${p.popular ? "border-primary shadow-[0_0_30px_hsl(var(--primary)/0.15)]" : ""}`}>
              {p.popular && (
                <span className="absolute -top-2 right-4 text-[10px] bg-primary text-primary-foreground px-2 py-0.5 rounded font-bold tracking-widest">
                  ⭐ MÁS POPULAR
                </span>
              )}
              <div className="font-display font-extrabold text-lg tracking-wide">{p.name}</div>
              <div className="flex items-baseline gap-2 mt-3">
                <span className="text-3xl font-display font-bold text-primary tabular-nums">{p.credits.toLocaleString()}</span>
                <span className="text-xs text-muted-foreground">media credits</span>
              </div>
              <div className="flex items-baseline gap-2 mt-3">
                <span className="text-2xl font-display font-bold text-foreground">${p.price}</span>
                <span className="text-[11px] text-muted-foreground">~{Math.round(p.credits / MEDIA_COST_PER_VIDEO)} videos</span>
              </div>
              <p className="text-[13px] text-muted-foreground mt-3 leading-relaxed flex-1">"{p.tagline}"</p>
              <button onClick={handleMediaRecharge} className="btn-primary-nova w-full py-2.5 rounded-lg text-sm mt-5">
                Recargar ${p.price} →
              </button>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-4 text-center">
          Los Media Credits no expiran y no se mezclan con tus créditos de texto.
        </p>
      </div>

      {/* History */}
      <div className="card-surface rounded-xl">
        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <Coins className="w-4 h-4 text-primary" />
          <h3 className="font-display font-bold text-base">Historial reciente</h3>
        </div>
        {history.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Sin actividad todavía</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground border-b border-border">
                <th className="px-5 py-2">Fecha</th>
                <th className="px-5 py-2">Acción</th>
                <th className="px-5 py-2 text-right">Créditos</th>
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 20).map((h, i) => (
                <tr key={i} className="border-b border-border/40">
                  <td className="px-5 py-2 text-muted-foreground text-xs">{new Date(h.date).toLocaleString("es-ES")}</td>
                  <td className="px-5 py-2">{h.label}{h.meta && <span className="text-muted-foreground"> · {h.meta.slice(0, 40)}</span>}</td>
                  <td className="px-5 py-2 text-right text-primary font-bold">-{h.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ProjectionBadge({ projection, onRecharge }: { projection: { days: number; avgDaily: number } | null; onRecharge: () => void }) {
  if (!projection) {
    return (
      <div className="mt-4 text-[11px] text-muted-foreground max-w-[220px]">
        Empieza a usar SUPERNOVA para ver tu proyección
      </div>
    );
  }
  const { days } = projection;
  if (days > 14) {
    return <div className="mt-4 text-[12px] text-success font-medium">✅ A tu ritmo actual te duran ~{days} días</div>;
  }
  if (days >= 7) {
    return <div className="mt-4 text-[12px] text-warning font-medium">⚡ Te quedan ~{days} días de créditos</div>;
  }
  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <div className="text-[12px] text-destructive font-bold animate-pulse flex items-center gap-1">
        <AlertTriangle className="w-3.5 h-3.5" />
        ¡Últimos {days} días de créditos!
      </div>
      <button onClick={onRecharge} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-[11px] font-bold hover:opacity-90">
        Recargar ahora →
      </button>
    </div>
  );
}
