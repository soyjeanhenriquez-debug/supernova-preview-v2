import { motion } from "framer-motion";

const FEED = [
  { initial: "S", name: "Saúde & Bem-Estar BR", note: "O segredo natural que já transformou 47.000 corpos…", score: 94, days: "52d", market: "BR" },
  { initial: "K", name: "SkinGlow Official", note: "92% of users saw visible results in 14 days…", score: 91, days: "75d", market: "US" },
  { initial: "E", name: "EnvíoShop México", note: "Última oportunidad: 50% OFF y envío gratis…", score: 83, days: "18d", market: "MX" },
  { initial: "A", name: "Academia Pro ES", note: "Aprende desde cero: 30 horas + certificado…", score: 77, days: "9d", market: "ES" },
  { initial: "F", name: "Finanzas Sin Miedo", note: "El método que usan los que nunca revisan precios…", score: 71, days: "23d", market: "LATAM" },
];

/** Tarjeta live-feed del hero: ganadores escaneándose en tiempo real. */
export function LiveFeed() {
  return (
    <div className="w-full max-w-md rounded-xl border border-[#ffffff10] bg-[#0f0f11]/80 p-5 shadow-[0_40px_120px_-40px_rgba(197,168,128,0.25)] backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <span className="font-[Inter,sans-serif] text-[10px] uppercase tracking-[0.3em] text-[#86868B]">
          Live feed · Mega winners
        </span>
        <span className="flex items-center gap-1.5 font-[Inter,sans-serif] text-[10px] uppercase tracking-[0.2em] text-[#C5A880]">
          <motion.span
            animate={{ opacity: [1, 0.25, 1] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            className="inline-block h-1.5 w-1.5 rounded-full bg-[#C5A880]"
          />
          Escaneando
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
                {f.score}
              </span>
              <span className="block font-[Inter,sans-serif] text-[10px] text-[#86868B]">{f.days}</span>
            </span>
          </motion.li>
        ))}
      </ul>

      <div className="mt-4 flex items-center justify-between border-t border-[#ffffff10] pt-3.5 font-[Inter,sans-serif] text-[10px] uppercase tracking-[0.2em] text-[#86868B]">
        <span>+600 nuevas ayer</span>
        <span>38 mega winners activos</span>
      </div>
    </div>
  );
}
