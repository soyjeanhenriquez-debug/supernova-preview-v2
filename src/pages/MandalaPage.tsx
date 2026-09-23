import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Copy, Dices, Loader2, Sparkles, Layers, Route, Orbit, ListChecks, Check, Video, Trash2,
  ChevronDown, ChevronUp, Repeat, AlertTriangle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits, generatorCost } from "@/hooks/useCredits";
import { fnHeaders, fnErrorMessage, readBilling } from "@/lib/fnAuth";
import {
  useBusinessProfile, profileText, profileReady, businessHint, copyLevelHint, type BusinessProfile,
} from "@/lib/businessProfile";
import { useFeatureAccess } from "@/lib/features";
import { maxAdCostPerSale } from "@/lib/pricing";

/**
 * Mándala Creativa: la rueda para no quedarse nunca sin anuncios.
 * Cruza 4 ETAPAS (a quién le hablas) con 18 ÁNGULOS (cómo lo cuentas) = 72 anuncios por oferta.
 * La técnica es la limitación creativa: la rueda pone la restricción y la restricción obliga a crear
 * algo distinto. Tres modos:
 *  · Ruta guiada: el orden que conviene a quien empieza con poco presupuesto (vender primero,
 *    recuperar después, abrir arriba del embudo cuando ya hay un ganador).
 *  · Rueda libre: girar y crear.
 *  · Mis anuncios: se guardan en la base con su resultado real → veredicto (apagar, esperar,
 *    escalar) → iterar el ganador. Así la rueda no solo inspira: cierra el ciclo.
 * Nada depende de una plataforma: etapas y ángulos son psicología de venta; la plataforma solo
 * cambia "cómo publicarlo", que la IA adapta (Meta, TikTok, YouTube u orgánico sin pagar).
 */

type Stage = { id: string; name: string; color: string; goal: string; setup: Record<Platform, string>; audience: string };
type Angle = { id: string; name: string; short: string; how: string };
type Platform = "meta" | "tiktok" | "youtube" | "organico";

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: "meta", label: "Meta (Facebook/Instagram)" },
  { id: "tiktok", label: "TikTok Ads" },
  { id: "youtube", label: "YouTube Ads" },
  { id: "organico", label: "Sin pagar anuncios (orgánico)" },
];

const STAGES: Stage[] = [
  {
    id: "atraer", name: "Atraer", color: "#3B82F6",
    goal: "Que gente nueva se identifique con tu mensaje. Aquí no vendes: haces que te noten.",
    audience: "Gente fría: público amplio o intereses del nicho.",
    setup: {
      meta: "Campaña de reconocimiento o interacción (reproducciones de video).",
      tiktok: "Campaña de alcance o vistas de video.",
      youtube: "Campaña de vistas (anuncio saltable).",
      organico: "Reel/TikTok para que lo compartan y te sigan.",
    },
  },
  {
    id: "conectar", name: "Conectar", color: "#A1A1AA",
    goal: "Educar y ganar confianza: que crean en ti y en que tu método funciona.",
    audience: "Quienes ya vieron tus videos, interactuaron o te siguen.",
    setup: {
      meta: "Interacción o tráfico, mostrado a quien vio el 50% de tus videos.",
      tiktok: "Interacción, a quien vio tus videos o te sigue.",
      youtube: "Vistas, a quien vio tus videos antes.",
      organico: "Contenido educativo, historias y respuestas a comentarios.",
    },
  },
  {
    id: "convertir", name: "Convertir", color: "#8B5CF6",
    goal: "Vender a quien está listo para comprar. Oferta clara, precio, garantía y botón.",
    audience: "Público amplio optimizado a compra + quienes ya te conocen.",
    setup: {
      meta: "Campaña de ventas optimizada a compra.",
      tiktok: "Campaña de conversiones optimizada a compra.",
      youtube: "Campaña de conversiones (anuncio en video).",
      organico: "Video con llamada clara: \"link en la bio\" o \"escríbeme QUIERO\".",
    },
  },
  {
    id: "recuperar", name: "Recuperar", color: "#14B8A6",
    goal: "Volver a quien visitó la página o el pago y no compró, hasta que decida.",
    audience: "Visitaron la página, iniciaron el pago o vieron la VSL y no compraron (7-30 días).",
    setup: {
      meta: "Ventas con públicos personalizados, presupuesto pequeño y constante.",
      tiktok: "Conversiones con públicos personalizados.",
      youtube: "Remarketing a visitantes de la página.",
      organico: "Historias, mensajes directos y seguimiento por WhatsApp.",
    },
  },
];

const ANGLES: Angle[] = [
  { id: "oportunidad", name: "Oportunidad", short: "Oportunidad", how: "Muestra algo que está pasando ahora y que pocos aprovechan." },
  { id: "explicacion", name: "Explicación", short: "Explicación", how: "Explica en simple cómo funciona algo que parece complicado." },
  { id: "reflexion", name: "Reflexión", short: "Reflexión", how: "Una pregunta o idea que hace pensar sobre la propia situación." },
  { id: "ultrasegmentado", name: "Ultrasegmentado", short: "Ultrasegm.", how: "Háblale a un grupo muy concreto sin afirmar nada personal del que mira: \"Para mamás que quieren vender desde casa…\" (no \"¿Eres mamá?\", que las plataformas rechazan)." },
  { id: "historia", name: "Historia", short: "Historia", how: "Una historia real y corta: antes, el giro y el después. Debe ser la historia real de quien publica (deja [corchetes] para sus datos) o contada en tercera persona como ejemplo; nunca presentada como testimonio de alguien que no existe." },
  { id: "contraste", name: "Contraste", short: "Contraste", how: "Dos realidades lado a lado: con y sin tu solución." },
  { id: "mito", name: "Mito", short: "Mito", how: "Derriba una creencia falsa del nicho." },
  { id: "sensacion", name: "Sensación", short: "Sensación", how: "Haz que sienta el resultado: cómo se ve, se siente o suena." },
  { id: "titular-intrigante", name: "Titular intrigante", short: "Intriga", how: "Un titular que obliga a mirar y que el anuncio cumple (nada engañoso)." },
  { id: "dilema", name: "Dilema", short: "Dilema", how: "Pon al espectador ante dos caminos y que elija." },
  { id: "visual", name: "Visual", short: "Visual", how: "La imagen cuenta todo: una demostración o un objeto que llama la atención." },
  { id: "correcto-incorrecto", name: "Forma correcta vs. incorrecta", short: "Bien vs mal", how: "Cómo lo hace casi todo el mundo y cómo se hace bien." },
  { id: "emocional", name: "Llamado emocional", short: "Emoción", how: "Lo que de verdad le importa: familia, orgullo, tranquilidad, libertad." },
  { id: "comparacion", name: "Comparación", short: "Comparación", how: "Tu solución frente a las alternativas que ya conoce." },
  { id: "urgencia-oculta", name: "Urgencia oculta", short: "Urgencia", how: "Lo que pierde cada día que no actúa (sin inventar plazos)." },
  { id: "problema-solucion", name: "Problema → solución", short: "Problema", how: "Nombra el problema con sus palabras y presenta la salida." },
  { id: "curiosidad", name: "Curiosidad", short: "Curiosidad", how: "Abre un hueco de información que solo se cierra viendo o haciendo clic." },
  { id: "prueba", name: "Prueba", short: "Prueba", how: "Resultados, testimonios reales, capturas o una demostración en vivo." },
];
const stageById = (id: string) => STAGES.find(s => s.id === id) ?? STAGES[0];
const angleById = (id: string) => ANGLES.find(a => a.id === id) ?? ANGLES[0];

