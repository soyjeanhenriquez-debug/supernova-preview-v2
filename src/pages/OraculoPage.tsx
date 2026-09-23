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
            Oráculo: analiza la página de ventas de otro negocio
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
            Pega el enlace de una página que vende algo (la de un competidor o una oferta que viste en un anuncio) y recibes un informe
            de 9 partes: qué vende, a quién, por qué le funciona, sus puntos débiles, sus anuncios activos, un plan de 30 días para hacerlo
            mejor y un gancho listo para tu primer anuncio.
          </p>
          <p className="text-[12px] text-muted-foreground mt-1.5 leading-relaxed">
            Úsalo antes de crear tu oferta, para no empezar a ciegas. Tarda unos 25 segundos.
          </p>
        </div>
      </header>

      <IntelligenceAnalyzer />
    </div>
  );
}
