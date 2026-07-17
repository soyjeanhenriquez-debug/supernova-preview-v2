import { FadeIn } from "./FadeIn";
import { LuxButton } from "./LuxButton";

/** CTA final: limpio, directo, sin distracciones. */
export function FinalCta() {
  return (
    <section className="border-t border-[#ffffff10] px-6 py-32 text-center sm:py-40">
      <FadeIn>
        <h2 className="mx-auto max-w-3xl font-['Playfair_Display',serif] text-4xl font-medium leading-[1.15] text-[#F5F5F7] sm:text-6xl">
          Tu negocio recurrente
          <br />
          <span className="italic text-[#C5A880]">empieza esta semana.</span>
        </h2>
        <p className="mx-auto mt-8 max-w-md font-[Inter,sans-serif] text-sm font-light leading-relaxed text-[#86868B]">
          $29/mes · 7 días gratis · Cobra en tu moneda desde el día 1. Sin contrato.
        </p>
        <div className="mt-12">
          <LuxButton to="/signup">Empezar mi negocio recurrente</LuxButton>
        </div>
      </FadeIn>
    </section>
  );
}