const FORMATS = ["Video corto", "Imagen", "Carrusel", "Video con avatar (Media Studio)"];

// Ruta guiada: primero lo que vende con poco presupuesto, luego recuperar, y solo con un
// ganador se abre la parte alta del embudo.
const ROUTE: { stage: string; angle: string; why: string }[] = [
  { stage: "convertir", angle: "problema-solucion", why: "El anuncio más directo: nombra el dolor y ofrece la salida. Suele ser el primero en vender." },
  { stage: "convertir", angle: "prueba", why: "Muestra que funciona. Si no tienes testimonios aún, la IA te dice qué prueba conseguir hoy." },
  { stage: "convertir", angle: "correcto-incorrecto", why: "Enseña algo útil y posiciona tu método como la forma correcta." },
  { stage: "recuperar", angle: "urgencia-oculta", why: "Para quien visitó y no compró: lo que pierde cada día que espera." },
  { stage: "recuperar", angle: "comparacion", why: "Responde la objeción \"¿y por qué esto y no otra cosa?\"." },
];

// La ficha de la oferta es "Mi negocio" (tabla business_profile), compartida con el resto de la app.
type Brief = BusinessProfile;
const briefText = profileText;
const briefReady = profileReady;

const RULES = `Escribe en español neutro, para alguien que empieza. Frases cortas. Usa títulos con ## y listas.
Nunca inventes testimonios, cifras, resultados ni plazos: si hace falta una prueba, di qué prueba conseguir y cómo.
Cumple las políticas de anuncios: no afirmes atributos personales de quien mira (salud, dinero, edad, físico: "para quienes quieren…" en vez de "¿Tienes deudas?"), nada de antes/después de cuerpos, nada de ingresos garantizados.`;

function platformHint(p: Platform) {
  return p === "organico"
    ? "PLATAFORMA: orgánico, sin pagar anuncios (Reels, TikTok, Shorts, historias). En \"Cómo publicarlo\" da hora, formato, hashtags mínimos y la llamada a la acción (link en la bio o palabra clave por DM). Nada de presupuestos."
    : `PLATAFORMA: ${PLATFORMS.find(x => x.id === p)?.label}. En "Cómo publicarlo" usa los nombres de objetivos que tenga la plataforma hoy y un presupuesto diario de prueba en USD pensado para alguien que empieza (bajo), durante 3 días.`;
}

function adPrompt(stage: Stage, angle: Angle, format: string, platform: Platform) {
  return `Eres un creativo de respuesta directa. Usas la Mándala Creativa: cada anuncio cruza una ETAPA del embudo con un ÁNGULO. La restricción es a propósito: obliga a crear algo distinto.

ETAPA: ${stage.name} — ${stage.goal} Público: ${stage.audience}
ÁNGULO: ${angle.name} — ${angle.how}
FORMATO: ${format}
${platformHint(platform)}
LLAMADA A LA ACCIÓN SEGÚN LA ETAPA: ${stage.id === "atraer" || stage.id === "conectar"
    ? "esta etapa NO vende: no menciones precio ni pidas comprar; la llamada es suave (seguir, guardar, ver el video completo, comentar una palabra)."
    : "esta etapa vende: oferta clara, precio, garantía y botón de compra."}

Entrega exactamente:
## 3 ganchos (primeros 3 segundos o titular)
## El anuncio
${/video|avatar/i.test(format) ? "Guion hablado con marcas de tiempo (máximo 45 segundos). Si es para avatar, máximo 150 palabras y sin indicaciones de escena dentro del texto hablado." : format === "Carrusel" ? "Texto de cada tarjeta (5 tarjetas) y qué imagen lleva cada una." : "Descripción exacta de la imagen y el texto que va encima."}
## Texto del anuncio y llamada a la acción
## Cómo publicarlo
## Cómo saber si funciona
Usa exactamente estas reglas (son las que usa la app en "Resultados"), medidas a los 3 días:
- CTR menor a 0,8%: el gancho no detiene → cambiar los primeros 3 segundos o el ángulo.
- CTR de 0,8% o más pero sin ventas: la página o la oferta no convencen → revisar la página antes de gastar 2 veces el precio.
- Gastó 2 veces el precio sin ventas → apagar.
- Costo por venta igual o menor al precio → ganador: subir presupuesto ≈20% cada 2 días y pedir variaciones.
## Revisión de políticas
Frases que podrían rechazar y cómo quedaron corregidas (si no hay, dilo).
## Siguiente giro
Qué ángulo probar después en esta MISMA etapa (${stage.name}) y por qué.

${RULES}`;
}

function sequencePrompt(angle: Angle, format: string, platform: Platform) {
  return `Eres un media buyer y creativo de respuesta directa. Con la Mándala Creativa arma una SECUENCIA DE 4 PIEZAS, una por etapa, que lleven a una persona desde que no te conoce hasta que compra.
Ángulo base elegido: ${angle.name} (${angle.how}). Úsalo en al menos una etapa y elige el mejor ángulo para las demás, diciendo cuál.
Formato principal: ${format}
${platformHint(platform)}

${STAGES.map((s, i) => `ETAPA ${i + 1}: ${s.name} — ${s.goal} Público: ${s.audience}`).join("\n")}

Para cada etapa:
## Etapa N: [nombre] · Ángulo: [ángulo]
- Gancho
- Guion o descripción del creativo
- Texto del anuncio
- A quién se muestra y cómo publicarlo

Al final:
## Cómo pasan las personas de una etapa a la siguiente
## Reparto del presupuesto (orientativo; si es orgánico, frecuencia de publicación)

${RULES}`;
}

