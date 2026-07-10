import { FadeIn } from "./FadeIn";
import { LuxButton } from "./LuxButton";

/** CTA final: limpio, directo, sin distracciones. */
export function FinalCta() {
  return (
    <section className="border-t border-[#ffffff10] px-6 py-32 text-center sm:py-40">
      <FadeIn>
        <h2 className="mx-auto max-w-3xl font-['Playfair_Display',serif] text-4xl font-medium leading-[1.15] text-[#F5F5F7] sm:text-6xl">
          Deja de buscar.
          <br />
          <span className="italic text-[#C5A880]">Empieza a copiar.</span>
        </h2>
        <p className="mx-auto mt-8 max-w-md font-[Inter,sans-serif] text-sm font-light leading-relaxed text-[#86868B]">
          $29/mes · 7 días gratis · Cancelas cuando quieras. Sin contrato.
        </p>
        <div className="mt-12">
          <LuxButton to="/signup">Empezar ahora — 7 días gratis</LuxButton>
        </div>
      </FadeIn>
    </section>
  );
}
