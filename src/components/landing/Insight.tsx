import { FadeIn } from "./FadeIn";

/** El insight: por qué modelar le gana a inventar. */
export function Insight() {
  return (
    <section className="border-t border-[#ffffff10] px-6 py-28 sm:py-36">
      <div className="mx-auto max-w-4xl">
        <FadeIn>
          <p className="mb-6 font-[Inter,sans-serif] text-[10px] uppercase tracking-[0.35em] text-[#C5A880]">
            — El insight
          </p>
          <h2 className="font-['Playfair_Display',serif] text-3xl font-medium leading-[1.2] text-[#F5F5F7] sm:text-5xl">
            Otros ya gastaron miles{" "}
            <span className="text-[#C5A880]">probando.</span>
            <br />
            Tú solo copias{" "}
            <span className="italic text-[#86868B]">lo que funcionó.</span>
          </h2>
        </FadeIn>

        <FadeIn delay={0.15}>
          <div className="mt-14 grid gap-10 font-[Inter,sans-serif] text-sm font-light leading-relaxed text-[#86868B] sm:grid-cols-2">
            <p>
              Montar un negocio recurrente desde cero significa{" "}
              <span className="font-normal text-[#F5F5F7]">
                probar precios y ángulos a ciegas
              </span>{" "}
              — semanas y cientos de dólares en anuncios antes de saber si
              algo va a funcionar.
            </p>
            <div>
              <p>
                SUPERNOVA te muestra qué{" "}
                <span className="font-normal text-[#F5F5F7]">
                  ya está facturando
                </span>{" "}
                en mercados grandes — USA, Brasil, España — validado con miles
                de dólares en anuncios reales de otros. Tú lo copias, lo
                adaptas a tu país y lo cobras en tu moneda.
              </p>
              <p className="mt-6 text-[#C5A880]">
                SUPERNOVA cierra las dos puntas: encuentra el negocio que ya
                funciona y te da todo para cobrarlo en tu mercado, esta
                semana.
              </p>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