function iteratePrompt(ad: AdRow) {
  const s = stageById(ad.stage), a = angleById(ad.angle);
  return `Eres un creativo de respuesta directa. Este anuncio (etapa ${s.name}, ángulo ${a.name}) está funcionando. La regla: al ganador no se le cambia el corazón, se le cambian las puertas de entrada.

ANUNCIO GANADOR:
${ad.output.slice(0, 6000)}

Entrega:
## 5 ganchos nuevos para el mismo anuncio (el cuerpo no cambia)
## 2 versiones con ángulos vecinos
Mismo mensaje central, contado con otro ángulo de la Mándala (di cuál).
## Cómo escalarlo sin romperlo
Pasos concretos y prudentes.

${RULES}`;
}

type AdRow = {
  id: string; stage: string; angle: string; format: string; platform: Platform; brief: string; output: string;
  status: "borrador" | "publicado" | "ganador" | "descartado"; spend: number | null; ctr: number | null; sales: number | null; created_at: string;
};

/** Veredicto con reglas simples y a la vista: orienta, no adivina. */
/**
 * Veredicto con reglas simples y a la vista: orienta, no adivina. Si el usuario hizo los números en
 * la calculadora (etapa 3), el límite es su máximo real por venta (precio − comisiones − reembolsos −
 * impuestos − costo); si no, se usa el precio, que es más optimista.
 */
