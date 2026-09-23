import { FadeIn } from "./FadeIn";

/** El insight: por qué modelar le gana a inventar. */
export function Insight() {
  return (
    <section className="border-t border-[#ffffff10] px-6 py-28 sm:py-36">
      <div className="mx-auto max-w-4xl">
        <FadeIn>
          <p className="mb-6 font-[Inter,sans-serif] text-[10px] uppercase tracking-[0.35em] text-[#C5A880]">
            — Por qué funciona
          </p>
          <h2 className="font-['Playfair_Display',serif] text-3xl font-medium leading-[1.2] text-[#F5F5F7] sm:text-5xl">
            Otros ya pagaron{" "}
            <span className="text-[#C5A880]">las pruebas.</span>
            <br />
            Tú partes{" "}
            <span className="italic text-[#86868B]">de lo que funcionó.</span>
          </h2>
        </FadeIn>

        <FadeIn delay={0.15}>
          <div className="mt-14 grid gap-10 font-[Inter,sans-serif] text-sm font-light leading-relaxed text-[#86868B] sm:grid-cols-2">
            <p>
              Empezar un negocio digital desde cero significa{" "}
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
                lleva meses pagando anuncios
                </span>{" "}
                en Estados Unidos, Brasil, España y Latinoamérica: 300 ofertas
                ganadoras de 7.517 analizadas. Tú haces tu versión, la adaptas
                a tu país y la cobras en tu moneda.
              </p>
              <p className="mt-6 text-[#C5A880]">
                Si empiezas de cero, te guía paso a paso. Si ya lanzaste
                campañas y no te salen, te muestra qué hacen los anuncios que
                sí llevan meses funcionando.
              </p>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
