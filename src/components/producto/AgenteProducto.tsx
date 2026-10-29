import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Check, Copy, Download, Loader2, Pencil, RotateCcw, Send, Sparkles, Square } from "lucide-react";
import { toast } from "sonner";
import type { BusinessProfile } from "@/lib/businessProfile";
import { useBrandDna } from "@/lib/brandDna";
import { getUserCountry } from "@/components/offers/userCountry";
import type { CreditAction } from "@/hooks/useCredits";
import type { useProductBuilds } from "@/hooks/useProductBuilds";
import type { ServerBilling } from "@/lib/fnAuth";
import { TOOL_BY_ID, openTool } from "@/lib/tools";
import {
  builderCall, exportMarkdown, isPieceDone, printBuild,
  type Build, type BuilderError, type BuilderModel, type Piece,
} from "@/lib/productBuilder";
import {
  ajustesFinales, armarPlan, deducir, instruccionesParte, interpretarAjuste, notasIndice, otroEnfoque, pedidoIndice,
  preguntasPendientes, recetasEscritas, textoPaginaVenta, textoWhatsApp, GENERO_LABEL, NIVEL_LABEL, TONO_LABEL,
  type Ajustes, type Contexto, type PreguntaId,
} from "@/lib/agenteProducto";

/**
 * Agente de producto (9.º agente): convierte la oferta en un producto listo para vender, conversando.
 * 1 Lo que ya sé (ficha, oferta modelada, ADN, país) → 2 máx. 4 preguntas con opción recomendada y
 * "Decide tú" → 3 plan + ajustes en una línea (rehacer el índice es gratis) → 4 escribe con el
 * product-builder de siempre (cobro por parte en el servidor, devolución si la IA falla) → 5 entrega:
 * PDF, texto, página de venta y mensaje de WhatsApp. Sin pasos de control que frenen (Jean, 29-oct-2026).
 */

type Etapa = "preguntas" | "armando" | "fallo" | "plan" | "escribiendo" | "listo";
type Msg = { de: "agente" | "tu"; texto: string };

const primaryBtn = "inline-flex items-center justify-center gap-2 rounded-lg gradient-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed";
const ghostBtn = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-foreground hover:border-primary/60 disabled:opacity-40 disabled:cursor-not-allowed";
const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60";

const sortPieces = (list: Piece[]) => [...list].sort((a, b) => a.idx - b.idx);

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card-surface rounded-2xl p-5 space-y-4 ${className}`}>{children}</div>;
}

function Burbuja({ m }: { m: Msg }) {
  const tu = m.de === "tu";
  return (
    <div className={`flex ${tu ? "justify-end" : "justify-start"}`}>
      <p className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${tu ? "bg-secondary text-foreground" : "border border-border text-foreground"}`}>
        {m.texto}
      </p>
    </div>
  );
}

function TextoCopiable({ titulo, texto }: { titulo: string; texto: string }) {
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); toast.success("Copiado"); } catch { toast.error("No se pudo copiar."); }
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">{titulo}</p>
        <button onClick={copiar} className={ghostBtn}><Copy className="w-3.5 h-3.5" /> Copiar</button>
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-background p-3 text-xs leading-relaxed text-foreground font-sans">{texto}</pre>
    </div>
  );
}

export interface AgenteProductoProps {
  profile: BusinessProfile;
  productName: string;
  activeId: string | null;
  pb: ReturnType<typeof useProductBuilds>;
  unlocked: boolean | null;
  balance: number;
  applyServerCharge: (action: CreditAction, billing: ServerBilling, meta?: string) => void;
  onClose: () => void;
  /** Abre el libro en el editor de siempre (portada, editar, reescribir). */
  onOpenBuild: (b: Build) => void;
  onNavigate?: (page: string) => void;
}

