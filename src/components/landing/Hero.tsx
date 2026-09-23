import { motion } from "framer-motion";
import { LuxButton } from "./LuxButton";
import { LiveFeed } from "./LiveFeed";

const ease = [0.21, 0.47, 0.32, 0.98] as const;

/** Hero dos columnas: título masivo Serif + live feed de ganadores. */
export function Hero() {
  return (
    <section className="relative px-6 pb-24 pt-36 sm:pt-44">
      {/* Halo cinematográfico sutil */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/4 top-1/3 h-[480px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#C5A880] opacity-[0.05] blur-[140px]"
      />

      {/* grid-cols-1 = minmax(0,1fr): sin él la columna implícita es "auto" y crece
          hasta el texto sin cortes del live feed (415px), sacando el titular y el
          botón de la pantalla en un teléfono. */}
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="text-center lg:text-left">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, ease }}
            className="mb-8 font-[Inter,sans-serif] text-[11px] uppercase tracking-[0.4em] text-[#86868B]"
          >
            · 7.517 ofertas analizadas · 300 ganadoras · En español ·
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.15, ease }}
            className="font-['Playfair_Display',serif] text-5xl font-medium leading-[1.06] tracking-tight text-[#F5F5F7] sm:text-6xl xl:text-7xl"
          >
            Descubre qué vender,
            <br />
            valídalo con datos
            <br />
            <span className="italic text-[#C5A880]">y crea tus anuncios paso a paso.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.35, ease }}
            className="mx-auto mt-8 max-w-xl font-[Inter,sans-serif] text-base font-light leading-relaxed text-[#86868B] lg:mx-0"
          >
            Analizamos 7.517 ofertas digitales y marcamos 300 como ganadoras
            porque llevan meses pagando anuncios. Desde ahí, SUPERNOVA te lleva
            hasta tu propia versión: la nota de venta de cada oferta, cómo
            hacerla tuya, 72 anuncios posibles por oferta y qué hacer con tus
            números.{" "}
            <span className="text-[#F5F5F7]">
              En español y paso a paso, aunque nunca hayas vendido nada por internet.
            </span>
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.55, ease }}
            className="mt-12 flex flex-col items-center gap-4 sm:flex-row lg:justify-start"
          >
            <LuxButton to="/signup">Probar 3 días gratis</LuxButton>
            <LuxButton to="#como-funciona" variant="ghost">
              Ver cómo funciona
            </LuxButton>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.75, ease }}
            className="mt-6 font-[Inter,sans-serif] text-[11px] uppercase tracking-[0.2em] text-[#86868B]"
          >
            3 días gratis con acceso a todo · Luego $29,99/mes · Si cancelas antes, pagas $0
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.45, ease }}
          className="mx-auto w-full min-w-0 max-w-md lg:mx-0"
        >
          <LiveFeed />
        </motion.div>
      </div>
    </section>
  );
}
