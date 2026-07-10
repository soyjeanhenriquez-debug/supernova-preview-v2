import { FadeIn } from "./FadeIn";

const MARKETS = ["Meta Ads", "LATAM", "USA", "Brasil", "Productos Digitales"];

/**
 * Social proof en escala de grises que se funde con el fondo.
 * (Sin logos de terceros: usamos los mercados que cubre la plataforma.)
 */
export function SocialProof() {
  return (
    <section className="border-y border-[#ffffff10] py-14">
      <FadeIn>
        <p className="mb-8 text-center font-[Inter,sans-serif] text-[10px] uppercase tracking-[0.35em] text-[#86868B]/70">
          Escaneando el mercado, todos los días
        </p>
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-12 gap-y-5 px-6 grayscale">
          {MARKETS.map((m) => (
            <span
              key={m}
              className="font-[Inter,sans-serif] text-sm font-light uppercase tracking-[0.25em] text-[#F5F5F7]/25 transition-colors duration-500 hover:text-[#F5F5F7]/60"
            >
              {m}
            </span>
          ))}
        </div>
      </FadeIn>
    </section>
  );
}
