import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import {
  Check, Copy, Download, Loader2, MessageCircle, Megaphone, ImageIcon, BadgeDollarSign, ChevronDown, ArrowRight,
  LayoutTemplate, Video, PanelsTopLeft, CalendarDays, RefreshCw, Wrench,
} from "lucide-react";
import { ToolFeedback } from "@/components/ToolFeedback";
import {
  type MiVersionData, type PriceInfo, type SellCountry, type NextStep, NEXT_STEPS, fillPrice, whatsappShareUrl,
} from "./miVersion";

/**
 * El recibo de "Hacer mi versión": todo lo que la persona necesita para empezar a vender, dentro de la app.
 * Orden de lectura = orden de uso: tu oferta y su precio → el anuncio → la imagen → el WhatsApp para cerrar →
 * siguiente paso. Lo técnico (instrucciones para otra IA) queda plegado en "Para avanzados".
 */
interface Props {
  data: MiVersionData;
  price: PriceInfo;
  country: SellCountry;
  daysActive: number;
  amountText: string;
  onAmountText: (v: string) => void;
  image: string | null;
  imageState: "idle" | "loading" | "done" | "error";
  onRetryImage: () => void;
  onNext: (step: NextStep) => void;
  nextBusy?: boolean;
  advanced: { text: string; loading: boolean; onLoad: () => void };
  feedbackRef?: string | null;
}

const ICON: Record<NextStep["id"], React.ReactNode> = {
  carrusel: <LayoutTemplate className="w-4 h-4" />,
  video: <Video className="w-4 h-4" />,
  pagina: <PanelsTopLeft className="w-4 h-4" />,
  contenido: <CalendarDays className="w-4 h-4" />,
};