function verdict(ad: AdRow, price: number, max: { max: number; currency: string } | null): { tone: "good" | "bad" | "wait" | "fix"; text: string } | null {
  if (ad.platform === "organico" || ad.spend == null) return null;
  const spend = Number(ad.spend), sales = Number(ad.sales ?? 0), ctr = ad.ctr == null ? null : Number(ad.ctr);
  const cur = max?.currency ?? "US$";
  const fmt = (n: number) => `${cur}${n.toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  // La calculadora dice que, con ese precio, cada venta pierde dinero aun sin pagar anuncios:
  // ningún anuncio puede ser "ganador" hasta que cambien los números.
  if (max && max.max <= 0) {
    return { tone: "bad", text: `Con tu precio actual no te queda margen: comisiones, reembolsos e impuestos se comen toda la venta antes de pagar anuncios. Sube el precio o baja costos en la calculadora antes de invertir más.` };
  }
  // Límite por venta: el máximo de la calculadora si existe; si no, el precio.
  const limit = max && max.max > 0 ? max.max : price;
  const limitTxt = max && max.max > 0 ? `tu máximo por venta (${fmt(max.max)}, de tu calculadora)` : "el precio de tu producto";
  if (sales > 0) {
    const cpa = spend / sales;
    if (!limit || cpa <= limit) {
      const gain = limit ? limit - cpa : 0;
      return { tone: "good", text: `Ganador: cada venta te costó ${fmt(cpa)}${limit ? `, por debajo de ${limitTxt}: te quedan unos ${fmt(gain)} por venta` : ""}. Márcalo como ganador, pide variaciones y sube el presupuesto poco a poco (más o menos un 20% cada 2 días).` };
    }
    return { tone: "fix", text: `Vende, pero cada venta te cuesta ${fmt(cpa)}, más que ${limitTxt}: pierdes unos ${fmt(cpa - limit)} en cada una. Solo te conviene si cada cliente te compra más (un extra antes de pagar o una oferta después) o si pruebas otro gancho.` };
  }
  if (limit && spend >= limit * 2) return { tone: "bad", text: `Ya gastaste 2 veces ${limitTxt} y no vendió: apágalo y prueba otro ángulo en la rueda.` };
  if (ctr != null && ctr < 0.8) return { tone: "fix", text: "Menos del 0,8% de quienes lo ven hacen clic (CTR bajo): casi nadie se detiene. Cambia los primeros 3 segundos o el ángulo." };
  if (ctr != null && ctr >= 0.8 && spend > 0) return { tone: "fix", text: `La gente hace clic, pero todavía no compra. Si sigue así cuando hayas gastado 2 veces ${limitTxt}, revisa tu página de ventas y tu oferta: qué prometes, qué incluye y el precio.` };
  return { tone: "wait", text: `Aún es pronto para decidir: déjalo correr hasta gastar unas 2 veces ${limitTxt}.` };
}

// Reto del día: el mismo para todos ese día, una restricción concreta para crear hoy.
function dailyChallenge() {
  const d = new Date();
  const n = d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate();
  return { stage: STAGES[n % STAGES.length], angle: ANGLES[(n * 7) % ANGLES.length] };
}

// ── Geometría de la rueda ────────────────────────────────────────────────────
const C = 200;
const pt = (r: number, a: number) => [C + r * Math.sin((a * Math.PI) / 180), C - r * Math.cos((a * Math.PI) / 180)];
function ring(r1: number, r2: number, a0: number, a1: number) {
  const large = a1 - a0 > 180 ? 1 : 0;
  const [x0, y0] = pt(r2, a0), [x1, y1] = pt(r2, a1), [x2, y2] = pt(r1, a1), [x3, y3] = pt(r1, a0);
  return `M${x0} ${y0}A${r2} ${r2} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${r1} ${r1} 0 ${large} 0 ${x3} ${y3}Z`;
}
const SEG = 360 / ANGLES.length;

// La tabla es nueva y aún no está en los tipos generados de Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adsTable = () => (supabase as any).from("mandala_ads");

type Tab = "ruta" | "rueda" | "mis";

/** Un paso de la ruta: solo el activo se abre; los demás se ven como una línea con su estado. */
function Step({ n, title, summary, done, active, onOpen, children }: {
  n: number; title: string; summary?: string; done: boolean; active: boolean; onOpen: () => void; children: ReactNode;
}) {
  return (
    <div className={`card-surface rounded-2xl transition-colors ${active ? "border-primary/50" : ""}`}>
      <button onClick={onOpen} className="w-full flex items-center gap-3 p-4 text-left" aria-expanded={active}>
        <span className={`w-7 h-7 rounded-full grid place-items-center text-xs font-bold shrink-0 ${done && !active ? "bg-emerald-500/15 text-emerald-400" : active ? "gradient-brand text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
          {done && !active ? <Check className="w-4 h-4" /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${active || done ? "text-foreground" : "text-muted-foreground"}`}>{title}</p>
          {!active && summary && <p className="text-xs text-muted-foreground truncate">{summary}</p>}
        </div>
        {!active && <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {active && <div className="px-4 pb-5 sm:pl-14 space-y-4">{children}</div>}
    </div>
  );
}

/**
 * La ficha del negocio ya no vive aquí: está en "Mi negocio" (src/pages/MyBusinessPage.tsx) y la
 * Mándala solo la lee. initialTab "mis" = entrada "Resultados" de la etapa 6 del recorrido.
 */
export function MandalaPage({ onNavigate, initialTab = "ruta" }: { onNavigate?: (page: string) => void; initialTab?: Tab } = {}) {
  const { user } = useAuth();
  const { applyServerCharge, canAfford } = useCredits();

  const [tab, setTab] = useState<Tab>(initialTab);
  const isResults = initialTab === "mis";
  const [stage, setStage] = useState<Stage>(STAGES[2]);
  const [angle, setAngle] = useState<Angle>(angleById("problema-solucion"));
  const [rotation, setRotation] = useState(-(ANGLES.findIndex(a => a.id === "problema-solucion") * SEG + SEG / 2));
  const [spinning, setSpinning] = useState(false);
  const { profile: brief } = useBusinessProfile();
  const [platform, setPlatform] = useState<Platform>("meta");
  const [format, setFormat] = useState(FORMATS[0]);
  const { canSee } = useFeatureAccess();
  const [ads, setAds] = useState<AdRow[]>([]);
  const [output, setOutput] = useState("");
  const [outputTitle, setOutputTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [openAd, setOpenAd] = useState<string | null>(null);
  // Paso a paso: qué paso está abierto (null = el que toca) y dónde se muestra el anuncio recién creado.
  const setupKey = `sn_mandala_setup_${user?.id ?? "anon"}`;
  const [setupDone, setSetupDone] = useState(false);
  const [openStep, setOpenStep] = useState<number | null>(null);
  const [routePick, setRoutePick] = useState<number | null>(null);
  const [outputAt, setOutputAt] = useState<string | null>(null);
  const challenge = useMemo(dailyChallenge, []);

  useEffect(() => {
    try { setSetupDone(localStorage.getItem(setupKey) === "1"); } catch { /* sin almacenamiento */ }
  }, [setupKey]);
  const confirmSetup = () => { setSetupDone(true); setOpenStep(null); try { localStorage.setItem(setupKey, "1"); } catch { /* sin almacenamiento */ } };

  const loadAds = useCallback(async () => {
    if (!user) return;
    const { data, error } = await adsTable()
      .select("id,stage,angle,format,platform,brief,output,status,spend,ctr,sales,created_at")
      .order("created_at", { ascending: false }).limit(300);
    if (!error && Array.isArray(data)) {
      setAds(data as AdRow[]);
    }
  }, [user]);
  useEffect(() => { loadAds(); }, [loadAds]);

  const done = useMemo(() => new Set(ads.map(a => `${a.stage}:${a.angle}`)), [ads]);
  const price = parseFloat(brief.price.replace(",", ".")) || 0;
  const maxSale = maxAdCostPerSale(brief);
  const hasWinner = ads.some(a => a.status === "ganador");

  const pick = (s: Stage, a: Angle) => {
    setStage(s); setAngle(a);
    const target = -(ANGLES.indexOf(a) * SEG + SEG / 2);
    setRotation(r => r - ((((r - target) % 360) + 360) % 360));
  };

  const spin = () => {
    if (spinning) return;
    const all = STAGES.flatMap(s => ANGLES.map(a => ({ s, a })));
    const pending = all.filter(({ s, a }) => !done.has(`${s.id}:${a.id}`));
    const pool = pending.length ? pending : all;
    const next = pool[Math.floor(Math.random() * pool.length)];
    const target = -(ANGLES.indexOf(next.a) * SEG + SEG / 2);
    setSpinning(true);
    setRotation(r => r - ((((r - target) % 360) + 360) % 360) - 720);
    setTimeout(() => { setStage(next.s); setAngle(next.a); setSpinning(false); }, 1300);
  };

  const stream = async (id: string, title: string, content: string): Promise<string | null> => {
    const { action } = generatorCost(id);
    if (!canAfford(action)) { toast.error(`Te faltan créditos: esto cuesta ${generatorCost(id).cost}`, { description: "Recarga créditos o espera a que se renueven el mes que viene." }); return null; }
    setLoading(true); setOutput(""); setOutputTitle(title);
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`, {
        method: "POST",
        headers: await fnHeaders(),
        body: JSON.stringify({ generator_id: id, generator_title: title, messages: [{ role: "user", content }] }),
      });
      if (!resp.ok || !resp.body) throw new Error(await fnErrorMessage(resp, "Error al generar"));
      applyServerCharge(action, readBilling(resp), title);
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "", full = "", finished = false;
      while (!finished) {
        const { done: end, value } = await reader.read();
        if (end) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { finished = true; break; }
          try {
            const c = JSON.parse(json).choices?.[0]?.delta?.content;
            if (c) { full += c; setOutput(full); }
          } catch { buf = line + "\n" + buf; break; }
        }
      }
      return full;
    } catch (err: unknown) {
      toast.error(err instanceof Error && err.message ? err.message : "No se pudo crear. Inténtalo de nuevo en un momento.");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const requireBrief = () => {
    if (briefReady(brief)) return true;
    toast.error("Primero cuéntanos qué vendes", { description: "Llénalo en Mi negocio: qué es, para quién y qué logra. Te toma unos 30 segundos." });
    onNavigate?.("Mi negocio");
    return false;
  };

  const createAd = async (s: Stage, a: Angle, at: string | null = null) => {
    if (!requireBrief()) return;
    pick(s, a);
    setOutputAt(at);
    const title = `Mándala · ${s.name} × ${a.name}`;
    const text = briefText(brief);
    const full = await stream("mandala-ad", title, `${adPrompt(s, a, format, platform)}\n${businessHint(brief)}\n${copyLevelHint(brief)}\n\nOFERTA DEL USUARIO:\n${text.slice(0, 2500)}`);
    if (!full) return;
    const { error } = await adsTable().insert({ stage: s.id, angle: a.id, format, platform, brief: text.slice(0, 3000), output: full.slice(0, 30000) });
    if (error) toast.error("El anuncio está listo, pero no se pudo guardar", { description: "Cópialo antes de salir de esta pantalla." });
    else {
      // Con el quinto anuncio termina la etapa 5: se ofrece el siguiente paso (publicar y medir).
      const fifth = ads.length + 1 === ROUTE.length;
      toast.success(fifth ? "¡Tienes tus 5 anuncios!" : "Anuncio listo.", fifth && onNavigate
        ? { description: "Publícalos y a los 3 días anota sus números.", action: { label: "Resultados →", onClick: () => onNavigate("Resultados") } }
        : { description: "Cuando lo publiques, anota sus números en Resultados." });
      loadAds();
    }
  };

  const createSequence = async () => {
    if (!requireBrief()) return;
    setOutputAt(null);
    await stream("mandala-sequence", "Mándala · Secuencia de 4 etapas", `${sequencePrompt(angle, format, platform)}\n${businessHint(brief)}\n${copyLevelHint(brief)}\n\nOFERTA DEL USUARIO:\n${briefText(brief).slice(0, 2500)}`);
  };

  const iterate = async (ad: AdRow) => {
    setOutputAt(null);
    const full = await stream("mandala-iterate", `Mándala · Variaciones del ganador`, `${iteratePrompt(ad)}\n${copyLevelHint(brief)}`);
    if (full) { document.getElementById("mandala-output")?.scrollIntoView({ behavior: "smooth" }); }
  };

  const updateAd = async (id: string, patch: Partial<AdRow>) => {
    setAds(list => list.map(a => (a.id === id ? { ...a, ...patch } : a)));
    const { error } = await adsTable().update(patch).eq("id", id);
    if (error) { toast.error("No se pudo guardar el cambio. Inténtalo de nuevo."); loadAds(); }
  };
  const deleteAd = async (id: string) => {
    if (!window.confirm("¿Borrar este anuncio? No se puede recuperar.")) return;
    const { error } = await adsTable().delete().eq("id", id);
    if (error) toast.error("No se pudo borrar. Inténtalo de nuevo."); else setAds(list => list.filter(a => a.id !== id));
  };

  const toMediaStudio = (text: string) => {
    // Media Studio lee este guion al abrir. Se manda solo el texto hablado aproximado: la sección del anuncio.
    const m = text.match(/## El anuncio\s*([\s\S]*?)(\n## |$)/);
    const script = (m ? m[1] : text).replace(/\*\*|__|#+ /g, "").replace(/\[[^\]]*\]|\([^)]*\d+:\d+[^)]*\)|\d+:\d+\s*[-–—]?/g, "").trim();
    try { localStorage.setItem("supernova_media_prefill", script.slice(0, 1200)); } catch { /* sin almacenamiento */ }
    window.location.hash = "#/media-studio";
  };

  const adCost = generatorCost("mandala-ad").cost;
  const seqCost = generatorCost("mandala-sequence").cost;
  const iterCost = generatorCost("mandala-iterate").cost;
  const total = STAGES.length * ANGLES.length;
  const routeDone = ROUTE.filter(r => done.has(`${r.stage}:${r.angle}`)).length;

  const Btn = ({ onClick, children, primary, disabled }: { onClick: () => void; children: ReactNode; primary?: boolean; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled || loading}
      className={primary
        ? "inline-flex items-center gap-2 rounded-lg gradient-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        : "inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:border-primary/60 disabled:opacity-60"}>
      {children}
    </button>
  );

  const measured = ads.some(a => a.spend != null || a.status === "ganador" || a.status === "descartado");
  const briefDone = briefReady(brief);
  const setupOk = setupDone || ads.length > 0;
  const autoStep = !briefDone ? 1 : !setupOk ? 2 : routeDone < ROUTE.length ? 3 : !measured ? 4 : 5;
  const step = openStep ?? autoStep;
  const nextRoute = ROUTE.findIndex(r => !done.has(`${r.stage}:${r.angle}`));
  const routeOpen = routePick ?? (nextRoute === -1 ? 0 : nextRoute);
  const openStepN = (n: number) => {
    setOpenStep(n === autoStep ? null : n);
  };

  // Resumen de "Mi negocio": la ficha se edita en su página, aquí solo se muestra.
  const businessSummary = () => (
    <div className="card-surface rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
          {briefReady(brief) ? <Check className="w-4 h-4 text-emerald-400" /> : <span className="text-primary">Primero ·</span>} Tu negocio
        </p>
        <p className="text-xs text-muted-foreground truncate">{briefReady(brief) ? `${brief.product} · ${brief.who}` : "Cuéntanos qué vendes, para quién y qué logra: todos tus anuncios salen de ahí."}</p>
      </div>
      <Btn onClick={() => onNavigate?.("Mi negocio")}>{briefReady(brief) ? "Editar en Mi negocio" : "Llenar Mi negocio →"}</Btn>
    </div>
  );

  // Dónde y cómo se publica: cambia "cómo publicarlo", no la idea.
  const pickers = () => (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">¿Dónde lo vas a publicar?</p>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map(p => (
            <button key={p.id} onClick={() => setPlatform(p.id)}
              className={`rounded-full border px-3 py-1.5 text-xs ${platform === p.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">¿Qué tipo de anuncio?</p>
        <div className="flex flex-wrap gap-2">
          {FORMATS.filter(f => canSee("Media Studio") || !/avatar/i.test(f)).map(f => (
            <button key={f} onClick={() => setFormat(f)}
              className={`rounded-full border px-3 py-1.5 text-xs ${format === f ? "border-foreground/60 bg-secondary text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {f}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const outputPanel = () => (
    <div id="mandala-output" className="card-surface rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="font-semibold text-foreground text-sm">{outputTitle || "Resultado"}</h3>
        {output && !loading && (
          <div className="flex gap-3">
            {canSee("Media Studio") && /video|avatar/i.test(format) && (
              <button onClick={() => toMediaStudio(output)} className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                <Video className="w-3.5 h-3.5" /> Hacer el video con avatar (Media Studio)
              </button>
            )}
            <button onClick={() => { navigator.clipboard.writeText(output); toast.success("Copiado. Ya puedes pegarlo."); }}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <Copy className="w-3.5 h-3.5" /> Copiar
            </button>
          </div>
        )}
      </div>
      <div className="prose prose-sm prose-invert max-w-none text-foreground">
        {output ? <ReactMarkdown>{output}</ReactMarkdown> : <p className="text-muted-foreground text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Escribiendo tu anuncio…</p>}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {isResults ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs uppercase tracking-wider text-primary font-semibold">Mi negocio · Etapa 6</p>
          <h1 className="font-display font-bold text-2xl text-foreground">Resultados de tus anuncios</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            A los 3 días de publicar, anota gasto, CTR y ventas: te decimos si apagar, esperar o escalar.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Btn onClick={() => onNavigate?.("Mándala")}><Sparkles className="w-4 h-4" /> Crear más anuncios</Btn>
            <Btn onClick={() => onNavigate?.("Recuperar")}>Recuperar ventas por WhatsApp →</Btn>
          </div>
        </div>
      ) : (
      <div className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wider text-primary font-semibold">Mi negocio · Etapa 5</p>
        <h1 className="font-display font-bold text-2xl text-foreground">Mándala Creativa</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          La IA te escribe tus primeros {ROUTE.length} anuncios, uno por uno. {adCost} créditos cada uno.
        </p>
      </div>
      )}

      {/* Modos (en Resultados no hay pestañas: es solo la lista de anuncios) */}
      {!isResults && <div className="flex gap-1 rounded-xl bg-secondary/60 p-1 w-full sm:w-fit overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {([
          ["ruta", Route, `Paso a paso · vas en el ${autoStep} de 5`],
          ["rueda", Orbit, "Rueda libre"],
        ] as const).map(([id, Icon, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ${tab === id ? "bg-card text-foreground shadow" : "text-muted-foreground"}`}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
        <button onClick={() => (onNavigate ? onNavigate("Resultados") : setTab("mis"))}
          className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground">
          <ListChecks className="w-3.5 h-3.5" /> Resultados ({ads.length}) →
        </button>
      </div>}

      {tab !== "ruta" && (
        <>
          {!isResults && businessSummary()}
          {tab === "rueda" && (
            <>
              <p className="text-xs text-muted-foreground max-w-2xl">
                Para cuando ya hiciste el Paso a paso o te quedaste sin ideas. Cada anuncio junta una etapa (a quién le hablas) con un ángulo
                (cómo lo cuentas): gira la rueda para que te toque una combinación que aún no hiciste, o toca la que quieras.
              </p>
              {pickers()}
            </>
          )}
          {tab === "mis" && ads.length > 0 && (
            <p className="text-xs text-muted-foreground max-w-2xl">
              Cuando publiques un anuncio, cambia su estado a Publicado y anota cuánto gastaste, su CTR y las ventas. Debajo verás qué hacer:
              apagarlo, esperar o escalarlo.
            </p>
          )}
        </>
      )}

      {tab === "ruta" && (
        <div className="space-y-3">
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden" aria-hidden>
            <div className="h-full gradient-brand transition-all" style={{ width: `${((Math.min(autoStep, 5) - 1) / 4) * 100}%` }} />
          </div>

          <Step n={1} title="Tu negocio" done={briefDone} active={step === 1} onOpen={() => openStepN(1)}
            summary={briefReady(brief) ? `${brief.product} · ${brief.who}` : "Llénalo en Mi negocio: qué vendes, para quién y qué logra."}>
            <p className="text-sm text-muted-foreground">Todos tus anuncios salen de tu ficha de negocio. La llenas una vez en Mi negocio y la usan todas las herramientas.</p>
            {businessSummary()}
            {briefDone && <Btn primary onClick={() => setOpenStep(null)}>Siguiente paso →</Btn>}
          </Step>

          <Step n={2} title="Elige dónde lo vas a publicar" done={setupOk && briefDone} active={step === 2} onOpen={() => openStepN(2)}
            summary={`${PLATFORMS.find(p => p.id === platform)?.label} · ${format}`}>
            <p className="text-sm text-muted-foreground">La idea del anuncio no cambia; esto ajusta el formato y los pasos para publicarlo. Si no sabes cuál elegir, deja Meta (Facebook/Instagram) y Video corto.</p>
            {pickers()}
            <Btn primary onClick={confirmSetup}>Siguiente paso →</Btn>
          </Step>

          <Step n={3} title={`Crea tus ${ROUTE.length} anuncios, uno por uno`} done={routeDone >= ROUTE.length} active={step === 3} onOpen={() => openStepN(3)}
            summary={`Llevas ${routeDone} de ${ROUTE.length} anuncios creados`}>
            <p className="text-sm text-muted-foreground">
              Van en este orden porque con poco presupuesto primero hay que vender: 3 anuncios para quien no te conoce y 2 para quien visitó tu página y no compró.
              La IA escribe cada uno completo ({adCost} créditos por anuncio) y se guardan solos; sus números se anotan en Resultados.
            </p>
            <div className="space-y-2">
              {ROUTE.map((r, i) => {
                const s = stageById(r.stage), a = angleById(r.angle), key = `${r.stage}:${r.angle}`, isDone = done.has(key);
                const isOpen = i === routeOpen;
                return (
                  <div key={key} className={`rounded-xl border ${isOpen ? "border-primary/40 bg-secondary/30" : "border-border"}`}>
                    <button onClick={() => setRoutePick(i)} className="w-full flex items-center gap-2 p-3 text-left">
                      {isDone ? <Check className="w-4 h-4 text-emerald-400 shrink-0" /> : <span className="w-4 text-xs text-muted-foreground shrink-0">{i + 1}.</span>}
                      <span className={`text-sm ${isOpen ? "font-semibold text-foreground" : "text-muted-foreground"}`}>Anuncio {i + 1}: {a.name}</span>
                      <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full shrink-0" style={{ background: `${s.color}22`, color: s.color }}>
                        {s.id === "recuperar" ? "Para quien casi compra" : "Para vender"}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-3 space-y-3">
                        <p className="text-sm text-foreground">{r.why}</p>
                        <p className="text-xs text-muted-foreground"><b className="text-foreground">Cómo se cuenta:</b> {a.how}</p>
                        <div className="flex flex-wrap gap-2">
                          <Btn primary={!isDone} onClick={() => { setRoutePick(i); setOpenStep(3); createAd(s, a, key); }}>
                            {loading && outputAt === key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            {isDone ? "Crear otra versión" : `Crear anuncio ${i + 1}`} · {adCost} créditos
                          </Btn>
                          {isDone && !loading && (i < ROUTE.length - 1
                            ? <Btn onClick={() => { setRoutePick(i + 1); setOutputAt(null); }}>Siguiente anuncio →</Btn>
                            : routeDone >= ROUTE.length && <Btn onClick={() => { setOpenStep(null); setOutputAt(null); }}>Siguiente paso: publicar →</Btn>)}
                        </div>
                        {(output || loading) && outputAt === key && outputPanel()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {routeDone > 0 && routeDone < ROUTE.length && (
              <button onClick={() => setOpenStep(4)} className="text-xs text-muted-foreground hover:text-foreground underline">
                Ya tengo suficientes, quiero publicar
              </button>
            )}
          </Step>

          <Step n={4} title="Publícalos y anota cómo les va" done={measured} active={step === 4} onOpen={() => openStepN(4)}
            summary="Déjalos correr 3 días y anota cuánto gastaste, los clics y las ventas.">
            {platform === "organico" ? (
              <p className="text-sm text-muted-foreground">Publica uno por día. A los 3 días mira cuál te trajo más mensajes o clics en el enlace y márcalo como Ganador en Resultados.</p>
            ) : (
              <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal pl-4">
                <li>Publica los 3 anuncios "para vender", cada uno con el mismo presupuesto diario, bajo. Cada anuncio trae los pasos para publicarlo.</li>
                <li>Publica los 2 "para quien casi compra" con un presupuesto aún más bajo, mostrados solo a quien visitó tu página.</li>
                <li>No toques nada durante 3 días.</li>
                <li>Anota en cada anuncio cuánto gastaste, su CTR (el % de personas que lo vieron e hicieron clic; lo ves en tu administrador de anuncios) y cuántas ventas trajo. La app te dice cuál apagar y cuál escalar.</li>
              </ol>
            )}
            <Btn primary onClick={() => (onNavigate ? onNavigate("Resultados") : setTab("mis"))}><ListChecks className="w-4 h-4" /> Anotar resultados</Btn>
          </Step>

          <Step n={5} title="Escala el que gana" done={hasWinner} active={step === 5} onOpen={() => openStepN(5)}
            summary="Pide variaciones del que vende y crea anuncios para traer gente nueva.">
            <p className="text-sm text-muted-foreground">
              Cuando cada venta te cuesta en anuncios lo mismo o menos que el precio de tu producto, ese anuncio es tu ganador. No le cambies el mensaje:
              en Resultados pide variaciones (5 ganchos nuevos y 2 versiones, {iterCost} créditos) y sube el presupuesto poco a poco.
              Después usa la Rueda libre en Atraer y Conectar para que te conozca gente nueva.
            </p>
            <div className="flex flex-wrap gap-2">
              <Btn primary onClick={() => (onNavigate ? onNavigate("Resultados") : setTab("mis"))}><Repeat className="w-4 h-4" /> Ver mis anuncios</Btn>
              <Btn onClick={() => setTab("rueda")}><Orbit className="w-4 h-4" /> Ir a la rueda libre</Btn>
            </div>
          </Step>
        </div>
      )}

      {tab === "rueda" && (
        <div className="grid lg:grid-cols-[minmax(0,440px)_1fr] gap-5 items-start">
          <div className="card-surface rounded-2xl p-4 flex flex-col items-center gap-4">
            <svg viewBox="0 0 400 400" className="w-full max-w-[420px] select-none" role="img" aria-label="Mándala Creativa: etapas y ángulos">
              {STAGES.map((s, i) => {
                const a0 = i * 90, a1 = a0 + 90, mid = a0 + 45;
                const [tx, ty] = pt(178, mid);
                const flip = mid > 90 && mid < 270;
                return (
                  <g key={s.id} className="cursor-pointer" onClick={() => setStage(s)}>
                    <path d={ring(160, 196, a0 + 0.6, a1 - 0.6)} fill={s.color} opacity={s.id === stage.id ? 0.95 : 0.35} />
                    <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize="14" fontWeight="700"
                      transform={`rotate(${flip ? mid + 180 : mid} ${tx} ${ty})`} style={{ letterSpacing: "0.12em" }}>
                      {s.name.toUpperCase()}
                    </text>
                  </g>
                );
              })}
              <g style={{ transform: `rotate(${rotation}deg)`, transformOrigin: "200px 200px", transition: "transform 1.3s cubic-bezier(.17,.67,.2,1)" }}>
                {ANGLES.map((a, i) => {
                  const a0 = i * SEG, mid = a0 + SEG / 2;
                  const [tx, ty] = pt(108, mid);
                  // Se decide con la posición final (tras girar) para que el texto nunca quede de cabeza.
                  const left = ((((mid + rotation) % 360) + 360) % 360) > 180;
                  const active = a.id === angle.id;
                  const isDone = done.has(`${stage.id}:${a.id}`);
                  return (
                    <g key={a.id} className="cursor-pointer" onClick={() => !spinning && pick(stage, a)}>
                      <path d={ring(58, 156, a0 + 0.4, a0 + SEG - 0.4)}
                        fill={active ? stage.color : isDone ? `${stage.color}55` : "hsl(var(--secondary))"}
                        stroke="hsl(var(--border))" strokeWidth="0.5" />
                      <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle" fontSize="10.5" fontWeight={active ? 700 : 500}
                        fill={active ? "#fff" : "hsl(var(--foreground))"} transform={`rotate(${left ? mid + 90 : mid - 90} ${tx} ${ty})`}>
                        {a.short}{isDone ? " ✓" : ""}
                      </text>
                    </g>
                  );
                })}
              </g>
              <g className="cursor-pointer" onClick={spin}>
                <circle cx={C} cy={C} r="54" fill="hsl(var(--card))" stroke={stage.color} strokeWidth="3" />
                <text x={C} y={C - 8} textAnchor="middle" fontSize="13" fontWeight="800" fill="hsl(var(--foreground))">VENTA</text>
                <text x={C} y={C + 12} textAnchor="middle" fontSize="10" fill="hsl(var(--muted-foreground))">{spinning ? "girando…" : "toca para girar"}</text>
              </g>
              <path d="M200 50 L192 36 L208 36 Z" fill={stage.color} />
            </svg>
            <div className="flex flex-wrap gap-2 justify-center">
              <Btn primary onClick={spin} disabled={spinning}><Dices className="w-4 h-4" /> Girar la rueda</Btn>
              <Btn onClick={() => pick(challenge.stage, challenge.angle)}><Sparkles className="w-4 h-4 text-primary" /> Reto de hoy</Btn>
            </div>
            <div className="w-full">
              <p className="text-xs text-muted-foreground mb-1.5">Llevas {done.size} de {total} combinaciones posibles (etapa × ángulo). Cada cuadro es un anuncio distinto.</p>
              <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${ANGLES.length}, minmax(0,1fr))` }}>
                {STAGES.flatMap(s => ANGLES.map(a => {
                  const k = `${s.id}:${a.id}`, on = done.has(k), sel = s.id === stage.id && a.id === angle.id;
                  return (
                    <button key={k} title={`${s.name} × ${a.name}`} aria-label={`${s.name} × ${a.name}`} onClick={() => pick(s, a)} className="aspect-square rounded-[3px]"
                      style={{ background: on ? s.color : "hsl(var(--secondary))", outline: sel ? `2px solid ${s.color}` : "none", outlineOffset: 1 }} />
                  );
                }))}
              </div>
            </div>
          </div>

          <div className="card-surface rounded-2xl p-5 space-y-3 min-w-0" style={{ borderColor: `${stage.color}66` }}>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider">
              <span className="px-2 py-1 rounded-md text-white" style={{ background: stage.color }}>Etapa · {stage.name}</span>
              <span className="text-muted-foreground">×</span>
              <span className="px-2 py-1 rounded-md bg-secondary text-foreground">Ángulo · {angle.name}</span>
            </div>
            <p className="text-sm text-foreground"><b>Para qué:</b> {stage.goal}</p>
            <p className="text-sm text-muted-foreground"><b className="text-foreground">Cómo:</b> {angle.how}</p>
            <div className="grid sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
              <p className="rounded-lg bg-secondary/60 p-2.5"><b className="text-foreground">Dónde:</b> {stage.setup[platform]}</p>
              <p className="rounded-lg bg-secondary/60 p-2.5"><b className="text-foreground">A quién:</b> {stage.audience}</p>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Btn primary onClick={() => createAd(stage, angle)}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Crear este anuncio · {adCost} créditos
              </Btn>
              <Btn onClick={createSequence}><Layers className="w-4 h-4 text-primary" /> Crear 4 anuncios en cadena, uno por etapa · {seqCost} créditos</Btn>
            </div>
          </div>
        </div>
      )}

      {tab === "mis" && (
        <div className="space-y-3">
          {ads.length === 0 && (
            <div className="card-surface rounded-xl p-6 text-center text-sm text-muted-foreground">
              Todavía no has creado anuncios. Empieza por el <button className="text-primary hover:underline" onClick={() => (onNavigate ? onNavigate("Mándala") : setTab("ruta"))}>Paso a paso de la Mándala</button>: te guía para crear tus primeros {ROUTE.length}.
            </div>
          )}
          {ads.map(ad => {
            const s = stageById(ad.stage), a = angleById(ad.angle), v = verdict(ad, price, maxSale), open = openAd === ad.id;
            return (
              <div key={ad.id} className="card-surface rounded-xl p-4 space-y-3" style={{ borderLeft: `3px solid ${s.color}` }}>
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <button className="text-left min-w-0" onClick={() => setOpenAd(open ? null : ad.id)}>
                    <p className="text-sm font-semibold text-foreground">{s.name} × {a.name}</p>
                    <p className="text-xs text-muted-foreground">{ad.format} · {PLATFORMS.find(p => p.id === ad.platform)?.label} · {new Date(ad.created_at).toLocaleDateString("es")}</p>
                  </button>
                  <select value={ad.status} onChange={e => updateAd(ad.id, { status: e.target.value as AdRow["status"] })}
                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground">
                    <option value="borrador">Borrador</option>
                    <option value="publicado">Publicado</option>
                    <option value="ganador">Ganador</option>
                    <option value="descartado">Descartado</option>
                  </select>
                </div>
                {ad.platform !== "organico" && ad.status !== "borrador" && (
                  <div className="grid grid-cols-3 gap-2">
                    {([["spend", "Gastado (USD)"], ["ctr", "CTR (% de clics)"], ["sales", "Ventas"]] as const).map(([k, label]) => (
                      <label key={k} className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                        {label}
                        <input type="number" min="0" step={k === "sales" ? "1" : "0.01"} inputMode="decimal"
                          defaultValue={ad[k] ?? ""}
                          onBlur={e => {
                            const n = e.target.value === "" ? null : Math.max(0, Number(e.target.value));
                            const val = n == null || Number.isNaN(n) ? null : k === "sales" ? Math.round(n) : k === "ctr" ? Math.min(100, n) : n;
                            if (val !== ad[k]) updateAd(ad.id, { [k]: val } as Partial<AdRow>);
                          }}
                          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground" />
                      </label>
                    ))}
                  </div>
                )}
                {v && (
                  <p className={`text-xs rounded-lg p-2.5 ${v.tone === "good" ? "bg-emerald-500/10 text-emerald-300" : v.tone === "bad" ? "bg-red-500/10 text-red-300" : v.tone === "fix" ? "bg-amber-500/10 text-amber-200" : "bg-secondary text-muted-foreground"}`}>
                    {v.tone === "fix" && <AlertTriangle className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />}{v.text}
                    {!maxSale && (price ? " (Haz tus números en la calculadora de precio para juzgarlo con lo que de verdad te queda por venta.)" : " (Pon el precio de tu producto en Mi negocio para que el veredicto sea más preciso.)")}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Btn onClick={() => setOpenAd(open ? null : ad.id)}>{open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />} {open ? "Ocultar" : "Ver anuncio"}</Btn>
                  {(ad.status === "ganador" || v?.tone === "good") && (
                    <Btn primary onClick={() => iterate(ad)}><Repeat className="w-4 h-4" /> 5 ganchos nuevos + 2 versiones · {iterCost} créditos</Btn>
                  )}
                  {canSee("Media Studio") && /video|avatar/i.test(ad.format) && <Btn onClick={() => toMediaStudio(ad.output)}><Video className="w-4 h-4" /> Hacer el video con avatar</Btn>}
                  <button onClick={() => { navigator.clipboard.writeText(ad.output); toast.success("Copiado. Ya puedes pegarlo."); }} className="p-2.5 text-muted-foreground hover:text-foreground" aria-label="Copiar anuncio"><Copy className="w-4 h-4" /></button>
                  <button onClick={() => deleteAd(ad.id)} className="p-2.5 text-muted-foreground hover:text-red-400" aria-label="Borrar anuncio"><Trash2 className="w-4 h-4" /></button>
                </div>
                {open && <div className="prose prose-sm prose-invert max-w-none text-foreground border-t border-border pt-3"><ReactMarkdown>{ad.output}</ReactMarkdown></div>}
              </div>
            );
          })}
        </div>
      )}

      {(output || loading) && outputAt === null && outputPanel()}
    </div>
  );
}
