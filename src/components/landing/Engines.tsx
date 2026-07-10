import { FadeIn } from "./FadeIn";

type Row = { num: string; title: string; body: string; stat: string; statLabel: string };

const MINER_ROWS: Row[] = [
  {
    num: "/01",
    title: "Keywords curadas que sabemos que venden",
    body: "Llevamos meses curando exactamente qué frases usan los marketers que VENDEN — no las obvias, las reales. Dolores específicos, mecanismos únicos, power words que aparecen en ads ganadoras.",
    stat: "458",
    statLabel: "Keywords curadas",
  },
  {
    num: "/02",
    title: "Escaneo continuo, día y noche",
    body: "JARVIS corre crons sincronizados que cruzan esas keywords contra Meta Ad Library. USA, LATAM y Brasil en paralelo. No descansa los fines de semana.",
    stat: "24/7",
    statLabel: "Sin pausa",
  },
  {
    num: "/03",
    title: "Una IA descarta lo que no quieres",
    body: "Antes de que tú veas la oferta, un clasificador revisa la landing y decide: ¿es producto digital? Si es dropshipping, e-commerce físico, MLM o cripto — descartado.",
    stat: "100%",
    statLabel: "Productos digitales",
  },
  {
    num: "/04",
    title: "Rankeado por temperatura real",
    body: "Cada oferta superviviente se cruza con su historial: días corriendo, duplicados activos, alcance, longevidad de la página. El resultado: tiers MEGA, RISING y SOLID. Tú ves solo lo que vale tu tiempo.",
    stat: "🔥",
    statLabel: "No likes. Señales reales.",
  },
];

const BUILDER_ROWS: Row[] = [
  {
    num: "/01",
    title: "Sofisticar: clona lo que ya vende",
    body: "Tomas la oferta ganadora y SUPERNOVA la adapta a tu mercado, tu idioma y tu ángulo. Mismo mecanismo probado, versión tuya.",
    stat: "1 clic",
    statLabel: "De espiada a tuya",
  },
  {
    num: "/02",
    title: "El Oráculo descifra el embudo completo",
    body: "Pegas la landing del competidor y te devuelve el avatar, la promesa, las objeciones y la estructura de la página. Lo que un consultor te cobraría en semanas.",
    stat: "3 min",
    statLabel: "Análisis completo",
  },
  {
    num: "/03",
    title: "Generadores de copy, landing y funnel",
    body: "Ad copies, avatar del comprador, landing page, secuencia de emails, VSL. Todo generado desde el ángulo ganador que acabas de copiar. Sin diseñador, copywriter ni programador.",
    stat: "18",
    statLabel: "Generadores listos",
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
          Esto <span className="italic text-[#86868B]">no</span> es un spy tool.
          <br />
          Es un <span className="text-[#C5A880]">radar curado.</span>
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
          La <span className="text-[#C5A880]">relanzas.</span>
        </>
      }
      intro="Encontrar la ganadora es la mitad del trabajo. La otra mitad — el ángulo, el copy, el avatar, el funnel — la hace SUPERNOVA por ti, en minutos."
      rows={BUILDER_ROWS}
    />
  );
}
