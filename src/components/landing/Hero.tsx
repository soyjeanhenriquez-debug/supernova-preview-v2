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
            · Anuncios reales de Meta · Más de 90 días pagando · Tu versión en español ·
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.15, ease }}
            className="font-['Playfair_Display',serif] text-5xl font-medium leading-[1.06] tracking-tight text-[#F5F5F7] sm:text-6xl xl:text-7xl"
          >
            Elige un negocio digital
            <br />
            que lleva más de 90 días pagando anuncios.
            <br />
            <span className="italic text-[#C5A880]">Haz tu versión en español.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.35, ease }}
            className="mx-auto mt-8 max-w-xl font-[Inter,sans-serif] text-base font-light leading-relaxed text-[#86868B] lg:mx-0"
          >
            Nadie paga anuncios tres meses por algo que no vende. SUPERNOVA te
            muestra esos negocios con datos reales de la Biblioteca de Anuncios de
            Meta y te lleva hasta tu versión: la oferta, el precio en tu moneda,
            tus primeros anuncios y qué hacer con tus números.{" "}
            <span className="text-[#F5F5F7]">
              Paso a paso y en español, aunque empieces de cero.
            </span>
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.55, ease }}
            className="mt-12 flex flex-col items-center gap-4 sm:flex-row lg:justify-start"
          >
            <LuxButton to="/signup">Ver qué ya se vende · 3 días gratis</LuxButton>
            <LuxButton to="#como-funciona" variant="ghost">
              Cómo funciona
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
