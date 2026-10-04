/**
 * Miniatura de cada herramienta del Inicio: un dibujo pequeño de lo que sale de ahí (3 creativos,
 * un carrusel, un video, una página…), en líneas finas sobre negro y un solo toque ámbar, como pide
 * el sistema "Apple Space Black". SVG en línea: no pesa ni hace peticiones en la primera carga.
 */
type Art =
  | "images" | "carousel" | "video" | "film" | "youtube" | "thumb" | "person" | "product" | "text"
  | "page" | "book" | "offer" | "radar" | "idea" | "chat" | "chart" | "calendar" | "calc" | "check"
  | "orbit" | "quote" | "ladder" | "apps" | "phone";

const ART_BY_TOOL: Record<string, Art> = {
  creativos: "images", carrusel: "carousel", miniaturas: "thumb", fotosugc: "phone", fotoproducto: "product",
  videoanuncio: "video", videoia: "video", ugc: "phone", video: "person", series: "film", creadoryt: "youtube",
  personaje: "person", copy: "text", paginas: "page", producto: "book", anuncios: "orbit", ganchos: "quote",
  ideas: "idea", dolores: "idea", radar: "radar", ofertas: "offer", nichosyt: "youtube", miniapps: "apps",
  validar: "check", precio: "calc", plan: "calendar", contenido: "calendar", bump: "ladder", ascension: "ladder",
  recuperar: "chat", dm: "chat", resultados: "chart", vsl: "video", correos: "text", reels: "phone",
  captions: "text", youtube: "youtube", mercado: "offer", oraculo: "page",
};

// Colores del sistema (src/index.css): línea gris, superficie y el acento ámbar.
const L = "hsl(var(--muted-foreground) / 0.55)";
const S = "hsl(var(--secondary))";
const A = "hsl(var(--primary))";
const F = "hsl(var(--foreground) / 0.85)";

