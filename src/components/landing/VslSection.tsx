import { Play } from "lucide-react";
import { FadeIn } from "./FadeIn";

/**
 * Contenedor VSL: esquinas sutiles, borde champagne tenue y
 * sombra difusa cinematográfica. Placeholder hasta tener el video
 * (reemplazar el div interno por un <iframe> o <video>).
 */
export function VslSection() {
  return (
    <section className="px-6 py-28 sm:py-36">
      <FadeIn>
        <h2 className="mx-auto mb-4 max-w-2xl text-center font-['Playfair_Display',serif] text-3xl font-medium text-[#F5F5F7] sm:text-5xl">
          Mira cómo funciona
        </h2>
        <p className="mx-auto mb-14 max-w-md text-center font-[Inter,sans-serif] text-sm font-light leading-relaxed text-[#86868B]">
          Tres minutos. De la búsqueda al anuncio ganador copiado.
        </p>
      </FadeIn>
      <FadeIn delay={0.15}>
        <div className="mx-auto max-w-4xl">
          <div className="relative aspect-video overflow-hidden rounded-xl border border-[#C5A880]/20 bg-[#0B0B0C] shadow-[0_40px_120px_-30px_rgba(197,168,128,0.18),0_20px_60px_-20px_rgba(0,0,0,0.9)]">
            {/* Placeholder del VSL */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
              <button
                type="button"
                aria-label="Reproducir video"
                className="group flex h-20 w-20 items-center justify-center rounded-full border border-[#ffffff15] bg-[#ffffff08] backdrop-blur transition-all duration-500 hover:border-[#C5A880]/60 hover:shadow-[0_0_40px_-8px_#C5A88055]"
              >
                <Play className="ml-1 h-7 w-7 text-[#F5F5F7] transition-colors duration-500 group-hover:text-[#C5A880]" />
              </button>
              <span className="font-[Inter,sans-serif] text-[11px] uppercase tracking-[0.3em] text-[#86868B]">
                Ver demostración
              </span>
            </div>
            {/* Viñeta cinematográfica */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.55)_100%)]"
            />
          </div>
        </div>
      </FadeIn>
    </section>
  );
}
