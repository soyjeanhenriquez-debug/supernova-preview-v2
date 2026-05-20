import { Zap } from "lucide-react";

interface Props {
  onClick: () => void;
}

/**
 * Botón flotante naranja: atajo a "Buscar Ofertas Winner".
 * Vive 80px encima del botón azul de ayuda (z-49 < z-50 del help).
 */
export function FloatingWinnerButton({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      aria-label="Buscar Winner Ahora"
      title="Buscar Winner Ahora"
      className="group fixed bottom-[104px] right-6 z-[49] w-[52px] h-[52px] rounded-full bg-[#f7a93d] text-white flex items-center justify-center transition-transform hover:scale-110"
      style={{
        boxShadow: "0 0 20px rgba(249,115,22,0.5), 0 8px 24px rgba(0,0,0,0.25)",
        animation: "winnerPulse 4s ease-in-out infinite",
      }}
    >
      <Zap className="w-6 h-6" strokeWidth={2.4} fill="currentColor" />
      <style>{`
        @keyframes winnerPulse {
          0%, 100% { box-shadow: 0 0 20px rgba(249,115,22,0.5), 0 8px 24px rgba(0,0,0,0.25); }
          50% { box-shadow: 0 0 32px rgba(249,115,22,0.85), 0 8px 28px rgba(0,0,0,0.3); }
        }
      `}</style>
      <span className="pointer-events-none absolute right-[64px] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-foreground text-background text-[11px] font-semibold px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        Buscar Winner Ahora
      </span>
    </button>
  );
}
