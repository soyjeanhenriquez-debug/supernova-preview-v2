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
            Encontrar la oferta es{" "}
            <span className="text-[#C5A880]">el 80%.</span>
            <br />
            El otro 20% te comía{" "}
            <span className="italic text-[#86868B]">semanas.</span>
          </h2>
        </FadeIn>

        <FadeIn delay={0.15}>
          <div className="mt-14 grid gap-10 font-[Inter,sans-serif] text-sm font-light leading-relaxed text-[#86868B] sm:grid-cols-2">
            <p>
              Modelar una oferta que{" "}
              <span className="font-normal text-[#F5F5F7]">
                ya está vendiendo
              </span>{" "}
              le gana a inventar la tuya el 100% de las veces. Pregúntale a
              cualquiera que ya factura: nadie inventa, todos modelan.
            </p>
            <div>
              <p>
                Pero encontrarla te tomaba{" "}
                <span className="font-normal text-[#F5F5F7]">
                  un sábado entero
                </span>{" "}
                scrolleando Meta Ad Library, esquivando dropshipping, MLM y
                cripto. Y aun encontrándola, faltaba lo caro: descifrar el
                ángulo, el gancho y el embudo detrás.
              </p>
              <p className="mt-6 text-[#C5A880]">
                SUPERNOVA cierra las dos puntas: JARVIS encuentra la ganadora y
                sus generadores te arman el copy, el avatar y el funnel la
                misma tarde.
              </p>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
