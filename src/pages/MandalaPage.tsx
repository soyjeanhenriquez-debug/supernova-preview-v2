import { useEffect, useMemo, useState } from "react";
import { Copy, Dices, Loader2, Sparkles, Layers, RotateCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits, generatorCost } from "@/hooks/useCredits";
import { fnHeaders, fnErrorMessage, readBilling } from "@/lib/fnAuth";

/**
 * Mándala Creativa: la rueda para no quedarse nunca sin ideas de anuncios.
 * Cruza 4 ETAPAS (a quién le hablas y qué le pides a Meta) con 18 ÁNGULOS
 * (cómo lo cuentas). Cada cruce es un anuncio distinto → 72 anuncios por oferta.
 * La técnica es la limitación creativa: la rueda te da la restricción y la
 * restricción te obliga a crear algo nuevo en vez de repetir el mismo anuncio.
 */

type Stage = { id: string; name: string; color: string; goal: string; meta: string; audience: string };
type Angle = { id: string; name: string; short: string; how: string };

const STAGES: Stage[] = [
  {
    id: "atraer", name: "Atraer", color: "#3B82F6",
    goal: "Que gente nueva que nunca te vio se identifique con tu mensaje. Aquí no vendes: haces que te noten.",
    meta: "Objetivo de reconocimiento o interacción (reproducciones de video). Pides a Meta que encuentre gente que se identifica.",
    audience: "Público amplio o intereses del nicho. Gente fría.",
  },
  {
    id: "conectar", name: "Conectar", color: "#A1A1AA",
    goal: "Educar y ganar confianza: que crean en ti y en que tu método funciona.",
    meta: "Objetivo de interacción o tráfico, mostrado a quien ya vio tus videos o te sigue.",
    audience: "Quienes vieron el 50% de tus videos, interactuaron o te siguen.",
  },
  {
    id: "convertir", name: "Convertir", color: "#8B5CF6",
    goal: "Vender a quien ya está listo para comprar. Oferta clara, precio, garantía y botón.",
    meta: "Objetivo de ventas (conversión en compra). Meta busca a los que están listos para comprar.",
    audience: "Público amplio optimizado a compra + los que ya te conocen.",
  },
  {
    id: "recuperar", name: "Recuperar", color: "#14B8A6",
    goal: "Perseguir a quien visitó la página o el checkout y no compró, hasta que decida.",
    meta: "Objetivo de ventas con públicos personalizados (remarketing), presupuesto pequeño y constante.",
    audience: "Visitaron la página, iniciaron el pago o vieron la VSL y no compraron (últimos 7-30 días).",
  },
];

const ANGLES: Angle[] = [
  { id: "oportunidad", name: "Oportunidad", short: "Oportunidad", how: "Muestra algo que está pasando ahora y que pocos aprovechan." },
  { id: "explicacion", name: "Explicación", short: "Explicación", how: "Explica en simple cómo funciona algo que parece complicado." },
  { id: "reflexion", name: "Reflexión", short: "Reflexión", how: "Una pregunta o idea que hace pensar al espectador sobre su situación." },
  { id: "ultrasegmentado", name: "Ultrasegmentado", short: "Ultrasegm.", how: "Háblale a un grupo muy concreto: \"Si eres mamá, tienes 35 y…\"." },
  { id: "historia", name: "Historia", short: "Historia", how: "Una historia real y corta: antes, el giro y el después." },
  { id: "contraste", name: "Contraste", short: "Contraste", how: "Pon dos realidades lado a lado: con y sin tu solución." },
  { id: "mito", name: "Mito", short: "Mito", how: "Derriba una creencia falsa del nicho." },
  { id: "sensacion", name: "Sensación", short: "Sensación", how: "Haz que sienta el resultado: cómo se ve, se siente o suena." },
  { id: "titular-intrigante", name: "Titular intrigante", short: "Intriga", how: "Un titular que obliga a mirar, pero que el anuncio cumple (nada engañoso)." },
  { id: "dilema", name: "Dilema", short: "Dilema", how: "Pon al espectador ante dos caminos y que elija." },
  { id: "visual", name: "Visual", short: "Visual", how: "La imagen cuenta todo: una demostración o un objeto que llama la atención." },
  { id: "correcto-incorrecto", name: "Forma correcta vs. incorrecta", short: "Bien vs mal", how: "Muestra cómo lo hace casi todo el mundo y cómo se hace bien." },
  { id: "emocional", name: "Llamado emocional", short: "Emoción", how: "Toca lo que de verdad le importa: familia, orgullo, miedo, libertad." },
  { id: "comparacion", name: "Comparación", short: "Comparación", how: "Compara tu solución con las alternativas que ya conoce." },
  { id: "urgencia-oculta", name: "Urgencia oculta", short: "Urgencia", how: "Muestra lo que pierde cada día que no actúa (sin inventar plazos)." },
  { id: "problema-solucion", name: "Problema → solución", short: "Problema", how: "Nombra el problema con sus palabras y presenta la salida." },
  { id: "curiosidad", name: "Curiosidad", short: "Curiosidad", how: "Abre un hueco de información que solo se cierra viendo o haciendo clic." },
  { id: "prueba", name: "Prueba", short: "Prueba", how: "Resultados, testimonios reales, capturas o una demostración en vivo." },
];

