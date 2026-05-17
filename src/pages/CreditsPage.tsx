import { useCredits, CREDIT_COSTS, ACTION_LABEL } from "@/hooks/useCredits";
import { Zap, Coins, Check } from "lucide-react";
import { toast } from "sonner";
import { CountUp } from "@/components/CountUp";

const PLANS = [
  { name: "FREE",   price: "$0",   credits: 50,   features: ["50 créditos / mes", "Anuncios ganadores", "Chat IA básico"] },
  { name: "PRO",    price: "$49",  credits: 300,  popular: true, features: ["300 créditos / mes", "Todos los modos SOFISTICAR", "Pain Discovery", "Soporte prioritario"] },
  { name: "AGENCY", price: "$99",  credits: 1000, features: ["1000 créditos / mes", "Acceso multiusuario", "API privada", "Soporte dedicado"] },
];

export function CreditsPage() {
  const { balance, limit, history, refill } = useCredits();
  const pct = (balance / limit) * 100;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display font-bold text-2xl text-foreground">TUS CRÉDITOS</h2>
        <p className="text-sm text-muted-foreground mt-1">Energía SUPERNOVA para tu motor DR</p>
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
              <div className="text-5xl font-display font-extrabold text-primary">{balance}</div>
              <div className="text-xs text-muted-foreground">/ {limit}</div>
            </div>
          </div>
          <div className="text-sm text-foreground mt-3">Créditos disponibles</div>
          <button onClick={() => { refill(50); toast.success("+50 créditos demo añadidos"); }} className="mt-4 text-xs text-primary hover:underline">+ Añadir 50 créditos demo</button>
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

      {/* Plans */}
      <div>
        <h3 className="font-display font-bold text-lg mb-3">Planes</h3>
        <div className="grid md:grid-cols-3 gap-4">
          {PLANS.map((p) => (
            <div key={p.name} className={`card-surface rounded-xl p-5 relative ${p.popular ? "border-primary shadow-[0_0_30px_hsl(var(--primary)/0.15)]" : ""}`}>
              {p.popular && <span className="absolute -top-2 right-4 text-[10px] bg-primary text-primary-foreground px-2 py-0.5 rounded font-bold tracking-widest">POPULAR</span>}
              <div className="font-display font-extrabold text-xl">{p.name}</div>
              <div className="text-3xl font-display font-bold text-primary mt-2">{p.price}<span className="text-xs text-muted-foreground font-normal">/mes</span></div>
              <div className="text-xs text-muted-foreground mt-1">{p.credits} créditos</div>
              <ul className="mt-4 space-y-1.5">
                {p.features.map((f) => (
                  <li key={f} className="text-sm flex items-start gap-2"><Check className="w-3.5 h-3.5 text-success mt-0.5 shrink-0" /> {f}</li>
                ))}
              </ul>
              <button className="btn-primary-nova w-full py-2 rounded-lg text-sm mt-5">Elegir</button>
            </div>
          ))}
        </div>
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
