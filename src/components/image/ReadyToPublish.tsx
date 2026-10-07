import { useCreditsLeft } from "@/hooks/useCreditsLeft";
import { useState } from "react";
import { Check, Copy, Download, Loader2, PenLine } from "lucide-react";
import { toast } from "sonner";
import { fnErrorMessage, fnHeaders, readBilling } from "@/lib/fnAuth";
import { generatorCost, useCredits } from "@/hooks/useCredits";
import { formatNumber, publishSteps, type StudioMode } from "@/lib/imagePrompts";
import { AddToTracker } from "@/components/AddToTracker";

/**
 * "Listo para publicar": descargar todo, escribir el texto del anuncio (generador mandala-ad de
 * ai-chat, cobra el servidor ANTES y reembolsa si falla) y 3 pasos para subirlo.
 */
export function ReadyToPublish({ mode, count, onDownloadAll, copyRequest, title }: {
  mode: StudioMode; count: number; onDownloadAll: () => Promise<void>; copyRequest: string; title: string;
}) {
  const { applyServerCharge, balance } = useCredits();
  const creditsLeft = useCreditsLeft().label;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { action, cost } = generatorCost("mandala-ad");
  const { where, steps } = publishSteps(mode);
  const wantsCopy = mode !== "foto_producto";

  const write = async () => {
    if (busy) return;
    if (balance < cost) { toast.error(`Te faltan créditos: esto cuesta ${cost}`); return; }
    setBusy(true); setText("");
    const label = `Texto del anuncio · ${title}`.slice(0, 80);
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`, {
        method: "POST", headers: await fnHeaders(),
        body: JSON.stringify({ generator_id: "mandala-ad", generator_title: label, messages: [{ role: "user", content: copyRequest }] }),
      });
      if (!resp.ok || !resp.body) throw new Error(await fnErrorMessage(resp, "No se pudo escribir el texto. No se te cobró."));
      applyServerCharge(action, readBilling(resp), label);
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "", full = "", finished = false;
      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;
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
            if (c) { full += c; setText(full); }
          } catch { buf = line + "\n" + buf; break; }
        }
      }
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo escribir el texto.");
    } finally { setBusy(false); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(text.replace(/\*\*/g, "")); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { toast.error("No se pudo copiar. Selecciona el texto y cópialo a mano."); }
  };

  return (
    <section className="rounded-2xl border border-border p-5 space-y-4">
      <div>
        <h2 className="font-display font-semibold text-[17px] text-foreground">Listo para publicar</h2>
        <p className="text-[13px] text-muted-foreground mt-0.5">Descárgalas y súbelas a {where}.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <button type="button" onClick={async () => { setDownloading(true); await onDownloadAll(); setDownloading(false); }} disabled={downloading || count === 0}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 text-[13px] text-foreground hover:border-foreground/40 disabled:opacity-60">
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Descargar todo ({count})
        </button>
        {/* Al tracker de Contenido: de ahí sale el bono por publicar. Las miniaturas van con su video largo. */}
        {mode !== "foto_producto" && <AddToTracker kind={mode === "miniatura" ? "largo" : "carrusel"} title={title.slice(0, 120)} source={`img-${mode}`.slice(0, 30)} />}
        {wantsCopy && (
          <button type="button" onClick={() => void write()} disabled={busy}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 text-[13px] text-foreground hover:border-foreground/40 disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />}
            {text ? `Escribir otro texto · ${cost} créditos` : `Escribir el texto del anuncio · ${cost} créditos`}
          </button>
        )}
      </div>
      {wantsCopy && !text && <p className="text-[11px] text-muted-foreground -mt-2">{creditsLeft}. Si falla, no se te cobra.</p>}

      {text && (
        <div className="rounded-xl border border-border bg-background/40 p-4 space-y-3">
          <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-foreground max-h-[360px] overflow-y-auto">{text}</pre>
          {!busy && (
            <button type="button" onClick={() => void copy()} className="min-h-[40px] inline-flex items-center gap-2 rounded-lg border border-border px-3 text-[12px] text-foreground">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? "Copiado" : "Copiar texto"}
            </button>
          )}
        </div>
      )}

      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-[13px] text-muted-foreground">
            <span className="shrink-0 w-6 h-6 rounded-full border border-border flex items-center justify-center text-[11px] text-foreground">{i + 1}</span>
            <span className="pt-0.5">{s}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