const FORMATS = ["Video corto (Reels/TikTok)", "Imagen", "Carrusel", "Video con avatar (Media Studio)"];

const RULES = `Escribe en español neutro, para alguien que empieza. Frases cortas. Usa títulos con ## y listas. No inventes testimonios, cifras ni plazos: si hace falta una prueba, di qué prueba conseguir. Nada de promesas de ingresos garantizados.`;

function adPrompt(stage: Stage, angle: Angle, format: string) {
  return `Eres un creativo de anuncios de respuesta directa para Meta Ads en LATAM. Usas la Mándala Creativa: cada anuncio cruza una ETAPA del embudo con un ÁNGULO creativo. La limitación es a propósito: obliga a crear algo distinto.

ETAPA: ${stage.name} — ${stage.goal}
Configuración en Meta: ${stage.meta}
Público: ${stage.audience}
ÁNGULO: ${angle.name} — ${angle.how}
FORMATO: ${format}

Entrega exactamente:
## 3 ganchos (primeros 3 segundos o titular de la imagen)
## El anuncio
${/video|avatar/i.test(format) ? "Guion hablado con marcas de tiempo (máximo 45 segundos; si es para avatar, máximo 160 palabras)." : format === "Carrusel" ? "Texto de cada tarjeta (5 tarjetas) y qué imagen lleva cada una." : "Descripción exacta de la imagen y el texto que va encima."}
## Texto principal del anuncio (el copy de arriba)
## Titular y botón
## Cómo publicarlo
Objetivo en Meta, público y presupuesto diario orientativo para probarlo.
## Siguiente giro
Qué ángulo probar después en esta misma etapa y por qué.

${RULES}`;
}

