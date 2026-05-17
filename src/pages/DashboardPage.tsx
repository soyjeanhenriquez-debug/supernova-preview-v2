import { useMemo } from "react";
import { Trophy, Sparkles, Brain, Coins, ArrowRight } from "lucide-react";
import { useCredits } from "@/hooks/useCredits";
import { useProjects, PILLARS } from "@/hooks/useProjects";

interface Props { onNavigate: (p: string) => void; }

export function DashboardPage({ onNavigate }: Props) {
  const { balance, limit, history } = useCredits();
  const { projects } = useProjects();

  const todayKey = new Date().toISOString().slice(0, 10);
  const stats = useMemo(() => {
    const today = history.filter((h) => h.date.slice(0, 10) === todayKey);
    const analyzed = today.filter((h) => h.action === "analyze_url" || h.action === "sofisticar" || h.action === "blueprint").length;
    const searches = today.filter((h) => h.action === "search_ads").length;
    return { analyzed, searches };
  }, [history, todayKey]);

  const recent = projects.slice(0, 3);
  const low = balance < 10;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display font-bold text-2xl text-foreground">INTELLIGENCE HUB <span className="text-primary">——</span></h2>
        <p className="text-sm text-muted-foreground mt-1">Tu motor de descubrimiento de ofertas ganadoras</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Anuncios analizados hoy" value={stats.analyzed} icon={<Trophy className="w-4 h-4" />} />
        <StatCard label="Búsquedas realizadas" value={stats.searches} icon={<Sparkles className="w-4 h-4" />} />
        <StatCard label="Proyectos en BRAIN" value={projects.length} icon={<Brain className="w-4 h-4" />} />
        <StatCard label="Créditos restantes" value={balance} icon={<Coins className="w-4 h-4" />} highlight={low ? "destructive" : "primary"} />
      </div>

      {/* Quick actions */}
      <div className="grid md:grid-cols-2 gap-4">
        <ActionCard
          title="🏆 Buscar Anuncios Ganadores"
          subtitle="Encuentra lo que está escalando ahora mismo"
          onClick={() => onNavigate("Anuncios Ganadores")}
        />
        <ActionCard
          title="⚡ Iniciar SOFISTICAR"
          subtitle="Convierte una oferta ganadora en tu producto"
          onClick={() => onNavigate("Anuncios Ganadores")}
        />
      </div>

      {/* Recent projects */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-bold text-base flex items-center gap-2"><Brain className="w-4 h-4 text-primary" /> Proyectos recientes</h3>
          <button onClick={() => onNavigate("Proyectos")} className="text-xs text-primary hover:underline flex items-center gap-1">Ver todos <ArrowRight className="w-3 h-3" /></button>
        </div>
        {recent.length === 0 ? (
          <div className="card-surface rounded-xl py-10 text-center text-sm text-muted-foreground">Sin proyectos. Crea uno desde Anuncios Ganadores.</div>
        ) : (
          <div className="grid md:grid-cols-3 gap-3">
            {recent.map((p) => {
              const pct = (p.completedPillars.length / 6) * 100;
              return (
                <div key={p.id} className="card-surface rounded-xl p-4">
                  <div className="text-[10px] uppercase tracking-widest text-primary font-bold">{p.mode === "sofisticar" ? "⚡ Sofisticar" : p.mode === "crear" ? "✦ Crear" : "🎯 Blueprint"}</div>
                  <div className="font-display font-bold text-sm mt-1 truncate">{p.name}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">Pilar {p.pillar}: {PILLARS[p.pillar - 1]?.name}</div>
                  <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden mt-2">
                    <div className="h-full btn-primary-nova" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Credits bar */}
      <div className="card-surface rounded-xl p-5">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="font-display font-bold">Créditos del mes</div>
            <div className="text-xs text-muted-foreground">Se renuevan el {new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleDateString("es-ES")}</div>
          </div>
          <button onClick={() => onNavigate("Créditos")} className="btn-primary-nova px-4 py-2 rounded-lg text-sm">Conseguir más</button>
        </div>
        <div className="w-full h-2.5 bg-secondary rounded-full overflow-hidden">
          <div className="h-full btn-primary-nova" style={{ width: `${(balance / limit) * 100}%` }} />
        </div>
        <div className="text-xs text-muted-foreground mt-2">{balance} de {limit} disponibles</div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, highlight }: { label: string; value: number; icon: React.ReactNode; highlight?: "primary" | "destructive" }) {
  const color = highlight === "destructive" ? "text-destructive" : "text-primary";
  return (
    <div className="card-surface rounded-xl p-5">
      <div className={`flex items-center gap-2 ${color}`}>{icon}<span className="text-xs uppercase tracking-wider font-bold">{label}</span></div>
      <div className={`text-3xl font-display font-extrabold mt-2 ${highlight === "destructive" ? "text-destructive" : "text-foreground"}`}>{value}</div>
    </div>
  );
}

function ActionCard({ title, subtitle, onClick }: { title: string; subtitle: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="card-surface rounded-xl p-6 text-left hover:border-primary/40 hover:shadow-[0_0_30px_hsl(var(--primary)/0.15)] transition-all group">
      <div className="font-display font-bold text-lg text-foreground">{title}</div>
      <div className="text-sm text-muted-foreground mt-1">{subtitle}</div>
      <div className="text-xs text-primary mt-3 flex items-center gap-1 group-hover:gap-2 transition-all">Empezar <ArrowRight className="w-3 h-3" /></div>
    </button>
  );
}
