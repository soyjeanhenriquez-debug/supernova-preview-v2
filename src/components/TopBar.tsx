import { Search, Plus, Calendar, ChevronDown, RefreshCw } from "lucide-react";

interface TopBarProps {
  activePage: string;
}

export function TopBar({ activePage }: TopBarProps) {
  return (
    <header className="flex items-center justify-between px-8 py-4 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
      <div>
        <h1 className="font-display font-bold text-xl text-foreground">{activePage}</h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative hidden md:flex items-center">
          <Search className="absolute left-3 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar campañas..."
            className="bg-secondary border border-border rounded-lg pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all w-56"
          />
        </div>

        {/* Date range */}
        <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground hover:border-primary/40 transition-colors">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span className="hidden sm:inline">Últimos 7 días</span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        </button>

        {/* Refresh */}
        <button className="p-2 rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>

        {/* New Campaign CTA */}
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg gradient-brand text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity glow-primary">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nueva Campaña</span>
        </button>
      </div>
    </header>
  );
}