function Drawing({ art }: { art: Art }) {
  const p = { fill: "none", stroke: L, strokeWidth: 1.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (art) {
    case "images":
      return <>
        <rect x="34" y="22" width="34" height="46" rx="4" fill={S} {...p} transform="rotate(-8 51 45)" />
        <rect x="63" y="18" width="34" height="50" rx="4" fill={S} {...p} />
        <rect x="92" y="22" width="34" height="46" rx="4" fill={S} {...p} transform="rotate(8 109 45)" />
        <rect x="68" y="52" width="24" height="7" rx="3.5" fill={A} />
        <circle cx="80" cy="34" r="6" {...p} />
      </>;
    case "carousel":
      return <>
        {[0, 1, 2, 3, 4].map(i => (
          <rect key={i} x={22 + i * 24} y="22" width="20" height="38" rx="3" fill={S} {...p} stroke={i === 0 ? A : L} />
        ))}
        {[0, 1, 2, 3, 4].map(i => <circle key={i} cx={68 + i * 6} cy="72" r="1.6" fill={i === 0 ? A : L} />)}
      </>;
    case "video":
      return <>
        <rect x="36" y="18" width="88" height="50" rx="6" fill={S} {...p} />
        <path d="M74 33 L90 43 L74 53 Z" fill={A} />
        <line x1="36" y1="76" x2="124" y2="76" {...p} />
        <line x1="36" y1="76" x2="70" y2="76" stroke={A} strokeWidth="2" strokeLinecap="round" />
      </>;
    case "film":
      return <>
        <rect x="20" y="24" width="120" height="42" rx="4" fill={S} {...p} />
        {[0, 1, 2].map(i => <rect key={i} x={27 + i * 37} y="32" width="32" height="26" rx="2" {...p} stroke={i === 1 ? A : L} />)}
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => <rect key={i} x={24 + i * 12} y="26.5" width="5" height="3" rx="1" fill={L} />)}
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => <rect key={`b${i}`} x={24 + i * 12} y="60.5" width="5" height="3" rx="1" fill={L} />)}
      </>;
    case "youtube":
      return <>
        <rect x="30" y="16" width="100" height="56" rx="6" fill={S} {...p} />
        <rect x="68" y="34" width="24" height="17" rx="5" fill={A} />
        <path d="M77 38.5 L85 42.5 L77 46.5 Z" fill="hsl(var(--background))" />
        <line x1="30" y1="80" x2="96" y2="80" {...p} />
      </>;
    case "thumb":
      return <>
        <rect x="26" y="16" width="108" height="60" rx="6" fill={S} {...p} />
        <rect x="36" y="28" width="46" height="9" rx="2" fill={F} />
        <rect x="36" y="42" width="32" height="9" rx="2" fill={A} />
        <circle cx="108" cy="50" r="14" {...p} />
        <path d="M92 76 C96 64 120 64 124 76" {...p} />
      </>;
    case "person":
      return <>
        <rect x="56" y="12" width="48" height="68" rx="8" fill={S} {...p} />
        <circle cx="80" cy="38" r="10" {...p} />
        <path d="M64 70 C66 56 94 56 96 70" {...p} />
        <circle cx="96" cy="20" r="3" fill={A} />
      </>;
    case "phone":
      return <>
        <rect x="60" y="10" width="40" height="72" rx="7" fill={S} {...p} />
        <circle cx="80" cy="36" r="8" {...p} />
        <path d="M68 60 C70 50 90 50 92 60" {...p} />
        <rect x="68" y="66" width="24" height="5" rx="2.5" fill={A} />
        <line x1="74" y1="15" x2="86" y2="15" {...p} />
      </>;
    case "product":
      return <>
        <path d="M66 34 L80 27 L94 34 L94 52 L80 59 L66 52 Z" fill={S} {...p} />
        <path d="M66 34 L80 41 L94 34 M80 41 L80 59" {...p} />
        <ellipse cx="80" cy="68" rx="30" ry="5" {...p} />
        <path d="M80 10 L80 18 M58 18 L63 23 M102 18 L97 23" stroke={A} strokeWidth="1.4" strokeLinecap="round" />
      </>;
    case "text":
      return <>
        <rect x="44" y="12" width="72" height="68" rx="6" fill={S} {...p} />
        <rect x="54" y="24" width="40" height="6" rx="2" fill={F} />
        {[38, 46, 54].map(y => <line key={y} x1="54" y1={y} x2="106" y2={y} {...p} />)}
        <line x1="54" y1="62" x2="84" y2="62" {...p} />
        <line x1="88" y1="57" x2="88" y2="67" stroke={A} strokeWidth="1.8" strokeLinecap="round" />
      </>;
    case "page":
      return <>
        <rect x="28" y="12" width="104" height="68" rx="6" fill={S} {...p} />
        <line x1="28" y1="22" x2="132" y2="22" {...p} />
        {[34, 40, 46].map(x => <circle key={x} cx={x} cy="17" r="1.6" fill={L} />)}
        <rect x="46" y="30" width="68" height="7" rx="2" fill={F} />
        <line x1="54" y1="44" x2="106" y2="44" {...p} />
        <line x1="60" y1="51" x2="100" y2="51" {...p} />
        <rect x="64" y="60" width="32" height="10" rx="5" fill={A} />
      </>;
    case "book":
      return <>
        <path d="M80 24 C70 18 52 18 42 22 L42 70 C52 66 70 66 80 72 Z" fill={S} {...p} />
        <path d="M80 24 C90 18 108 18 118 22 L118 70 C108 66 90 66 80 72 Z" fill={S} {...p} />
        {[32, 40, 48].map(y => <line key={y} x1="50" y1={y} x2="72" y2={y + 1} {...p} />)}
        <rect x="88" y="30" width="22" height="6" rx="2" fill={A} />
        {[44, 52].map(y => <line key={y} x1="88" y1={y + 1} x2="110" y2={y} {...p} />)}
      </>;
    case "offer":
      return <>
        <rect x="44" y="12" width="72" height="68" rx="6" fill={S} {...p} />
        <rect x="54" y="22" width="52" height="22" rx="3" {...p} />
        <rect x="54" y="50" width="30" height="7" rx="2" fill={F} />
        <rect x="54" y="64" width="52" height="9" rx="4.5" fill={A} />
        <path d="M100 52 L108 52 L112 56 L108 60 L100 60 Z" {...p} />
      </>;
    case "radar":
      return <>
        {[34, 24, 14].map(r => <circle key={r} cx="80" cy="46" r={r} {...p} />)}
        <path d="M80 46 L80 12 A34 34 0 0 1 109 29 Z" fill="hsl(var(--primary) / 0.18)" />
        <line x1="80" y1="46" x2="109" y2="29" stroke={A} strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="96" cy="30" r="3" fill={A} />
        <circle cx="64" cy="58" r="2" fill={L} />
        <circle cx="98" cy="62" r="2" fill={L} />
      </>;
    case "idea":
      return <>
        <path d="M70 52 C62 46 62 26 80 24 C98 26 98 46 90 52 L90 60 L70 60 Z" fill={S} {...p} />
        <line x1="72" y1="66" x2="88" y2="66" {...p} />
        <line x1="74" y1="72" x2="86" y2="72" {...p} />
        <path d="M80 10 L80 15 M56 20 L60 24 M104 20 L100 24 M50 42 L55 42 M110 42 L105 42" stroke={A} strokeWidth="1.4" strokeLinecap="round" />
      </>;
    case "chat":
      return <>
        <rect x="34" y="16" width="62" height="22" rx="10" fill={S} {...p} />
        <line x1="44" y1="27" x2="84" y2="27" {...p} />
        <rect x="64" y="44" width="62" height="22" rx="10" fill="hsl(var(--primary) / 0.16)" stroke={A} strokeWidth="1.2" />
        <line x1="74" y1="55" x2="114" y2="55" stroke={A} strokeWidth="1.2" strokeLinecap="round" />
        {[0, 1, 2].map(i => <circle key={i} cx={46 + i * 7} cy="78" r="2" fill={L} />)}
      </>;
    case "chart":
      return <>
        <line x1="34" y1="76" x2="126" y2="76" {...p} />
        {[[42, 52], [58, 42], [74, 46], [90, 30]].map(([x, y]) => <rect key={x} x={x} y={y} width="11" height={76 - y} rx="2" fill={S} {...p} />)}
        <rect x="106" y="16" width="11" height="60" rx="2" fill={A} />
      </>;
    case "calendar":
      return <>
        <rect x="40" y="14" width="80" height="66" rx="6" fill={S} {...p} />
        <line x1="40" y1="28" x2="120" y2="28" {...p} />
        {[0, 1, 2, 3].map(r => [0, 1, 2, 3, 4].map(c => (
          <rect key={`${r}${c}`} x={48 + c * 14} y={34 + r * 11} width="9" height="7" rx="1.5"
            fill={r === 1 && c === 2 ? A : "none"} stroke={r === 1 && c === 2 ? A : L} strokeWidth="1" />
        )))}
      </>;
    case "calc":
      return <>
        <rect x="56" y="10" width="48" height="72" rx="7" fill={S} {...p} />
        <rect x="63" y="18" width="34" height="14" rx="2" {...p} />
        <rect x="78" y="22" width="15" height="6" rx="1.5" fill={A} />
        {[0, 1, 2].map(r => [0, 1, 2].map(c => (
          <rect key={`${r}${c}`} x={64 + c * 12} y={40 + r * 12} width="8" height="8" rx="2" {...p} />
        )))}
      </>;
    case "check":
      return <>
        {[18, 38, 58].map((y, i) => (
          <g key={y}>
            <rect x="46" y={y} width="14" height="14" rx="3" fill={S} {...p} stroke={i < 2 ? A : L} />
            {i < 2 && <path d={`M49 ${y + 7} L52 ${y + 10} L57 ${y + 4}`} stroke={A} strokeWidth="1.6" fill="none" strokeLinecap="round" />}
            <line x1="68" y1={y + 7} x2={i === 1 ? 104 : 114} y2={y + 7} {...p} />
          </g>
        ))}
      </>;
    case "orbit":
      return <>
        <circle cx="80" cy="46" r="30" {...p} />
        <circle cx="80" cy="46" r="16" fill={S} {...p} />
        {[0, 72, 144, 216, 288].map((d, i) => {
          const r = (d - 90) * Math.PI / 180;
          return <circle key={d} cx={80 + 30 * Math.cos(r)} cy={46 + 30 * Math.sin(r)} r="4" fill={i === 0 ? A : S} stroke={i === 0 ? A : L} strokeWidth="1.2" />;
        })}
      </>;
    case "quote":
      return <>
        <path d="M50 24 C40 28 38 38 40 46 L52 46 L52 34 L46 34 C46 30 48 28 52 27 Z" fill={A} />
        <path d="M72 24 C62 28 60 38 62 46 L74 46 L74 34 L68 34 C68 30 70 28 74 27 Z" fill={A} />
        <line x1="40" y1="60" x2="120" y2="60" {...p} />
        <line x1="40" y1="70" x2="100" y2="70" {...p} />
      </>;
    case "ladder":
      return <>
        <path d="M34 76 L34 60 L62 60 L62 44 L90 44 L90 28 L118 28 L118 76 Z" fill={S} {...p} />
        <path d="M44 52 L108 18" stroke={A} strokeWidth="1.4" strokeLinecap="round" />
        <path d="M100 17 L109 17.5 L105 25" stroke={A} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </>;
    case "apps":
      return <>
        {[0, 1].map(r => [0, 1, 2].map(c => (
          <rect key={`${r}${c}`} x={44 + c * 26} y={18 + r * 28} width="20" height="20" rx="5"
            fill={r === 0 && c === 0 ? A : S} stroke={r === 0 && c === 0 ? A : L} strokeWidth="1.2" />
        )))}
      </>;
  }
}

export function ToolThumb({ toolId, className = "" }: { toolId: string; className?: string }) {
  const art = ART_BY_TOOL[toolId] ?? "text";
  return (
    <div className={`relative overflow-hidden bg-gradient-to-b from-secondary/70 to-background ${className}`} aria-hidden>
      <svg viewBox="0 0 160 92" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid meet">
        <Drawing art={art} />
      </svg>
    </div>
  );
}
