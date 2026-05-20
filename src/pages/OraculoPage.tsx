import { Telescope } from "lucide-react";
import { IntelligenceAnalyzer } from "@/components/IntelligenceAnalyzer";

export function OraculoPage() {
  return (
    <div className="space-y-6">
      <header className="card-surface rounded-xl p-6 flex items-start gap-4">
        <div className="w-11 h-11 rounded-xl border border-border bg-secondary/40 flex items-center justify-center flex-shrink-0">
          <Telescope className="w-5 h-5 text-primary" strokeWidth={1.6} />
        </div>
        <div className="min-w-0">
          <h1 className="font-display font-semibold text-[20px] tracking-tight text-foreground">
            Oráculo de Inteligencia
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
            Pega cualquier URL y descifra la oferta completa: anuncios activos, ángulo, avatar, debilidades y blueprint.
          </p>
        </div>
      </header>

      <IntelligenceAnalyzer />
    </div>
  );
}
