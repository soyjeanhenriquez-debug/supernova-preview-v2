import { Users, MapPin, Smartphone, Globe } from "lucide-react";

const audiences = [
  { id: 1, name: "Compradores Frecuentes 25-45", size: "2.4M", match: "87%", platform: "Meta", tags: ["Retargeting", "Custom"] },
  { id: 2, name: "Profesionales B2B – Gerentes", size: "840K", match: "72%", platform: "LinkedIn", tags: ["Lookalike", "B2B"] },
  { id: 3, name: "Gen Z – Intereses Tecnología", size: "5.1M", match: "65%", platform: "TikTok", tags: ["Prospecting"] },
  { id: 4, name: "Abandonadores de Carrito", size: "124K", match: "94%", platform: "Meta", tags: ["Retargeting", "Hot"] },
];

export function AudiencesPage() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: <Users className="w-5 h-5" />, label: "Audiencias Totales", value: "8.46M" },
          { icon: <Smartphone className="w-5 h-5" />, label: "Dispositivos Móviles", value: "72%" },
          { icon: <Globe className="w-5 h-5" />, label: "Países Activos", value: "14" },
        ].map((s) => (
          <div key={s.label} className="card-surface rounded-xl p-5 flex items-center gap-4">
            <div className="p-3 rounded-lg gradient-brand text-primary-foreground">{s.icon}</div>
            <div>
              <div className="text-2xl font-display font-bold text-foreground">{s.value}</div>
              <div className="text-sm text-muted-foreground">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {audiences.map((a) => (
          <div key={a.id} className="card-surface rounded-xl p-5 hover:border-primary/30 transition-all group">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-medium text-foreground group-hover:text-primary transition-colors">{a.name}</div>
                <div className="text-sm text-muted-foreground mt-0.5">{a.platform}</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-display font-bold gradient-text">{a.match}</div>
                <div className="text-xs text-muted-foreground">match score</div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex gap-1.5 flex-wrap">
                {a.tags.map((t) => (
                  <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{t}</span>
                ))}
              </div>
              <div className="text-sm font-semibold text-foreground">{a.size}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Demographics chart */}
      <div className="card-surface rounded-xl p-6">
        <h3 className="font-display font-semibold text-foreground mb-5">Distribución Demográfica</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "18-24", value: 18 },
            { label: "25-34", value: 35 },
            { label: "35-44", value: 28 },
            { label: "45+", value: 19 },
          ].map((d) => (
            <div key={d.label} className="text-center">
              <div className="relative w-20 h-20 mx-auto mb-3">
                <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="hsl(222, 35%, 14%)" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15.9" fill="none"
                    stroke="hsl(210, 100%, 56%)" strokeWidth="3"
                    strokeDasharray={`${d.value} ${100 - d.value}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-foreground">{d.value}%</div>
              </div>
              <div className="text-sm font-medium text-foreground">{d.label}</div>
              <div className="text-xs text-muted-foreground">años</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
