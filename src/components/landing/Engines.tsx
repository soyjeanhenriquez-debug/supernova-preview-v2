import { FadeIn } from "./FadeIn";

type Row = { num: string; title: string; body: string; stat: string; statLabel: string };

const MINER_ROWS: Row[] = [
  {
    num: "/01",
    title: "Palabras clave elegidas a mano",
    body: "Llevamos meses juntando las frases que usan los anuncios que llevan tiempo pagando: los problemas concretos que mencionan, cómo explican su solución y las palabras que se repiten.",
    stat: "A mano",
    statLabel: "Palabras clave",
  },
  {
    num: "/02",
    title: "Búsqueda diaria",
    body: "Cada día buscamos esas palabras en la Biblioteca de Anuncios de Meta (Facebook e Instagram), en Estados Unidos, Latinoamérica y Brasil. Hoy hay más de 140.000 anuncios reales guardados (12-oct-2026).",
    stat: "+140.000",
    statLabel: "Anuncios guardados",
  },
  {
    num: "/03",
    title: "Una IA descarta lo que no quieres",
    body: "Antes de que tú veas la oferta, un clasificador revisa la landing y decide: ¿es producto digital? Si es venta de productos físicos, multinivel o cripto, se descarta.",
    stat: "100%",
    statLabel: "Productos digitales",
  },
  {
    num: "/04",
    title: "Ordenado por señales reales",
    body: "Cada oferta que pasa el filtro se mide por cuántos días lleva pagando anuncios, cuántas versiones tiene activas y cuánto tiempo lleva viva su página. De más de 12.000 ofertas analizadas, más de 6.000 llevan más de 90 días pagando anuncios (12-oct-2026).",
    stat: "+6.000",
    statLabel: "Con más de 90 días pagando",
  },
];

const BUILDER_ROWS: Row[] = [
  {
    num: "/01",
    title: "Haz tu versión de lo que ya vende",
    body: "Tomas un negocio que ya funciona en otro país y SUPERNOVA te ayuda a adaptarlo a tu idioma, tu país y tu forma de contarlo. Misma idea, versión tuya.",
    stat: "1 clic",
    statLabel: "De ajeno a tuyo",
  },
  {
    num: "/02",
    title: "Tus piezas de anuncio, dentro de la app",
    body: "Imagen de anuncio en 32 formatos, carrusel y video con IA (5 o 10 segundos, o un anuncio en 3 tomas), hechos con tu producto.",
    stat: "32",
    statLabel: "Formatos de imagen",
  },
  {
    num: "/03",
    title: "Textos que venden",
    body: "Textos de anuncios, ganchos, página de ventas y mensajes de WhatsApp, escritos a partir de la oferta que elegiste. Y con tus números, la app te dice cuánto puedes pagar por cada venta y si apagar, esperar o subir el presupuesto. Sin diseñador, redactor ni programador.",
    stat: "ES",
    statLabel: "Español latino",
  },
  {
    num: "/04",
    title: "Cóbralo en tu moneda",
    body: "Pesos, dólares o lo que uses en tu país. Por WhatsApp con cobro manual, o con un link de pago automático — tú eliges. Tú decides el precio y la forma de cobrar según tu país.",
    stat: "COP·DOP·USD",
    statLabel: "Tu moneda, tu forma de cobrar",
  },
];

function EngineSection({
  kicker,
  title,
  intro,
  rows,
}: {
  kicker: string;
  title: React.ReactNode;
  intro?: string;
  rows: Row[];
}) {
  return (
    <section className="border-t border-[#ffffff10] px-6 py-28 sm:py-36">
      <div className="mx-auto max-w-5xl">
        <FadeIn>
          <p className="mb-6 font-[Inter,sans-serif] text-[10px] uppercase tracking-[0.35em] text-[#C5A880]">
            — {kicker}
          </p>
          <h2 className="max-w-3xl font-['Playfair_Display',serif] text-3xl font-medium leading-[1.2] text-[#F5F5F7] sm:text-5xl">
            {title}
          </h2>
          {intro && (
            <p className="mt-6 max-w-2xl font-[Inter,sans-serif] text-sm font-light leading-relaxed text-[#86868B]">
              {intro}
            </p>
          )}
        </FadeIn>

        <div className="mt-16 space-y-0">
          {rows.map((r, i) => (
            <FadeIn key={r.num} delay={i * 0.08}>
              <div className="grid gap-6 border-t border-[#ffffff10] py-10 sm:grid-cols-[64px_1fr_180px] sm:items-start">
                <span className="font-[Inter,sans-serif] text-xs tracking-[0.2em] text-[#86868B]">
                  {r.num}
                </span>
                <div>
                  <h3 className="mb-3 font-[Inter,sans-serif] text-base font-medium uppercase tracking-[0.12em] text-[#F5F5F7]">
                    {r.title}
                  </h3>
                  <p className="max-w-xl font-[Inter,sans-serif] text-sm font-light leading-relaxed text-[#86868B]">
                    {r.body}
                  </p>
                </div>
                <div className="sm:text-right">
                  <span className="block font-['Playfair_Display',serif] text-4xl text-[#C5A880]">
                    {r.stat}
                  </span>
                  <span className="mt-1 block font-[Inter,sans-serif] text-[10px] uppercase tracking-[0.25em] text-[#86868B]">
                    {r.statLabel}
                  </span>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Motor 1: el radar. */
export function MinerEngine() {
  return (
    <EngineSection
      kicker="Motor 1 · El radar"
      title={
        <>
          Esto <span className="italic text-[#86868B]">no</span> es otra herramienta espía.
          <br />
          Es tu <span className="text-[#C5A880]">radar de lo que ya se vende.</span>
        </>
      }
      rows={MINER_ROWS}
    />
  );
}

/** Motor 2: el arsenal. */
export function BuilderEngine() {
  return (
    <EngineSection
      kicker="Motor 2 · El arsenal"
      title={
        <>
          No solo la encuentras.
          <br />
          <span className="text-[#C5A880]">Te ayudamos a armar tu versión.</span>
        </>
      }
      intro="Encontrar un negocio que funciona es la mitad del trabajo. La otra mitad —adaptarlo, crear tus anuncios y publicarlos— la haces tú, con SUPERNOVA guiándote."
      rows={BUILDER_ROWS}
    />
  );
}