export function MiVersionReceipt({
  data, price, country, daysActive, amountText, onAmountText, image, imageState, onRetryImage, onNext, nextBusy, advanced, feedbackRef,
}: Props) {
  const whatsapp = fillPrice(data.whatsapp, price);
  const adText = [data.ad.hook, "", fillPrice(data.ad.primary_text, price)].join("\n");
  return (
    <div className="space-y-4">
      {/* 1 · La oferta */}
      <section className="rounded-2xl border border-border bg-secondary/20 p-4 sm:p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Tu oferta en español</p>
        <h3 className="font-display font-semibold text-[22px] leading-tight text-foreground mt-1.5">{data.name}</h3>
        <p className="text-[14.5px] text-foreground/90 leading-relaxed mt-2">{data.promise}</p>
        <dl className="mt-3 space-y-2 text-[13.5px]">
          <div><dt className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Para quién</dt><dd className="text-foreground/90 mt-0.5">{data.who}</dd></div>
          {data.includes.length > 0 && (
            <div>
              <dt className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Qué incluye</dt>
              <dd><ul className="mt-1 space-y-1">{data.includes.map((x, i) => (
                <li key={i} className="flex gap-2 text-foreground/90"><Check className="w-4 h-4 text-success shrink-0 mt-0.5" />{x}</li>
              ))}</ul></dd>
            </div>
          )}
        </dl>

        <PriceBlock price={price} country={country} amountText={amountText} onAmountText={onAmountText} />

        {data.why_it_sells.length > 0 && (
          <details className="group mt-3">
            <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer text-[12.5px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              Por qué la original vende ({daysActive.toLocaleString("es")} días pagando anuncios) <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
            </summary>
            <ul className="mt-2 space-y-1 pl-4 list-disc marker:text-primary text-[12.5px] text-muted-foreground">
              {data.why_it_sells.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </details>
        )}
      </section>

      {/* 2 · El anuncio */}
      <Piece icon={<Megaphone className="w-4 h-4" />} title="Tu anuncio (Facebook e Instagram)" copyText={`${adText}\n\nTitular: ${data.ad.headline}`} copyLabel="Copiar anuncio">
        <p className="font-semibold text-[15px] text-foreground leading-snug">{data.ad.hook}</p>
        <p className="text-[14px] text-foreground/90 leading-relaxed mt-2 whitespace-pre-line">{fillPrice(data.ad.primary_text, price)}</p>
        <div className="mt-3 rounded-xl border border-border bg-card px-3 py-2.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Titular</div>
            <div className="text-[14px] font-semibold text-foreground truncate">{data.ad.headline}</div>
          </div>
          <span className="shrink-0 h-8 px-3 rounded-lg bg-secondary text-[12px] font-semibold text-foreground inline-flex items-center">{data.ad.cta}</span>
        </div>
      </Piece>

      {/* 3 · La imagen */}
      <section className="rounded-2xl border border-border bg-secondary/20 p-4 sm:p-5">
        <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-2"><ImageIcon className="w-4 h-4" /> La imagen de tu anuncio</h4>
        <div className="mt-3 grid sm:grid-cols-[minmax(0,260px)_1fr] gap-4 items-start">
          <div className="aspect-square rounded-xl border border-border bg-card overflow-hidden flex items-center justify-center">
            {image ? <img src={image} alt={`Imagen del anuncio de ${data.name}`} className="w-full h-full object-cover" />
              : imageState === "error" ? <span className="text-[12.5px] text-muted-foreground px-4 text-center">No salió la imagen. No se te cobró aparte.</span>
              : <span className="text-[12.5px] text-muted-foreground inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-primary" /> Creando tu imagen…</span>}
          </div>
          <div className="space-y-2 text-[12.5px] text-muted-foreground">
            <p>Cuadrada (1:1), lista para el feed de Facebook e Instagram. Va incluida en tu versión.</p>
            {image && (
              <a href={image} download={`${data.name.replace(/[^\w\sáéíóúñ-]/gi, "").trim() || "mi-version"}.png`}
                className="h-9 px-3.5 rounded-lg border border-border text-[13px] font-semibold text-foreground hover:border-primary/50 inline-flex items-center gap-1.5">
                <Download className="w-4 h-4" /> Descargar imagen
              </a>
            )}
            {imageState === "error" && (
              <button onClick={onRetryImage} className="h-9 px-3.5 rounded-lg border border-border text-[13px] font-semibold text-foreground hover:border-primary/50 inline-flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4" /> Reintentar imagen
              </button>
            )}
            {image && <p className="text-[11.5px]">Descárgala: la imagen no se guarda en Lo que creaste (el texto sí).</p>}
          </div>
        </div>
      </section>

      {/* 4 · WhatsApp */}
      <Piece icon={<MessageCircle className="w-4 h-4" />} title="Tu mensaje de WhatsApp para cerrar la venta" copyText={whatsapp} copyLabel="Copiar mensaje"
        extra={<a href={whatsappShareUrl(whatsapp)} target="_blank" rel="noopener noreferrer" className="h-9 px-3.5 rounded-lg border border-border text-[13px] font-semibold text-foreground hover:border-primary/50 inline-flex items-center gap-1.5">Abrir en WhatsApp</a>}>
        <p className="text-[14px] text-foreground/90 leading-relaxed whitespace-pre-line">{whatsapp}</p>
        <p className="text-[11.5px] text-muted-foreground mt-2">Cambia [tu número o cuenta] por tus datos de pago antes de mandarlo.</p>
      </Piece>

      {/* 5 · Siguiente paso: aquí viven las piezas que gastan créditos */}
      <section className="rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
        <h4 className="font-display font-semibold text-[16px] text-foreground">Siguiente paso</h4>
        <p className="text-[12.5px] text-muted-foreground mt-0.5">Tu versión pasa a tu ficha y la herramienta abre con ella. Cada una dice su costo antes de crear.</p>
        <div className="grid sm:grid-cols-2 gap-2 mt-3">
          {NEXT_STEPS.map((s) => (
            <button key={s.id} onClick={() => onNext(s)} disabled={nextBusy}
              className="rounded-xl border border-border bg-card hover:border-primary/50 px-3.5 py-3 text-left flex items-center gap-3 disabled:opacity-60 transition-colors">
              <span className="w-9 h-9 rounded-lg bg-secondary text-foreground flex items-center justify-center shrink-0">{ICON[s.id]}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold text-foreground">{s.label}</span>
                <span className="block text-[11.5px] text-muted-foreground truncate">{s.hint} · {s.cost}</span>
              </span>
              <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      </section>

      {/* Para avanzados: las instrucciones para otra IA, solo si las pide */}
      <details className="group rounded-2xl border border-border bg-secondary/10 px-4 py-3">
        <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer text-[13px] font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-2">
          <Wrench className="w-4 h-4" /> Para avanzados: hazla mini app con otra IA <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3">
          {advanced.text ? (
            <>
              <CopyButton text={advanced.text} label="Copiar instrucciones" />
              <article className="prose prose-invert prose-sm max-w-none mt-3"><ReactMarkdown>{advanced.text}</ReactMarkdown></article>
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-[12.5px] text-muted-foreground">Instrucciones (prompts) para pegar en una herramienta que crea apps con IA. No las necesitas para empezar a vender: con lo de arriba ya puedes. Van incluidas en tu versión.</p>
              <button onClick={advanced.onLoad} disabled={advanced.loading}
                className="h-9 px-3.5 rounded-lg border border-border text-[13px] font-semibold text-foreground hover:border-primary/50 inline-flex items-center gap-1.5 disabled:opacity-60">
                {advanced.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />} {advanced.loading ? "Preparándolas…" : "Preparar instrucciones · incluido"}
              </button>
            </div>
          )}
        </div>
      </details>

      <div className="pt-1"><ToolFeedback tool="mi-version" refId={feedbackRef ?? null} context={{ precio: price.kind === "ready" ? price.source : "sin_precio", imagen: imageState }} /></div>
    </div>
  );
}

function PriceBlock({ price, country, amountText, onAmountText }: { price: PriceInfo; country: SellCountry; amountText: string; onAmountText: (v: string) => void }) {
  const fromUser = price.kind === "ready" && price.source === "tuyo";
  return (
    <div className="mt-4 rounded-xl border border-border bg-card p-3.5">
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><BadgeDollarSign className="w-3.5 h-3.5" /> Precio en {country.name}</div>
      {price.kind === "ready" && (
        <>
          <div className="font-display font-semibold text-[28px] text-foreground tabular-nums leading-tight mt-1">{price.local}</div>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {price.source === "original" ? `El mismo precio de la original (${price.originalText}), en tu moneda. Aprox.` : "Tu precio."}
          </p>
          <p className="mt-2.5 rounded-lg bg-secondary/50 px-3 py-2 text-[12.5px] text-foreground/90 leading-relaxed">
            En anuncios puedes pagar hasta <b className="text-foreground">{price.cpaLocal}</b> por cada venta sin perder (CPA máximo = lo más que cuesta conseguir una venta). La cuenta exacta la haces en «Precio».
          </p>
        </>
      )}
      {price.kind === "missing" && (
        <p className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed">
          {price.originalText ? `La original cobra ${price.originalText}, en una moneda que no convertimos. ` : "La original no deja ver su precio. "}
          Escribe el tuyo y te decimos cuánto puedes pagar en anuncios por venta.
          {price.suggestion && <span className="block mt-1">Sugerencia del análisis para probar (no es el precio de la original): <b className="text-foreground">{price.suggestion}</b></span>}
        </p>
      )}
      <label className="mt-3 flex items-center gap-2 text-[12.5px] text-muted-foreground">
        <span className="shrink-0">{price.kind === "missing" || fromUser ? "Tu precio" : "¿Otro precio?"} ({country.symbol})</span>
        <input inputMode="decimal" value={amountText} onChange={(e) => onAmountText(e.target.value)} placeholder={country.code ? "ej. 1.200" : "ej. 17"}
          aria-label={`Tu precio en ${country.symbol}`}
          className="w-28 bg-secondary/50 border border-border rounded-lg px-2.5 py-1.5 text-[14px] text-foreground tabular-nums focus:outline-none focus:border-primary/50" />
      </label>
    </div>
  );
}

function Piece({ icon, title, copyText, copyLabel, extra, children }: {
  icon: React.ReactNode; title: string; copyText: string; copyLabel: string; extra?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-secondary/20 p-4 sm:p-5">
      <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-2">{icon} {title}</h4>
      <div className="mt-3">{children}</div>
      <div className="mt-3 flex flex-wrap gap-2"><CopyButton text={copyText} label={copyLabel} />{extra}</div>
    </section>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch { toast.error("No se pudo copiar. Selecciona el texto y cópialo a mano."); return; }
    setDone(true); setTimeout(() => setDone(false), 1600);
    toast.success("Copiado");
  };
  return (
    <button onClick={() => void copy()} className="h-9 px-3.5 rounded-lg border border-border text-[13px] font-semibold text-foreground hover:border-primary/50 inline-flex items-center gap-1.5">
      {done ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />} {label}
    </button>
  );
}
