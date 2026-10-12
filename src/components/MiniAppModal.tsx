import { useEffect, useMemo, useRef, useState } from "react";
import { X, Rocket, Loader2, Copy, Check, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { useCredits, CREDIT_COSTS } from "@/hooks/useCredits";
import { useProjects } from "@/hooks/useProjects";
import { fnHeaders, fnErrorMessage, readBilling } from "@/lib/fnAuth";
import type { DemoAd } from "@/lib/demo-winning-ads";
import type { Offer } from "@/lib/offers";
import { loadOfferIntel, type OfferIntel } from "@/lib/offerIntel";
import { PAGE_SLUG } from "@/lib/pageSlugs";
import type { SellBrief } from "@/lib/sellThis";
import { trackMiVersionClick, trackMiVersionReady, trackPieceCreated } from "@/lib/analytics";
import { ModalPortal } from "@/components/ModalPortal";
import { MiVersionReceipt } from "@/components/offers/MiVersionReceipt";
import { SellConfirmBar } from "@/components/offers/SellConfirmBar";
import { useSellOffer } from "@/components/offers/useSellOffer";
import { getUserCountry } from "@/components/offers/userCountry";
import {
  type MiVersionData, type NextStep, SELL_COUNTRIES, buildOfferFacts, parseAmount, receiptPrice, receiptToText,
  selectorIso, sellCountry,
} from "@/components/offers/miVersion";

interface Props {
  ad: DemoAd;
  onClose: () => void;
  /** Datos de la oferta (Radar/Mini Apps sin ficha completa). Si no llegan, se usa el anuncio. */
  brief?: SellBrief;
  onNavigate?: (page: string) => void;
  /** La oferta del catálogo: da el precio real (checkout) y los datos para modelarla sin inventar. */
  offer?: Offer | null;
  /** Ficha ya cargada (la trae la hoja de detalle); si falta y hay oferta, se lee aquí (gratis). */
  intel?: OfferIntel | null;
  /** País ya elegido en otro paso (GemeloFlow): código ISO (DO, CO, MX…). */
  country?: string | null;
  /** De dónde se abrió, para el embudo "Prueba 9 de 10". */
  origin?: string;
}

type Phase = "idle" | "working" | "done" | "error";
const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oraculo-generate`;
const STEPS = ["Leyendo el anuncio original", "Escribiendo tu oferta en español", "Escribiendo tu anuncio y tu WhatsApp"];

/**
 * "HACER MI VERSIÓN" (R2-12, 12-oct-2026): la puerta de la app. Antes entregaba 3 prompts para pegar en
 * ChatGPT o Lovable y la persona salía de SUPERNOVA. Ahora entrega, DENTRO de la app y en un solo recibo:
 * la oferta en español (nombre, promesa, para quién, qué incluye), el precio en su moneda con el CPA máximo,
 * 1 anuncio de texto, 1 imagen y el mensaje de WhatsApp para cerrar, más el "Siguiente paso".
 *
 * Cobro: lo hace el SERVIDOR, una vez (gen_master_prompt, 50 hoy), antes de llamar a la IA, con reembolso si
 * falla. El recibo que devuelve cubre la imagen, los reintentos y las instrucciones "Para avanzados".
 * El precio nunca lo inventa la IA: sale del checkout real de la oferta o lo escribe la persona.
 */
export function MiniAppModal({ ad, onClose, brief, onNavigate, offer, intel: intelProp, country: countryProp, origin = "otro" }: Props) {
  const { applyServerCharge, canAfford, balance } = useCredits();
  const { create } = useProjects();
  const seller = useSellOffer();
  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState(0);
  const [data, setData] = useState<MiVersionData | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [imageState, setImageState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [advanced, setAdvanced] = useState("");
  const [advancedLoading, setAdvancedLoading] = useState(false);
  const [amountText, setAmountText] = useState("");
  const [copied, setCopied] = useState(false);
  const [intel, setIntel] = useState<OfferIntel | null>(intelProp ?? null);
  const [iso, setIso] = useState<string>(() => {
    if (countryProp) return countryProp.toUpperCase();
    try { return localStorage.getItem("supernova_country") || ""; } catch { return ""; }
  });
  const startedRef = useRef(false);
  const receiptRef = useRef<string | null>(null);
  const startedAt = useRef(0);
  const intelRef = useRef<OfferIntel | null>(intelProp ?? null);
  intelRef.current = intel;

  useEffect(() => { trackMiVersionClick(origin, offer?.id ?? null, ad.daysActive); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // País: el que la persona dio al entrar (user_age_country). La app no pregunta lo que ya sabe.
  useEffect(() => {
    if (iso) return;
    let on = true;
    void getUserCountry().then((c) => { if (on) setIso(c ?? "OTRO"); });
    return () => { on = false; };
  }, [iso]);

  // Ficha de la oferta (precio real del checkout): gratis, compartida entre todos.
  useEffect(() => {
    if (intelProp || !offer?.id) return;
    const ctrl = new AbortController();
    void loadOfferIntel(offer.id, { signal: ctrl.signal }).then(({ intel: i }) => { if (!ctrl.signal.aborted && i) setIntel(i); });
    return () => ctrl.abort();
  }, [offer?.id, intelProp]);

  const country = useMemo(() => sellCountry(iso || "OTRO"), [iso]);
  const price = useMemo(() => receiptPrice(offer, intel, country, parseAmount(amountText)), [offer, intel, country, amountText]);
  const versionBrief = (d: MiVersionData): SellBrief => ({
    product: d.name, who: d.who, promise: d.promise, price: price.kind === "ready" ? price.local : (brief?.price ?? ""),
  });

  const post = async (body: Record<string, unknown>) =>
    fetch(FN, { method: "POST", headers: await fnHeaders(), body: JSON.stringify({ brand: ad.pageName, country: iso || "OTRO", ...body, receipt: receiptRef.current }) });

  const makeImage = async (d: MiVersionData) => {
    if (!receiptRef.current) return;
    setImageState("loading");
    try {
      const resp = await post({ kind: "mi_version_image", image_prompt: d.image.prompt || `${d.name}. ${d.promise}`, image_text: d.image.text || d.ad.headline });
      if (!resp.ok) throw new Error(await fnErrorMessage(resp, "No salió la imagen."));
      const out = await resp.json();
      if (!out?.image) throw new Error("No salió la imagen.");
      // Cubierta por el recibo (0 créditos). Si el recibo ya venció, el servidor la cobra como imagen normal.
      applyServerCharge("gen_ad_image", readBilling(resp), `Imagen · ${d.name.slice(0, 40)}`);
      setImage(out.image);
      setImageState("done");
      trackPieceCreated("imagen", "mi-version", { offer_id: offer?.id ?? null });
    } catch (e) {
      setImageState("error");
      toast.error(e instanceof Error ? e.message : "No salió la imagen.");
    }
  };

  const run = async () => {
    if (startedRef.current) return;
    if (!receiptRef.current && !canAfford("gen_master_prompt")) { toast.error("No te alcanzan los créditos para esto. Puedes conseguir más en Créditos."); return; }
    startedRef.current = true;
    startedAt.current = Date.now();
    try { if (iso) localStorage.setItem("supernova_country", iso); } catch { /* sin almacenamiento */ }
    setPhase("working");
    setStep(0);
    const timer = window.setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 6000);
    try {
      const resp = await post({ kind: "mi_version", analysis: buildOfferFacts(ad, offer, intelRef.current) });
      if (!resp.ok) throw new Error(await fnErrorMessage(resp, "No pudimos hacer tu versión. Toca Reintentar: no se cobra otra vez."));
      const billing = readBilling(resp);
      if (billing.receipt) receiptRef.current = billing.receipt;
      applyServerCharge("gen_master_prompt", billing, `Mi versión · ${ad.title.slice(0, 40)}`);
      const out = await resp.json();
      const d = out?.data as MiVersionData | undefined;
      if (!d?.name) throw new Error("La IA no armó bien tu versión. Toca Reintentar: no se cobra otra vez.");
      setData(d);
      setPhase("done");
      // Queda guardada en Lo que creaste (el texto; la imagen se descarga).
      create({
        name: `Mi versión · ${d.name}`.slice(0, 160), mode: "crear",
        context: { ad, offer_id: offer?.id ?? null, miVersion: d, country: iso, texto: receiptToText(d, price, country) },
      });
      trackMiVersionReady(offer?.id ?? null, Math.round((Date.now() - startedAt.current) / 1000));
      toast.success("Tu versión está lista. Quedó guardada en Lo que creaste.");
      void makeImage(d);
    } catch (e) {
      setPhase("error");
      toast.error(e instanceof Error ? e.message : "Algo falló. Inténtalo de nuevo.");
    } finally {
      window.clearInterval(timer);
    }
  };

  const loadAdvanced = async () => {
    if (!data || advancedLoading) return;
    setAdvancedLoading(true);
    try {
      const analysis = `${buildOfferFacts(ad, offer, intel)}\n\nMI VERSIÓN (ya decidida, respétala):\n${receiptToText(data, price, country)}`;
      const resp = await post({ kind: "master_prompt", analysis });
      if (!resp.ok) throw new Error(await fnErrorMessage(resp, "No pudimos preparar las instrucciones."));
      applyServerCharge("gen_master_prompt", readBilling(resp));
      const out = await resp.json();
      if (!out?.content) throw new Error("No pudimos preparar las instrucciones.");
      setAdvanced(String(out.content));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No pudimos preparar las instrucciones.");
    } finally {
      setAdvancedLoading(false);
    }
  };

  const goTo = (page: string) => {
    onClose();
    if (onNavigate) onNavigate(page);
    else window.location.hash = `#/${PAGE_SLUG[page] ?? ""}`;
    window.scrollTo({ top: 0 });
  };

  const onNext = (s: NextStep) => {
    if (!data) return;
    void seller.sell(versionBrief(data), {
      quiet: true,
      then: () => {
        if (s.generator) { try { localStorage.setItem("supernova_generator_prefill", JSON.stringify({ generator: s.generator })); } catch { /* sin almacenamiento */ } }
        goTo(s.page);
      },
    });
  };

  const useAsProduct = () => {
    if (!data) return;
    void seller.sell(versionBrief(data), { then: () => goTo("Mi negocio") });
  };

  const copyAll = async () => {
    if (!data) return;
    try { await navigator.clipboard.writeText(receiptToText(data, price, country)); } catch { toast.error("No se pudo copiar."); return; }
    setCopied(true); setTimeout(() => setCopied(false), 1800);
    toast.success("Tu versión completa quedó copiada");
  };

  const cost = CREDIT_COSTS.gen_master_prompt;
  const fmt = (n: number) => n.toLocaleString("es");
  const busy = phase === "working";

  return (
    <ModalPortal onClose={busy ? undefined : onClose}>
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-4">
        <div role="dialog" aria-modal="true" aria-label="Tu versión de este negocio"
          className="bg-card border border-border sm:rounded-2xl w-full sm:max-w-3xl h-full sm:h-[92vh] flex flex-col overflow-hidden">
          <header className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-border shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0"><Rocket className="w-4 h-4 text-primary" /></div>
              <div className="min-w-0">
                <h2 className="font-display font-semibold text-foreground truncate">{data ? data.name : "Tu versión de este negocio"}</h2>
                <p className="text-xs text-muted-foreground truncate">Modelada de «{ad.title}» · {fmt(ad.daysActive)} días pagando anuncios</p>
              </div>
            </div>
            <button onClick={onClose} disabled={busy} aria-label="Cerrar" className="p-2 rounded-lg hover:bg-secondary text-muted-foreground disabled:opacity-40">
              <X className="w-4 h-4" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-5">
            {phase === "idle" && (
              <div className="min-h-full flex flex-col items-center justify-center text-center gap-5 py-2">
                <div>
                  <h3 className="font-display font-bold text-2xl text-foreground">Tu versión lista para vender</h3>
                  <p className="text-sm text-muted-foreground mt-1.5">Todo dentro de SUPERNOVA, en un solo recibo · {cost} créditos, una vez.</p>
                </div>
                <ul className="w-full max-w-md space-y-2 text-left">
                  {[
                    ["Tu oferta en español", "Nombre, promesa, para quién y qué incluye."],
                    ["Precio en tu moneda", "El de la original y cuánto puedes pagar en anuncios por venta (CPA máximo)."],
                    ["1 anuncio listo", "Texto y titular para Facebook e Instagram."],
                    ["1 imagen para el anuncio", "Cuadrada, lista para publicar."],
                    ["Tu mensaje de WhatsApp", "Para cerrar la venta y cobrar con los pagos de tu país."],
                  ].map(([t, d]) => (
                    <li key={t} className="flex items-center gap-3 rounded-xl border border-border bg-secondary/30 px-4 py-2.5">
                      <Check className="w-4 h-4 text-success shrink-0" />
                      <div className="min-w-0"><div className="font-semibold text-[14px] text-foreground">{t}</div><div className="text-xs text-muted-foreground">{d}</div></div>
                    </li>
                  ))}
                </ul>
                <label className="w-full max-w-md text-left">
                  <span className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Vas a vender en</span>
                  <select value={selectorIso(iso)} onChange={(e) => setIso(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                    {SELL_COUNTRIES.map((c) => <option key={c.iso} value={c.iso}>{c.label}</option>)}
                  </select>
                </label>
                <button onClick={() => void run()} className="btn-primary-nova px-8 py-3.5 rounded-xl font-semibold text-base flex items-center gap-2">
                  <Rocket className="w-4 h-4" /> Hacer mi versión · {cost} créditos
                </button>
                <p className="text-xs text-muted-foreground">
                  {balance >= cost
                    ? `Tienes ${fmt(balance)} créditos · te quedan ${fmt(balance - cost)} · listo en menos de 1 minuto`
                    : `Tienes ${fmt(balance)} créditos · te faltan ${fmt(cost - balance)}`}
                </p>
                <p className="text-[11.5px] text-muted-foreground max-w-md">Si algo falla, reintentar no cuesta más. Todo queda en Lo que creaste.</p>
              </div>
            )}

            {phase === "working" && (
              <div className="min-h-full flex flex-col items-center justify-center gap-5">
                <div className="text-center">
                  <h3 className="font-display font-semibold text-xl text-foreground">Armando tu versión…</h3>
                  <p className="text-sm text-muted-foreground mt-1">Tarda menos de 1 minuto. No cierres esta ventana.</p>
                </div>
                <ul className="w-full max-w-sm space-y-2.5">
                  {STEPS.map((s, i) => (
                    <li key={s} className={`flex items-center gap-2.5 text-[14px] ${i <= step ? "text-foreground" : "text-muted-foreground/60"}`}>
                      {i < step ? <Check className="w-4 h-4 text-success shrink-0" /> : i === step ? <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" /> : <span className="w-4 h-4 rounded-full border border-border shrink-0" />}
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {phase === "error" && (
              <div className="min-h-full flex flex-col items-center justify-center gap-3 text-center">
                <p className="text-sm text-muted-foreground max-w-sm">Algo falló. No pagas dos veces: reintentar usa el mismo pago (o no se te cobró).</p>
                <button onClick={() => { startedRef.current = false; void run(); }} className="btn-primary-nova px-5 py-2.5 rounded-lg text-sm font-semibold">Reintentar</button>
              </div>
            )}

            {phase === "done" && data && (
              <MiVersionReceipt
                data={data} price={price} country={country} daysActive={ad.daysActive}
                amountText={amountText} onAmountText={setAmountText}
                image={image} imageState={imageState} onRetryImage={() => void makeImage(data)}
                onNext={onNext} nextBusy={seller.selling}
                advanced={{ text: advanced, loading: advancedLoading, onLoad: () => void loadAdvanced() }}
                feedbackRef={receiptRef.current}
              />
            )}
          </div>

          {phase === "done" && data && (
            <footer className="shrink-0 border-t border-border px-4 sm:px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2">
              {seller.pending && (
                <SellConfirmBar current={seller.pending.current} next={data.name} busy={seller.selling}
                  onConfirm={() => void seller.confirm()} onCancel={seller.cancel} />
              )}
              <div className="flex items-center gap-2">
                <button onClick={() => void copyAll()} className="flex-1 h-11 btn-primary-nova rounded-xl font-semibold text-sm flex items-center justify-center gap-2">
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Copiar todo
                </button>
                <button onClick={useAsProduct} disabled={seller.selling} title="Gratis: tu ficha de Mi negocio queda con tu versión"
                  className="h-11 px-4 rounded-xl border border-border text-sm font-semibold text-foreground hover:border-primary/50 flex items-center gap-2 disabled:opacity-50">
                  {seller.selling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Briefcase className="w-4 h-4" />}
                  <span className="hidden sm:inline">Usar como mi producto · gratis</span><span className="sm:hidden">Mi producto</span>
                </button>
              </div>
            </footer>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
