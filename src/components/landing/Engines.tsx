import { FadeIn } from "./FadeIn";

type Row = { num: string; title: string; body: string; stat: string; statLabel: string };

const MINER_ROWS: Row[] = [
  {
    num: "/01",
    title: "Palabras clave elegidas a mano",
    body: "Llevamos meses juntando las frases que usan los anuncios que llevan tiempo pagando: los problemas concretos que mencionan, cómo explican su solución y las palabras que se repiten.",
    stat: "458",
    statLabel: "Palabras clave",
  },
  {
    num: "/02",
    title: "Búsqueda diaria",
    body: "Cada día buscamos esas palabras en la Biblioteca de Anuncios de Meta (Facebook e Instagram), en Estados Unidos, Latinoamérica y Brasil. Hoy hay 114.000 anuncios reales guardados, 43.500 nuevos en los últimos 30 días.",
    stat: "114.000",
    statLabel: "Anuncios en el Radar",
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
    body: "Cada oferta que pasa el filtro se mide por cuántos días lleva pagando anuncios, cuántas versiones tiene activas y cuánto tiempo lleva viva su página. De 7.517 ofertas analizadas, 300 están marcadas como ganadoras.",
    stat: "300",
    statLabel: "Ofertas ganadoras",
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
    title: "El Oráculo descifra el negocio completo",
    body: "Pegas el link de una página de ventas y te dice a quién le habla, qué promete, a qué precio y cómo está armada. En unos 25 segundos.",
    stat: "25 s",
    statLabel: "Análisis completo",
  },
  {
    num: "/03",
    title: "26 generadores de textos con IA",
    body: "Textos de anuncios, página de ventas, correos y guiones de video de venta, escritos a partir de la oferta que elegiste. Y la Mándala Creativa te da 72 anuncios posibles por oferta, la ruta para tus primeros 5 y, con tus números, si apagar, esperar o escalar. Sin diseñador, redactor ni programador.",
    stat: "29",
    statLabel: "Generadores con IA",
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