export function AgenteProducto({ profile, productName, activeId, pb, unlocked, balance, applyServerCharge, onClose, onOpenBuild, onNavigate }: AgenteProductoProps) {
  const { dna, loaded: dnaLoaded } = useBrandDna();
  const [pais, setPais] = useState<string | null>(null);
  const [paisListo, setPaisListo] = useState(false);
  useEffect(() => { void getUserCountry().then(c => { setPais(c); setPaisListo(true); }); }, []);

  // 1. Lo que ya sé (sin preguntar).
  const ctx: Contexto = useMemo(() => {
    const g = profile.journey?.gemelo;
    return {
      nombre: productName, producto: profile.product, paraQuien: profile.who, promesa: profile.promise,
      precio: profile.price, priceAmount: profile.price_amount, priceCurrency: profile.price_currency, prueba: profile.proof,
      oferta: g?.offer_name ? { nombre: g.offer_name, precioUsd: g.price_usd } : null,
      voz: dna.communication_style ?? "", pais,
    };
  }, [profile, productName, dna.communication_style, pais]);
  const listo = dnaLoaded && paisListo;
  const { valores, razones } = useMemo(() => deducir(ctx), [ctx]);
  const preguntas = useMemo(() => preguntasPendientes(ctx, valores), [ctx, valores]);

  const [etapa, setEtapa] = useState<Etapa>("preguntas");
  const [paso, setPaso] = useState(0);
  const [respuestas, setRespuestas] = useState<Partial<Record<PreguntaId, string>>>({});
  const [elegida, setElegida] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [ajustes, setAjustes] = useState<Ajustes | null>(null);
  const [build, setBuild] = useState<Build | null>(null);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [precioElegido, setPrecioElegido] = useState<number | null>(null);
  const [linea, setLinea] = useState("");
  const [progreso, setProgreso] = useState<{ hechas: number; total: number } | null>(null);
  const [rechazadas, setRechazadas] = useState<Set<string>>(new Set());
  const stopRef = useRef(0);
  const balanceRef = useRef(balance);
  useEffect(() => { balanceRef.current = balance; }, [balance]);
  const finRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (msgs.length > 1) finRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }); }, [msgs.length, etapa]);

  const decir = (de: Msg["de"], texto: string) => setMsgs(m => [...m, { de, texto }]);

  // Saludo con lo que ya sabe, una sola vez cuando terminó de leer el ADN y el país.
  const saludo = useRef(false);
  useEffect(() => {
    if (!listo || saludo.current) return;
    saludo.current = true;
    const sabe: string[] = [`Producto: ${productName}.`];
    if (ctx.oferta) sabe.push(`Modelas la oferta «${ctx.oferta.nombre}».`);
    for (const r of Object.values(razones)) if (r) sabe.push(r);
    decir("agente", `Hola. Soy tu agente de producto: armo tu producto listo para vender.\n\nLo que ya sé:\n• ${sabe.join("\n• ")}` +
      (preguntas.length ? `\n\nSolo me falta${preguntas.length > 1 ? `n ${preguntas.length} cosas` : " una cosa"}.` : "\n\nNo necesito preguntarte nada."));
    if (!preguntas.length) void armar(ajustesFinales(valores, {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo]);

  const pregunta = preguntas[paso];
  useEffect(() => { setElegida(pregunta?.recomendada ?? null); }, [pregunta?.id, pregunta?.recomendada]);

  const responder = (valor: string | null) => {
    if (!pregunta) return;
    const v = valor ?? pregunta.recomendada;
    const op = pregunta.opciones.find(o => o.id === v);
    decir("agente", pregunta.titulo);
    decir("tu", valor ? (op?.label ?? v) : `Decide tú (${op?.label ?? v})`);
    const r = { ...respuestas, [pregunta.id]: v };
    setRespuestas(r);
    if (paso + 1 < preguntas.length) setPaso(paso + 1);
    else void armar(ajustesFinales(valores, r));
  };

  /** "Arma mi plan ya": lo que falte va con lo recomendado. Nunca bloquea. */
  const saltarTodo = () => {
    decir("tu", "Decide tú lo demás");
    void armar(ajustesFinales(valores, respuestas));
  };

  // 3. Plan: índice gratis con el product-builder. Al rehacer, se borra el borrador anterior (vacío).
  const armar = async (a: Ajustes, anterior: Build | null = null) => {
    setAjustes(a);
    setEtapa("armando");
    const r = await builderCall({ action: "outline", product_id: activeId ?? undefined, ...pedidoIndice(a), notes: notasIndice(a, ctx) });
    if (!r.ok) {
      const err = r.data as BuilderError;
      decir("agente", err.code === "ai_refusal" ? "La IA no quiso armar este índice. Pídemelo con otro enfoque." : err.error);
      setEtapa(anterior ? "plan" : "fallo");
      return;
    }
    if (anterior && !pieces.some(p => (p.content ?? "").trim())) void pb.deleteBuild(anterior.id);
    setBuild(r.data.build);
    setPieces(r.data.pieces);
    setRechazadas(new Set());
    setEtapa("plan");
    decir("agente", anterior ? "Listo, así quedó." : "Este es tu plan. Si quieres cambiar algo, dímelo en una línea.");
    void pb.reload();
  };

  const plan = useMemo(() => {
    if (!build || !ajustes) return null;
    return armarPlan({
      titulo: build.title, subtitulo: build.subtitle, promesa: build.outline?.promise, audiencia: build.outline?.audience,
      piezas: pieces, ajustes, ctx, precioElegido, recetasReales: recetasEscritas(pieces, ajustes),
    });
  }, [build, pieces, ajustes, ctx, precioElegido]);

  const enviarLinea = async () => {
    const t = linea.trim();
    if (!t || !ajustes || !build || etapa !== "plan") return;
    setLinea("");
    decir("tu", t);
    const r = interpretarAjuste(t, ajustes);
    decir("agente", r.respuesta);
    if (r.titulo) { setBuild({ ...build, title: r.titulo }); void pb.updateBuild(build.id, { title: r.titulo }); }
    if (r.precio) setPrecioElegido(r.precio);
    if (r.tono) { setAjustes(r.ajustes); setBuild({ ...build, tone: r.tono }); void pb.updateBuild(build.id, { tone: r.tono }); }
    if (r.rehacer) await armar(r.ajustes, build);
    else setAjustes(r.ajustes);
  };

  // 4. Escribir: el mismo product-builder (cobra el servidor por parte; si la IA falla, devuelve).
  // Guardián del Creador: la app elige la IA (la primera habilitada, la misma que propone el editor).
  const model: BuilderModel | null = pb.models.find(m => m.enabled) ?? null;
  const pendientes = sortPieces(pieces).filter(p => !isPieceDone(p));
  const costoTotal = model ? pendientes.length * model.cost : 0;

  const escribirUna = async (p: Piece, instr: string): Promise<"ok" | "stop" | "skip"> => {
    if (!build || !model) return "stop";
    if (balanceRef.current < model.cost) { toast.error(`Te faltan ${model.cost - balanceRef.current} créditos`); return "stop"; }
    const r = await builderCall({ action: "piece", build_id: build.id, piece_id: p.id, model: model.slug, instructions: instr });
    if (r.ok) {
      applyServerCharge(model.piece_action as CreditAction, r.billing, `${build.title} · ${p.title}`);
      const bal = r.billing.balance ?? r.data.balance;
      if (typeof bal === "number") balanceRef.current = bal;
      setPieces(prev => prev.map(x => (x.id === p.id ? { ...x, ...r.data.piece } : x)));
      setRechazadas(prev => { const n = new Set(prev); n.delete(p.id); return n; });
      return "ok";
    }
    const err = r.data as BuilderError;
    if (typeof err.balance === "number") balanceRef.current = err.balance;
    if (err.code === "ai_refusal") { setRechazadas(prev => new Set(prev).add(p.id)); return "skip"; }
    toast.error(err.error);
    if ([0, 401, 402, 403, 429, 500, 503, 504].includes(r.status)) return "stop";
    return "skip";
  };

  const escribir = async (soloRechazadas = false) => {
    if (!ajustes || !build) return;
    const lista = soloRechazadas ? sortPieces(pieces).filter(p => rechazadas.has(p.id)) : pendientes;
    if (!lista.length) { setEtapa("listo"); return; }
    const my = ++stopRef.current;
    setEtapa("escribiendo");
    if (!soloRechazadas) decir("tu", "Escríbelo");
    setProgreso({ hechas: 0, total: lista.length });
    let hechas = 0;
    let cortado = false;
    for (const p of lista) {
      if (stopRef.current !== my) { cortado = true; break; }
      const base = instruccionesParte(ajustes, p);
      const res = await escribirUna(p, soloRechazadas ? otroEnfoque(base) : base);
      if (res === "ok") hechas++;
      setProgreso({ hechas, total: lista.length });
      if (res === "stop") { cortado = true; break; }
    }
    setProgreso(null);
    if (cortado) {
      decir("agente", "Pausé. Lo escrito quedó guardado; puedes seguir cuando quieras.");
      setEtapa("plan");
      return;
    }
    setEtapa("listo");
    decir("agente", "¡Listo! Tu producto está escrito. Aquí tienes todo para venderlo.");
  };

  const rechazadasLista = sortPieces(pieces).filter(p => rechazadas.has(p.id));
  const textoVenta = plan ? textoPaginaVenta(plan, ctx) : "";
  const textoWa = plan ? textoWhatsApp(plan, ctx) : "";
  const cover = build?.cover ?? { template: "clasica" as const, color: "noche" as const };

  const descargarPdf = () => { if (build) printBuild(build, pieces, cover); };
  const copiarTodo = async () => {
    if (!build) return;
    try { await navigator.clipboard.writeText(exportMarkdown(build, pieces, cover.author)); toast.success("Copiado"); } catch { toast.error("No se pudo copiar."); }
  };
  const irAPaginaVenta = () => {
    const t = TOOL_BY_ID.paginas;
    if (t && onNavigate) openTool(t, onNavigate);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => { stopRef.current++; onClose(); }} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-3.5 h-3.5" /> Tus ebooks, cursos y retos
        </button>
        <span className="text-xs text-muted-foreground">Agente de producto</span>
      </div>

      <Card>
        <div>
          <p className="font-display font-semibold text-lg text-foreground">Hazlo conversando</p>
          <p className="text-sm text-muted-foreground">Tu oferta convertida en un producto listo para vender.</p>
        </div>

        <div className="space-y-2" aria-live="polite">
          {!listo && <p className="text-sm text-muted-foreground inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Leyendo tu ficha…</p>}
          {msgs.map((m, i) => <Burbuja key={i} m={m} />)}
        </div>

        {/* 2. Una pregunta a la vez, con la recomendada marcada. */}
        {listo && etapa === "preguntas" && pregunta && (
          <div className="space-y-3 rounded-xl border border-border p-4">
            <div>
              <p className="text-sm font-semibold text-foreground">{pregunta.titulo}</p>
              <p className="text-xs text-muted-foreground">{pregunta.porque} · Pregunta {paso + 1} de {preguntas.length}</p>
            </div>
            <div role="radiogroup" aria-label={pregunta.titulo} className="flex flex-wrap gap-2">
              {pregunta.opciones.map(o => {
                const on = elegida === o.id;
                return (
                  <button key={o.id} role="radio" aria-checked={on} onClick={() => setElegida(o.id)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${on ? "border-foreground/60 bg-secondary text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
                    <span className="inline-flex items-center gap-1.5">{on && <Check className="w-3.5 h-3.5" />}{o.label}</span>
                    {o.id === pregunta.recomendada && <span className="ml-1.5 text-[11px] text-muted-foreground">Recomendado</span>}
                    {o.hint && <span className="block text-[11px] text-muted-foreground">{o.hint}</span>}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => responder(elegida)} className={primaryBtn}>Seguir</button>
              <button onClick={() => responder(null)} className={ghostBtn}>Decide tú</button>
              {preguntas.length - paso > 1 && (
                <button onClick={saltarTodo} className="text-xs text-muted-foreground hover:text-foreground">Arma mi plan ya</button>
              )}
            </div>
          </div>
        )}

        {etapa === "fallo" && ajustes && (
          <button onClick={() => void armar(ajustes)} className={primaryBtn}><RotateCcw className="w-4 h-4" /> Intentar de nuevo</button>
        )}

        {etapa === "armando" && (
          <p className="text-sm text-muted-foreground inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Armando tu plan… (gratis)</p>
        )}

        {/* 3. El plan. */}
        {plan && ajustes && (etapa === "plan" || etapa === "escribiendo" || etapa === "listo") && (
          <div className="space-y-4 rounded-xl border border-border p-4">
            <div>
              <p className="text-xs text-muted-foreground">{GENERO_LABEL[ajustes.genero]} · {NIVEL_LABEL[ajustes.nivel]} · {TONO_LABEL[ajustes.tono]}</p>
              <p className="font-display font-semibold text-lg text-foreground leading-snug">{plan.titulo}</p>
              {plan.subtitulo && <p className="text-sm text-muted-foreground">{plan.subtitulo}</p>}
            </div>
            <dl className="grid gap-3 sm:grid-cols-2 text-sm">
              <div><dt className="text-xs text-muted-foreground">Qué aprende</dt><dd className="text-foreground">{plan.promesa}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Para quién</dt><dd className="text-foreground">{plan.paraQuien}</dd></div>
              <div>
                <dt className="text-xs text-muted-foreground">Precio sugerido</dt>
                <dd className="text-foreground tabular-nums">{plan.precio.texto}{plan.precio.local && <span className="text-muted-foreground"> {plan.precio.local}</span>}</dd>
                <dd className="text-xs text-muted-foreground">{plan.precio.razon}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Qué incluye</dt>
                {plan.incluye.map(i => <dd key={i} className="text-foreground">• {i}</dd>)}
              </div>
            </dl>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Índice</p>
              <ol className="space-y-1 text-sm">
                {sortPieces(pieces).map((p, i) => (
                  <li key={p.id} className="flex items-start gap-2">
                    <span className="w-5 shrink-0 text-xs text-muted-foreground tabular-nums pt-0.5">{p.kind === "bono" ? "+" : i + 1}</span>
                    <span className={isPieceDone(p) ? "text-foreground" : "text-muted-foreground"}>
                      {p.kind === "bono" ? `Bono: ${p.title}` : p.title}
                      {isPieceDone(p) && <Check className="inline w-3.5 h-3.5 ml-1 text-foreground" />}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            {etapa === "plan" && (
              <>
                <form onSubmit={e => { e.preventDefault(); void enviarLinea(); }} className="flex gap-2">
                  <input value={linea} onChange={e => setLinea(e.target.value.slice(0, 200))} className={inputCls}
                    placeholder={ajustes.genero === "recetario" ? "Ej.: agrega 10 recetas veganas" : "Ej.: hazlo más corto"} aria-label="Pide un cambio" />
                  <button type="submit" disabled={!linea.trim()} className={ghostBtn} aria-label="Enviar"><Send className="w-3.5 h-3.5" /></button>
                </form>
                {unlocked === false ? (
                  <p className="text-sm text-muted-foreground">
                    Tu plan es gratis. Escribirlo se activa solo cuando se cobra tu primer mes, al terminar tus 3 días de prueba.
                  </p>
                ) : !model ? (
                  <p className="text-sm text-muted-foreground">La escritura está en pausa por un momento. Tu plan quedó guardado.</p>
                ) : balance < costoTotal ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm text-muted-foreground">Escribirlo usa {costoTotal} créditos y tienes {balance}.</p>
                    {onNavigate && <button onClick={() => onNavigate("Créditos")} className={primaryBtn}>Recargar créditos</button>}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => void escribir()} disabled={!pendientes.length} className={primaryBtn}>
                      <Sparkles className="w-4 h-4" /> Escríbelo · {costoTotal} créditos
                    </button>
                    <span className="text-xs text-muted-foreground">{pendientes.length} partes. Si la IA falla en una, no se te cobra.</span>
                  </div>
                )}
              </>
            )}

            {etapa === "escribiendo" && progreso && (
              <div className="space-y-2">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div className="h-full bg-foreground/70 transition-all" style={{ width: `${Math.round((progreso.hechas / progreso.total) * 100)}%` }} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground tabular-nums inline-flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Escribiendo {progreso.hechas} de {progreso.total}…
                  </p>
                  <button onClick={() => { stopRef.current++; }} className={ghostBtn}><Square className="w-3 h-3" /> Detener</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 5. Entrega. */}
        {etapa === "listo" && build && plan && (
          <div className="space-y-4">
            {rechazadasLista.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3">
                <p className="text-sm text-foreground">La IA no quiso escribir {rechazadasLista.length === 1 ? "una parte" : `${rechazadasLista.length} partes`}. No se te cobró.</p>
                <button onClick={() => void escribir(true)} className={ghostBtn}><RotateCcw className="w-3.5 h-3.5" /> Reintentar con otro enfoque</button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button onClick={descargarPdf} className={primaryBtn}><Download className="w-4 h-4" /> Descargar PDF</button>
              <button onClick={() => void copiarTodo()} className={ghostBtn}><Copy className="w-3.5 h-3.5" /> Copiar todo el texto</button>
              <button onClick={() => onOpenBuild(build)} className={ghostBtn}><Pencil className="w-3.5 h-3.5" /> Editar y cambiar portada</button>
            </div>
            <TextoCopiable titulo="Texto para tu página de venta" texto={textoVenta} />
            <TextoCopiable titulo="Mensaje para WhatsApp" texto={textoWa} />
            {onNavigate && TOOL_BY_ID.paginas && (
              <button onClick={irAPaginaVenta} className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
                ¿Quieres una página de venta completa? Ábrela en Página de ventas
              </button>
            )}
          </div>
        )}
        <div ref={finRef} />
      </Card>
    </div>
  );
}

export default AgenteProducto;
