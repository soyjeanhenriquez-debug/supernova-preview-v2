import { useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ArrowRight, Check, Copy, Download, Loader2, Pencil, ShoppingBag, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { QuickBrief } from "@/components/QuickBrief";
import { CopyLevelPicker } from "@/components/CopyLevelPicker";
import { useCredits, generatorCost } from "@/hooks/useCredits";
import { useBusinessProfile, profileReady, profileText, PRICE_MAX } from "@/lib/businessProfile";
import { generatorById, streamGenerator } from "@/lib/generators";
import { bumpIdeas, parsePrice, usd, type BumpIdea } from "@/lib/orderBump";

/**
 * Order bump en un solo lugar (pedido de Jean, 04-oct-2026): antes el menú sacaba al usuario a
 * Robot de copy. Aquí ve su producto, 3–4 ideas GRATIS calculadas sin IA (src/lib/orderBump.ts) y
 * crea el texto con el MISMO generador "order-bump" de Robot de copy: mismo prompt y misma llamada
 * a ai-chat con generator_id, así el servidor cobra (edge_guard_charge) y devuelve si la IA falla.
 * Nada se genera solo: la IA se llama únicamente al tocar el botón principal.
 */
const GEN_ID = "order-bump";

export function OrderBumpPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { profile, savePatch, loaded } = useBusinessProfile();
  const { applyServerCharge, canAfford } = useCredits();
  const generator = generatorById(GEN_ID)!;
  const { action, cost } = generatorCost(GEN_ID);
  const [chosen, setChosen] = useState<string | null>(null);
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ product: "", price: "" });
  const createRef = useRef<HTMLDivElement>(null);

  const ideas = useMemo(() => bumpIdeas(profile.business_type, profile.price), [profile.business_type, profile.price]);
  const mainPrice = parsePrice(profile.price);

  if (!loaded) return <div className="text-sm text-muted-foreground p-6">Cargando…</div>;

  const ready = profileReady(profile);
  const hasProduct = profile.product.trim().length > 2;
  const idea = ideas.find(i => i.id === chosen) ?? null;

  const pick = (i: BumpIdea) => {
    setChosen(c => (c === i.id ? null : i.id));
    createRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  };

  const startEdit = () => { setDraft({ product: profile.product, price: profile.price }); setEditing(true); };
  const saveEdit = async () => {
    if (draft.product.trim().length < 3) { toast.error("Escribe qué vendes, aunque sea en pocas palabras."); return; }
    const ok = await savePatch({ product: draft.product, price: draft.price });
    if (ok) { setEditing(false); toast.success("Guardado en tu ficha"); } else toast.error("No se pudo guardar. Intenta de nuevo.");
  };

  const create = async () => {
    if (!hasProduct) { toast.error("Primero cuenta qué vendes."); return; }
    if (!canAfford(action)) {
      toast.error(`Te faltan créditos: esto cuesta ${cost}`, { description: "Recarga créditos o espera a que se renueven el mes que viene." });
      return;
    }
    const base = ready ? profileText(profile) : [`Producto: ${profile.product}`, profile.price && `Precio: ${profile.price} USD`].filter(Boolean).join("\n");
    const input = idea
      ? `${base}\n\nIdea elegida para el order bump: ${idea.title} (${idea.what})${idea.price ? `. Precio sugerido: ${idea.price} USD` : ""}. Desarrolla esta idea como la Opción 1 y propone 2 alternativas distintas.`
      : base;
    setLoading(true);
    setOutput("");
    try {
      await streamGenerator({
        generator, profile, input: input.slice(0, 2000),
        onCharged: (billing) => applyServerCharge(action, billing, generator.title),
        onText: setOutput,
      });
      toast.success("Listo. Revísalo y cópialo.");
    } catch (err: unknown) {
      toast.error(err instanceof Error && err.message ? err.message : "No se pudo generar. Inténtalo de nuevo en un momento.");
    } finally {
      setLoading(false);
    }
  };

  const copy = () => { navigator.clipboard.writeText(output).then(() => toast.success("Copiado. Ya puedes pegarlo donde quieras."), () => toast.error("No se pudo copiar")); };
  const download = () => {
    const url = URL.createObjectURL(new Blob([output], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "order-bump.md"; a.click();
    URL.revokeObjectURL(url);
  };

  // Ejemplo de por qué sube la ganancia: con la primera idea y 2 de cada 10 compradores.
  const example = ideas[0]?.price ? ideas[0].price * 0.2 : null;

  return (
    <div className="space-y-5 max-w-5xl">
      <PageHeader stage="Mi negocio · Sube lo que deja cada venta" title="Order bump"
        icon={<ShoppingBag className="w-5 h-5 text-primary" />}
        line="Es la casilla extra en la página de pago (por ejemplo, +US$7 por unas plantillas): quien ya va a comprar la marca con un clic, y cada venta te deja más sin pagar más anuncios."
        details={["Elige una idea de abajo (es gratis) o deja que la IA proponga 3.", "El extra debe ser pequeño, entregarse al instante y costar entre el 20 % y el 40 % de tu producto.", "Pon la casilla en tu página de pago (Hotmart, Kiwify, Shopify y casi todas lo permiten)."]} />

      {/* Tu producto */}
      {ready && !editing ? (
        <div className="card-surface rounded-2xl p-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 text-sm space-y-0.5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Tu producto</p>
            <p className="text-foreground font-medium">{profile.product}</p>
            <p className="text-muted-foreground">{mainPrice ? `Precio: ${usd(mainPrice)}` : "Sin precio todavía: ponlo para ver el precio sugerido de cada idea."}</p>
          </div>
          <button type="button" onClick={startEdit}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
            <Pencil className="w-3.5 h-3.5" /> Cambiar
          </button>
        </div>
      ) : ready && editing ? (
        <div className="card-surface rounded-2xl p-5 space-y-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Tu producto</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_160px]">
            <input aria-label="Qué vendes" value={draft.product} onChange={e => setDraft(d => ({ ...d, product: e.target.value.slice(0, 300) }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60" />
            <input aria-label="Precio en US$" value={draft.price} onChange={e => setDraft(d => ({ ...d, price: e.target.value.slice(0, PRICE_MAX) }))}
              placeholder="Precio en US$, ej.: 27" inputMode="decimal"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={saveEdit} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:border-foreground/40">Guardar</button>
            <button type="button" onClick={() => setEditing(false)} className="px-2 text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
          </div>
        </div>
      ) : (
        <QuickBrief profile={profile} savePatch={savePatch} purpose="proponerte tu order bump" />
      )}

      {/* Ideas gratis */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display font-semibold text-[17px] text-foreground">Ideas para tu order bump <span className="text-xs font-normal text-muted-foreground">· gratis</span></h2>
          {example && <p className="text-[12px] text-muted-foreground">Ejemplo: si 2 de cada 10 compradores lo marcan, cada venta deja en promedio {usd(Math.round(example * 100) / 100)} más. Es un cálculo, no una promesa.</p>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {ideas.map(i => {
            const on = chosen === i.id;
            return (
              <div key={i.id} className={`rounded-2xl border p-4 flex flex-col gap-2 transition-colors ${on ? "border-primary/60 bg-primary/5" : "border-border bg-card/40"}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-display font-semibold text-[14px] text-foreground">{i.title}</p>
                  <p className="text-[13px] font-semibold text-foreground tabular-nums whitespace-nowrap">
                    {i.price ? `+${usd(i.price)}` : `≈ ${Math.round(i.pct * 100)} % de tu precio`}
                  </p>
                </div>
                <p className="text-[12.5px] text-muted-foreground leading-snug flex-1">{i.what}</p>
                <button type="button" onClick={() => pick(i)} aria-pressed={on}
                  className={`self-start inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs ${on ? "border-primary/60 text-primary font-semibold" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  {on ? <><Check className="w-3.5 h-3.5" /> Elegida</> : "Usar esta idea"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Crear */}
      <div ref={createRef} className="card-surface rounded-2xl p-5 space-y-3">
        <p className="text-sm text-foreground font-medium">
          {idea ? <>La IA escribe tu order bump con la idea <b>{idea.title}</b>: titular, texto de la casilla, descripción y 2 alternativas.</>
            : "La IA te propone 3 order bumps para tu producto, con precio, titular y el texto de la casilla."}
        </p>
        <details className="group">
          <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground select-none">▸ Personalizar el tono (opcional)</summary>
          <div className="mt-2"><CopyLevelPicker profile={profile} onChange={p => { savePatch({ copy_level: p.copy_level }); }} /></div>
        </details>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={create} disabled={loading || !hasProduct}
            className="btn-primary-nova inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Escribiendo…</> : <><Sparkles className="w-4 h-4" /> Crear mi order bump <span className="opacity-75 font-medium">· {cost} créditos</span></>}
          </button>
          {!hasProduct && <span className="text-xs text-muted-foreground">Escribe arriba qué vendes y listo.</span>}
        </div>
      </div>

      {(output || loading) && (
        <div className="card-surface rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <span className="text-sm font-semibold text-foreground">Tu order bump</span>
            {output && !loading && (
              <div className="flex gap-2">
                <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                  <Copy className="w-3.5 h-3.5" /> Copiar
                </button>
                <button type="button" onClick={download} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                  <Download className="w-3.5 h-3.5" /> Descargar
                </button>
              </div>
            )}
          </div>
          <div className="bg-secondary rounded-lg p-4 text-sm text-foreground leading-relaxed min-h-[100px] overflow-x-auto">
            {output ? (
              <div className="prose prose-invert prose-sm max-w-none prose-headings:font-display prose-headings:mt-4 prose-headings:mb-2 prose-strong:text-foreground">
                <ReactMarkdown>{output}</ReactMarkdown>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Escribiendo tu order bump…</div>
            )}
          </div>
          {output && !loading && <p className="mt-2 text-[11px] text-muted-foreground/80">Revísalo antes de publicarlo. Ningún texto garantiza ventas.</p>}
        </div>
      )}

      {/* Siguiente paso */}
      {onNavigate && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => onNavigate("Precio")}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground">
            Revisa tu precio y ganancia <ArrowRight className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => onNavigate("Recuperar")}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground">
            Recuperar ventas <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
