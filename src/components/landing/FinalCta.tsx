import { FadeIn } from "./FadeIn";
import { LuxButton } from "./LuxButton";

/** CTA final: limpio, directo, sin distracciones. */
export function FinalCta() {
  return (
    <section className="border-t border-[#ffffff10] px-6 py-32 text-center sm:py-40">
      <FadeIn>
        <h2 className="mx-auto max-w-3xl font-['Playfair_Display',serif] text-4xl font-medium leading-[1.15] text-[#F5F5F7] sm:text-6xl">
          Pruébalo 3 días
          <br />
          <span className="italic text-[#C5A880]">antes de pagar nada.</span>
        </h2>
        <p className="mx-auto mt-8 max-w-md font-[Inter,sans-serif] text-sm font-light leading-relaxed text-[#86868B]">
          3 días gratis con acceso a todo. Te piden la tarjeta para activar la prueba, pero no se cobra nada durante esos 3 días; si no cancelas, el cuarto día se cobra el primer mes ($29,99). Sin permanencia.
        </p>
        <div className="mt-12">
          <LuxButton to="/signup">Probar 3 días gratis</LuxButton>
        </div>
      </FadeIn>
    </section>
  );
}