function sequencePrompt(angle: Angle, format: string) {
  return `Eres un media buyer y creativo de respuesta directa. Usa la Mándala Creativa para armar una SECUENCIA DE 4 ANUNCIOS, uno por etapa, que lleven a una persona desde que no te conoce hasta que compra.

Ángulo base elegido por el usuario: ${angle.name} (${angle.how}). Úsalo en al menos una etapa y elige para las demás el ángulo que mejor funcione, diciendo cuál es.
Formato principal: ${format}

${STAGES.map((s, i) => `ETAPA ${i + 1}: ${s.name} — ${s.goal} Meta: ${s.meta} Público: ${s.audience}`).join("\n")}

Para cada etapa entrega:
## Etapa N: [nombre] · Ángulo: [ángulo]
- Gancho
- Guion o descripción del creativo
- Texto principal
- Público exacto y objetivo en Meta

Al final:
## Cómo pasan las personas de una etapa a la siguiente
Públicos personalizados que conectan cada etapa (quién vio qué, cuántos días).
## Reparto del presupuesto
Porcentaje orientativo por etapa para empezar, aclarando que se ajusta con los datos.

${RULES}`;
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

// El "reto del día" es el mismo para todos ese día: una restricción concreta para crear hoy.
function dailyChallenge() {
  const d = new Date();
  const n = d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate();
  return { stage: STAGES[n % STAGES.length], angle: ANGLES[(n * 7) % ANGLES.length] };
}

export function MandalaPage() {
  const { user } = useAuth();
  const { applyServerCharge, canAfford } = useCredits();
  const storeKey = `sn_mandala_${user?.id ?? "anon"}`;

  const [stage, setStage] = useState<Stage>(STAGES[0]);
  const [angle, setAngle] = useState<Angle>(ANGLES[0]);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [product, setProduct] = useState("");
  const [format, setFormat] = useState(FORMATS[0]);
  const [done, setDone] = useState<string[]>([]);
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const challenge = useMemo(dailyChallenge, []);

  // El producto y el progreso son comodidades de este navegador; si el almacenamiento falla, la página sigue funcionando.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) || "{}");
      if (typeof saved.product === "string") setProduct(saved.product);
      if (Array.isArray(saved.done)) setDone(saved.done.filter((x: unknown) => typeof x === "string"));
    } catch { /* sin almacenamiento */ }
  }, [storeKey]);
  const persist = (next: { product?: string; done?: string[] }) => {
    try { localStorage.setItem(storeKey, JSON.stringify({ product, done, ...next })); } catch { /* sin almacenamiento */ }
  };

  const pick = (s: Stage, a: Angle) => { setStage(s); setAngle(a); };

  const spin = () => {
    if (spinning) return;
    // Prefiere cruces que todavía no has creado: la gracia es no repetir.
    const pending = STAGES.flatMap(s => ANGLES.map(a => ({ s, a }))).filter(({ s, a }) => !done.includes(`${s.id}:${a.id}`));
    const pool = pending.length ? pending : STAGES.flatMap(s => ANGLES.map(a => ({ s, a })));
    const next = pool[Math.floor(Math.random() * pool.length)];
    const idx = ANGLES.indexOf(next.a);
    // Gira varias vueltas y deja el ángulo elegido arriba.
    const target = -(idx * SEG + SEG / 2);
    setRotation(r => r - (((r - target) % 360) + 360) % 360 - 720);
    setSpinning(true);
    setTimeout(() => { pick(next.s, next.a); setSpinning(false); }, 1300);
  };

  const run = async (mode: "ad" | "sequence") => {
    if (!product.trim()) { toast.error("Describe tu producto u oferta primero"); return; }
    const id = mode === "ad" ? "mandala-ad" : "mandala-sequence";
    const title = mode === "ad" ? `Mándala · ${stage.name} × ${angle.name}` : "Mándala · Secuencia de 4 etapas";
    const { action } = generatorCost(id);
    if (!canAfford(action)) { toast.error("Sin créditos suficientes", { description: "Recarga tu saldo o espera al próximo ciclo." }); return; }
    setLoading(true);
    setOutput("");
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`, {
        method: "POST",
        headers: await fnHeaders(),
        body: JSON.stringify({
          generator_id: id,
          generator_title: title,
          messages: [{
            role: "user",
            content: `${mode === "ad" ? adPrompt(stage, angle, format) : sequencePrompt(angle, format)}\n\nPRODUCTO / OFERTA DEL USUARIO:\n${product.slice(0, 2000)}`,
          }],
        }),
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
      const keys = mode === "ad" ? [`${stage.id}:${angle.id}`] : [];
      if (keys.length) {
        const nextDone = Array.from(new Set([...done, ...keys]));
        setDone(nextDone);
        persist({ done: nextDone });
      }
      toast.success("¡Anuncio creado!");
    } catch (err: unknown) {
      toast.error(err instanceof Error && err.message ? err.message : "Error al generar");
    } finally {
      setLoading(false);
    }
  };

  const total = STAGES.length * ANGLES.length;
  const adCost = generatorCost("mandala-ad").cost;
  const seqCost = generatorCost("mandala-sequence").cost;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display font-bold text-2xl text-foreground">Mándala Creativa</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Nunca más "no sé qué anuncio hacer". Cada anuncio cruza una <b className="text-foreground">etapa</b> (a quién le hablas)
          con un <b className="text-foreground">ángulo</b> (cómo lo cuentas): {total} anuncios distintos para la misma oferta.
          Gira la rueda, acepta la restricción y crea.
        </p>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,440px)_1fr] gap-6 items-start">
        {/* Rueda */}
        <div className="card-surface rounded-2xl p-4 flex flex-col items-center gap-4">
          <svg viewBox="0 0 400 400" className="w-full max-w-[420px] select-none" role="img" aria-label="Mándala Creativa: etapas y ángulos">
            {/* Anillo exterior: etapas */}
            {STAGES.map((s, i) => {
              const a0 = i * 90, a1 = a0 + 90, mid = a0 + 45;
              const [tx, ty] = pt(178, mid);
              const flip = mid > 90 && mid < 270;
              const active = s.id === stage.id;
              return (
                <g key={s.id} className="cursor-pointer" onClick={() => setStage(s)}>
                  <path d={ring(160, 196, a0 + 0.6, a1 - 0.6)} fill={s.color} opacity={active ? 0.95 : 0.35} />
                  <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize="14" fontWeight="700"
                    transform={`rotate(${flip ? mid + 180 : mid} ${tx} ${ty})`} style={{ letterSpacing: "0.12em" }}>
                    {s.name.toUpperCase()}
                  </text>
                </g>
              );
            })}
            {/* Anillo interior: ángulos (gira) */}
            <g style={{ transform: `rotate(${rotation}deg)`, transformOrigin: "200px 200px", transition: spinning ? "transform 1.3s cubic-bezier(.17,.67,.2,1)" : "none" }}>
              {ANGLES.map((a, i) => {
                const a0 = i * SEG, mid = a0 + SEG / 2;
                const [tx, ty] = pt(108, mid);
                // Se decide con la posición final (tras girar) para que el texto nunca quede de cabeza.
                const left = ((((mid + rotation) % 360) + 360) % 360) > 180;
                const active = a.id === angle.id;
                const isDone = done.includes(`${stage.id}:${a.id}`);
                return (
                  <g key={a.id} className="cursor-pointer" onClick={() => !spinning && setAngle(a)}>
                    <path d={ring(58, 156, a0 + 0.4, a0 + SEG - 0.4)}
                      fill={active ? stage.color : isDone ? `${stage.color}55` : "hsl(var(--secondary))"}
                      stroke="hsl(var(--border))" strokeWidth="0.5" />
                    <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle" fontSize="10.5" fontWeight={active ? 700 : 500}
                      fill={active ? "#fff" : "hsl(var(--foreground))"}
                      transform={`rotate(${left ? mid + 90 : mid - 90} ${tx} ${ty})`}>
                      {a.short}{isDone ? " ✓" : ""}
                    </text>
                  </g>
                );
              })}
            </g>
            {/* Centro */}
            <g className="cursor-pointer" onClick={spin}>
              <circle cx={C} cy={C} r="54" fill="hsl(var(--card))" stroke={stage.color} strokeWidth="3" />
              <text x={C} y={C - 8} textAnchor="middle" fontSize="13" fontWeight="800" fill="hsl(var(--foreground))">VENTA</text>
              <text x={C} y={C + 12} textAnchor="middle" fontSize="10" fill="hsl(var(--muted-foreground))">{spinning ? "girando…" : "toca para girar"}</text>
            </g>
            {/* Marcador arriba */}
            <path d="M200 50 L192 36 L208 36 Z" fill={stage.color} />
          </svg>

          <div className="flex flex-wrap gap-2 justify-center">
            <button onClick={spin} disabled={spinning}
              className="inline-flex items-center gap-2 rounded-lg gradient-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              <Dices className="w-4 h-4" /> Girar la rueda
            </button>
            <button onClick={() => pick(challenge.stage, challenge.angle)}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:border-primary/60">
              <Sparkles className="w-4 h-4 text-primary" /> Reto de hoy
            </button>
          </div>

          {/* Progreso: cuántos cruces ya creaste */}
          <div className="w-full">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span>Tu mándala: {done.length} de {total} anuncios creados</span>
              {done.length > 0 && (
                <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => { setDone([]); persist({ done: [] }); }}>
                  <RotateCcw className="w-3 h-3" /> reiniciar
                </button>
              )}
            </div>
            <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${ANGLES.length}, minmax(0,1fr))` }}>
              {STAGES.flatMap(s => ANGLES.map(a => {
                const k = `${s.id}:${a.id}`, on = done.includes(k), sel = s.id === stage.id && a.id === angle.id;
                return (
                  <button key={k} title={`${s.name} × ${a.name}`} onClick={() => pick(s, a)}
                    className="aspect-square rounded-[3px]"
                    style={{ background: on ? s.color : "hsl(var(--secondary))", outline: sel ? `2px solid ${s.color}` : "none", outlineOffset: 1 }} />
                );
              }))}
            </div>
          </div>
        </div>

        {/* Panel de creación */}
        <div className="space-y-4 min-w-0">
          <div className="card-surface rounded-2xl p-5 space-y-3" style={{ borderColor: `${stage.color}66` }}>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider">
              <span className="px-2 py-1 rounded-md text-white" style={{ background: stage.color }}>Etapa · {stage.name}</span>
              <span className="text-muted-foreground">×</span>
              <span className="px-2 py-1 rounded-md bg-secondary text-foreground">Ángulo · {angle.name}</span>
            </div>
            <p className="text-sm text-foreground"><b>Para qué:</b> {stage.goal}</p>
            <p className="text-sm text-muted-foreground"><b className="text-foreground">Cómo:</b> {angle.how}</p>
            <div className="grid sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
              <p className="rounded-lg bg-secondary/60 p-2.5"><b className="text-foreground">En Meta:</b> {stage.meta}</p>
              <p className="rounded-lg bg-secondary/60 p-2.5"><b className="text-foreground">Público:</b> {stage.audience}</p>
            </div>
          </div>

          <div className="card-surface rounded-2xl p-5 space-y-3">
            <label className="text-sm font-semibold text-foreground" htmlFor="mandala-product">Tu producto u oferta</label>
            <textarea id="mandala-product" value={product} rows={3}
              onChange={e => setProduct(e.target.value)} onBlur={() => persist({ product })}
              placeholder="Ej.: Curso de repostería para vender desde casa, $27, para mamás que quieren ingresos extra. Garantía de 7 días."
              className="w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60" />
            <div className="flex flex-wrap gap-2">
              {FORMATS.map(f => (
                <button key={f} onClick={() => setFormat(f)}
                  className={`rounded-full border px-3 py-1.5 text-xs ${format === f ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  {f}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button onClick={() => run("ad")} disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg gradient-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Crear este anuncio · {adCost} ⚡
              </button>
              <button onClick={() => run("sequence")} disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:border-primary/60 disabled:opacity-60">
                <Layers className="w-4 h-4 text-primary" /> Secuencia de las 4 etapas · {seqCost} ⚡
              </button>
            </div>
          </div>

          {(output || loading) && (
            <div className="card-surface rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-foreground text-sm">Resultado</h3>
                {output && (
                  <button onClick={() => { navigator.clipboard.writeText(output); toast.success("Copiado"); }}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                    <Copy className="w-3.5 h-3.5" /> Copiar
                  </button>
                )}
              </div>
              <div className="prose prose-sm prose-invert max-w-none text-foreground">
                {output ? <ReactMarkdown>{output}</ReactMarkdown> : <p className="text-muted-foreground text-sm">Creando…</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
