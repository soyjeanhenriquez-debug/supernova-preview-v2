import { motion } from "framer-motion";

// Muestra REAL del Radar (landing_teasers del 12-oct-2026, Biblioteca de Anuncios de Meta).
// Nada inventado: nombre del anunciante, nicho, anuncios activos y días pagando tal cual.
const FEED = [
  { initial: "I", name: "iPhone Photo Academy", note: "Educación · 9 anuncios activos", days: 149, market: "CO" },
  { initial: "G", name: "Galo Lara", note: "Dinero y negocios · 17 anuncios activos", days: 110, market: "AR" },
  { initial: "A", name: "Ashley Malik Health & Wellness", note: "Salud · 17 anuncios activos", days: 96, market: "US" },
  { initial: "R", name: "Reconectando Con Tu Propósito", note: "Marketing · 10 anuncios activos", days: 95, market: "US" },
  { initial: "P", name: "Programa de Entrenamiento Ajedrez", note: "Educación · 17 anuncios activos", days: 92, market: "CO" },
];

/** Tarjeta del hero: muestra real de ofertas que llevan más de 90 días pagando anuncios. */
export function LiveFeed() {
  return (
    <div className="w-full max-w-md rounded-xl border border-[#ffffff10] bg-[#0f0f11]/80 p-5 shadow-[0_40px_120px_-40px_rgba(197,168,128,0.25)] backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <span className="font-[Inter,sans-serif] text-[10px] uppercase tracking-[0.3em] text-[#86868B]">
          Muestra real · 12-oct-2026
        </span>
        <span className="flex items-center gap-1.5 font-[Inter,sans-serif] text-[10px] uppercase tracking-[0.2em] text-[#C5A880]">
          <motion.span
            animate={{ opacity: [1, 0.25, 1] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            className="inline-block h-1.5 w-1.5 rounded-full bg-[#C5A880]"
          />
          Hoy
        </span>
      </div>

      <ul className="space-y-2.5">
        {FEED.map((f, i) => (
          <motion.li
            key={f.name}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 + i * 0.12, duration: 0.6 }}
            className="flex items-center gap-3 rounded-lg border border-[#ffffff10] bg-[#141416] px-3.5 py-3 transition-colors duration-500 hover:border-[#C5A880]/30"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#ffffff10] bg-[#0B0B0C] font-['Playfair_Display',serif] text-sm text-[#C5A880]">
              {f.initial}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-[Inter,sans-serif] text-xs font-medium text-[#F5F5F7]">
                {f.name}
                <span className="ml-2 text-[10px] uppercase tracking-wider text-[#86868B]">{f.market}</span>
              </span>
              <span className="block truncate font-[Inter,sans-serif] text-[11px] font-light text-[#86868B]">
                {f.note}
              </span>
            </span>
            <span className="text-right">
              <span className="block font-['Playfair_Display',serif] text-lg leading-none text-[#C5A880]">
                {f.days}
              </span>
              <span className="block font-[Inter,sans-serif] text-[10px] text-[#86868B]">días</span>
            </span>
          </motion.li>
        ))}
      </ul>

      <div className="mt-4 flex items-center justify-between border-t border-[#ffffff10] pt-3.5 font-[Inter,sans-serif] text-[10px] uppercase tracking-[0.2em] text-[#86868B]">
        <span>+6.000 con más de 90 días</span>
        <span>Datos de Meta</span>
      </div>
    </div>
  );
}
