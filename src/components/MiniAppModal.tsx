import { useEffect, useRef, useState } from "react";
import { X, Rocket, Loader2, Copy, Check, Save, MessageCircle, Play, Video, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { useCredits, CREDIT_COSTS } from "@/hooks/useCredits";
import { useProjects } from "@/hooks/useProjects";
import { useMediaCredits, MEDIA_COST_PER_VIDEO } from "@/hooks/useMediaCredits";
import { listAvatars, generateVideo, extractHookFromScript } from "@/lib/heygen";
import { fnHeaders, fnErrorMessage, readBilling } from "@/lib/fnAuth";
import type { DemoAd } from "@/lib/demo-winning-ads";
import { OFFER_TYPE_LABEL } from "@/lib/demo-winning-ads";
import { ModalPortal } from "@/components/ModalPortal";

interface Props { ad: DemoAd; onClose: () => void; }

type Phase = "idle" | "blueprint" | "miniapp" | "done" | "error";
type Tab = "blueprint" | "miniapp" | "vender";
type SalesPath = "whatsapp" | "vsl";

const COUNTRIES = [
  { code: "CO", label: "🇨🇴 Colombia · COP" },
  { code: "DO", label: "🇩🇴 Rep. Dominicana · DOP" },
  { code: "MX", label: "🇲🇽 México · MXN" },
  { code: "US", label: "🇺🇸 Estados Unidos · USD" },
  { code: "OTRO", label: "🌎 Otro país · USD" },
];

/**
 * Flujo "CREAR MI APP": de un anuncio ganador a un producto digital propio.
 *  Fase 1 — Blueprint: por qué gana, mecanismo, avatar (streaming visible).
 *  Fase 2 — Mega-Prompt: prompts listos para construir la Mini App (Lovable/
 *  Claude), escalar con anuncios y armar el embudo. Precio único.
 */
export function MiniAppModal({ ad, onClose }: Props) {
  const { applyServerCharge, canAfford } = useCredits();
  const { create, update } = useProjects();
  const { balance: mediaBalance, canAfford: canAffordVideo } = useMediaCredits();
  const [videoState, setVideoState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [imageState, setImageState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [adImage, setAdImage] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [blueprint, setBlueprint] = useState("");
  const [miniapp, setMiniapp] = useState("");
  const [tab, setTab] = useState<Tab>("blueprint");
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [salesPath, setSalesPath] = useState<SalesPath | null>(null);
  const [salesScript, setSalesScript] = useState("");
  const [salesLoading, setSalesLoading] = useState(false);
  const [country, setCountry] = useState(() => localStorage.getItem("supernova_country") || "CO");
  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  // Recibo del cobro de "Mi App": lo emite el servidor al cobrar el blueprint y
  // cubre el mega-prompt, el guion de venta y cualquier reintento.
  const receiptRef = useRef<string | null>(null);
  const projectIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [blueprint, miniapp]);

  const run = async () => {
    if (startedRef.current) return;
    // Cobra el SERVIDOR, una sola vez por Mi App. Si la IA falla devuelve el
    // crédito; si ya hay recibo, reintentar no cuesta nada. Aquí solo se avisa
    // antes cuando a todas luces no alcanza.
    if (!receiptRef.current && !canAfford("gen_master_prompt")) { toast.error("No te alcanzan los créditos para esto. Puedes conseguir más en Créditos."); return; }
    startedRef.current = true;

    try {
      // Fase 1 — Blueprint (streaming)
      setPhase("blueprint");
      let bp = "";
      const bpResp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/winner-blueprint`,
        {
          method: "POST", headers: await fnHeaders(),
          body: JSON.stringify({
            ad: {
              ad_title: ad.title, ad_body: ad.body, page_name: ad.pageName,
              days_active: ad.daysActive, duplicate_count: ad.duplicates,
              market: ad.marketLabel,
            },
            receipt: receiptRef.current,
          }),
        },
      );
      if (!bpResp.ok || !bpResp.body) throw new Error(await fnErrorMessage(bpResp, "No pudimos analizar este anuncio. Inténtalo de nuevo."));
      const bpBilling = readBilling(bpResp);
      if (bpBilling.receipt) receiptRef.current = bpBilling.receipt;
      applyServerCharge("gen_master_prompt", bpBilling, `Mi App · ${ad.title.slice(0, 40)}`);
      const reader = bpResp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content || "";
            if (delta) { bp += delta; setBlueprint(bp); }
          } catch {/* ignore */}
        }
      }
      if (bp.trim().length < 80) throw new Error("La IA no devolvió nada. Pulsa Reintentar; no se te cobra otra vez.");

      // Fase 2 — Mega-Prompt de la Mini App + embudo
      setPhase("miniapp");
      setTab("miniapp");
      const mpResp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oraculo-generate`,
        {
          method: "POST", headers: await fnHeaders(),
          body: JSON.stringify({ kind: "master_prompt", brand: ad.pageName, analysis: bp, receipt: receiptRef.current }),
        },
      );
      const mp = await mpResp.json();
      if (!mpResp.ok || !mp.content) throw new Error(mp.error || "No pudimos crear tu mini app. Inténtalo de nuevo.");
      applyServerCharge("gen_master_prompt", readBilling(mpResp)); // cubierto por el recibo: solo sincroniza el saldo
      setMiniapp(mp.content);
      setPhase("done");
      // Auto-guardado: en cuanto está lista, se persiste en Proyectos para que
      // NUNCA se pierda lo que el usuario ya pagó (aunque cierre el modal).
      persistToBrain(bp, mp.content);
      toast.success("🧬 Tu mini app está lista. La guardamos en tus Proyectos.");
    } catch (e) {
      setPhase("error");
      toast.error(e instanceof Error ? e.message : "Algo falló. Inténtalo de nuevo.");
    }
  };

  const persistToBrain = (bp: string, mp: string) => {
    if (saved) return;
    const proj = create({
      name: `Mi App · ${ad.title.slice(0, 40)}`,
      mode: "crear",
      context: { ad, blueprint: bp, miniapp: mp },
    });
    projectIdRef.current = proj.id;
    setSaved(true);
  };

  // Fase 3 — Camino de venta: cierra la promesa de "cóbralo en tu moneda, por
  // WhatsApp o con VSL, esta semana". No cobra créditos extra: va incluido en
  // el mismo pago de gen_master_prompt.
  const runSalesPath = async (path: SalesPath) => {
    if (salesLoading) return;
    setSalesPath(path);
    setSalesLoading(true);
    setTab("vender");
    localStorage.setItem("supernova_country", country);

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oraculo-generate`,
        {
          method: "POST", headers: await fnHeaders(),
          body: JSON.stringify(
            path === "whatsapp"
              ? { kind: "whatsapp_script", brand: ad.pageName, analysis: blueprint, country, receipt: receiptRef.current }
              : { kind: "vsl_prompt", brand: ad.pageName, analysis: blueprint, receipt: receiptRef.current },
          ),
        },
      );
      const data = await resp.json();
      if (!resp.ok || !data.content) throw new Error(data.error || "Error generando el guion de venta");
      // Incluido en el pago de Mi App (el recibo lo cubre hasta 3 veces); si se
      // agotó, el servidor lo cobra como generador y aquí se refleja.
      applyServerCharge(path === "whatsapp" ? "gen_light" : "gen_medium", readBilling(resp), path === "whatsapp" ? "Guion de WhatsApp" : "Guion de VSL");
      setSalesScript(data.content);
      if (projectIdRef.current) {
        update(projectIdRef.current, { context: { ad, blueprint, miniapp, salesPath: path, salesScript: data.content } });
      }
      toast.success(path === "whatsapp" ? "📱 Tu guion para vender por WhatsApp está listo" : "🎥 Tu guion de video de ventas está listo");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error generando el guion de venta");
      setSalesPath(null);
    } finally {
      setSalesLoading(false);
    }
  };

  // Cierra la promesa "cóbralo esta semana" con un activo real: toma el
  // arranque del guion VSL y genera el video con avatar IA (HeyGen). Usa el
  // primer avatar/voz disponible — la personalización completa vive en
  // Media Studio, aquí es un atajo de 1 clic desde el flujo de creación.
  const handleGenerateHookVideo = async () => {
    if (videoState === "loading" || !salesScript) return;
    if (!canAffordVideo(1)) {
      toast.error(`Para el video necesitas ${MEDIA_COST_PER_VIDEO} créditos de video y tienes ${mediaBalance}.`);
      return;
    }
    setVideoState("loading");
    try {
      const { avatars, voices } = await listAvatars();
      if (!avatars[0]) throw new Error("Ahora mismo no hay presentadores de IA disponibles. Prueba más tarde.");
      const hook = extractHookFromScript(salesScript);
      const voiceId = avatars[0].default_voice_id || voices[0]?.voice_id;
      if (!voiceId) throw new Error("Ahora mismo no hay voces disponibles. Prueba más tarde.");
      await generateVideo({ script: hook, avatar_id: avatars[0].avatar_id, voice_id: voiceId, kind: avatars[0].kind });
      setVideoState("done");
      toast.success("🎬 Estamos haciendo tu video. Lo verás en Media Studio en 1 a 3 minutos.");
    } catch (e) {
      setVideoState("error");
      toast.error(e instanceof Error ? e.message : "Error generando el video");
    }
  };

  // Camino WhatsApp: el creativo de imagen que acompaña el mensaje de venta.
  // Vía Gemini/Nano Banana — mismo GEMINI_API_KEY que ya usamos para texto,
  // sin proveedor nuevo. Va en el pool de créditos normal (barato), no en
  // Media Credits (reservado para lo que sí cuesta órdenes de magnitud más).
  const handleGenerateAdImage = async () => {
    if (imageState === "loading" || !blueprint) return;
    if (!canAfford("gen_ad_image")) { toast.error("No te alcanzan los créditos para esta imagen. Puedes conseguir más en Créditos."); return; }
    setImageState("loading");
    try {
      const prompt = `Anuncio para "${ad.pageName}": ${ad.title}. ${blueprint.slice(0, 300)}`;
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-ad-creative`,
        { method: "POST", headers: await fnHeaders(), body: JSON.stringify({ prompt, aspectRatio: "1:1" }) },
      );
      const data = await resp.json();
      if (!resp.ok || !data.image) throw new Error(data.error || "Error generando la imagen");
      applyServerCharge("gen_ad_image", readBilling(resp), `Creativo · ${ad.title.slice(0, 40)}`);
      setAdImage(data.image);
      setImageState("done");
      if (projectIdRef.current) {
        update(projectIdRef.current, { context: { ad, blueprint, miniapp, salesPath, salesScript, adImage: data.image } });
      }
      toast.success("🖼️ Tu imagen para el anuncio está lista");
    } catch (e) {
      setImageState("error");
      toast.error(e instanceof Error ? e.message : "Error generando la imagen");
    }
  };

  const currentText = tab === "vender" ? salesScript : tab === "miniapp" ? miniapp : blueprint;
  const copyLabel = tab === "vender"
    ? (salesPath === "whatsapp" ? "Copiar guion de WhatsApp" : "Copiar guion del video de ventas")
    : tab === "miniapp" ? "Copiar instrucciones para crear la app (pégalas en Lovable)" : "Copiar análisis";

  const copyCurrent = async () => {
    if (!currentText) return;
    await navigator.clipboard.writeText(currentText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copiado");
  };

  const saveToBrain = () => {
    if (saved) { toast.info("Ya está en tus Proyectos"); return; }
    persistToBrain(blueprint, miniapp);
    toast.success("✓ Guardado en tus Proyectos");
  };

  const running = phase === "blueprint" || phase === "miniapp";
  const busy = running || salesLoading;

  return (
    <ModalPortal onClose={busy ? undefined : onClose}>
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-4xl h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <Rocket className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display font-semibold text-foreground truncate">Crear mi versión de este negocio</h2>
              <p className="text-xs text-muted-foreground truncate">{ad.title} · {ad.pageName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progreso de fases */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border text-xs">
          {([
            { key: "blueprint" as const, label: "1 · Por qué se vende" },
            { key: "miniapp" as const, label: "2 · Tu mini app y cómo venderla" },
            ...(salesPath ? [{ key: "vender" as const, label: "3 · Cómo vender" }] : []),
          ]).map(({ key, label }) => {
            const active =
              (key === "blueprint" && phase === "blueprint") ||
              (key === "miniapp" && phase === "miniapp") ||
              (key === "vender" && salesLoading);
            const complete =
              (key === "blueprint" && (phase === "miniapp" || phase === "done")) ||
              (key === "miniapp" && phase === "done" && Boolean(miniapp)) ||
              (key === "vender" && Boolean(salesScript));
            return (
              <button
                key={key}
                onClick={() => {
                  if (key === "blueprint") setTab("blueprint");
                  else if (key === "miniapp") { if (miniapp) setTab("miniapp"); }
                  else if (salesScript || salesLoading) setTab("vender");
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors ${
                  tab === key ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground"
                }`}
              >
                {active && <Loader2 className="w-3 h-3 animate-spin" />}
                {complete && <Check className="w-3 h-3 text-primary" />}
                {label}
              </button>
            );
          })}
        </div>

        {/* Contenido */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5">
          {phase === "idle" && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4">
              <Rocket className="w-10 h-10 text-primary" />
              <div>
                <h3 className="font-display font-semibold text-lg text-foreground">
                  Crea tu propia versión de este negocio
                </h3>
                <p className="text-sm text-muted-foreground mt-2 max-w-md">
                  Primero te explicamos por qué este anuncio está vendiendo. Luego te damos las instrucciones
                  para crear tu mini app (una herramienta sencilla que la gente paga por usar) con una IA como Lovable,
                  ideas para tus anuncios y un guion para vender por WhatsApp o con un video, cobrando en tu moneda.
                </p>
              </div>
              <button
                onClick={run}
                className="gradient-brand text-primary-foreground px-8 py-3 rounded-lg font-semibold text-sm hover:opacity-90 flex items-center gap-2 glow-primary"
              >
                <Rocket className="w-4 h-4" /> Empezar · {CREDIT_COSTS.gen_master_prompt} créditos
              </button>
              <p className="text-[11px] text-muted-foreground">
                Un solo pago incluye el análisis, las instrucciones de la app y el guion de venta. Tarda 1 o 2 minutos.
              </p>
            </div>
          )}

          {phase === "error" && (
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <p className="text-sm text-muted-foreground">Algo falló, pero no pagas dos veces: si la IA no respondió, te devolvimos los créditos, y reintentar usa el mismo pago.</p>
              <button onClick={() => { startedRef.current = false; run(); }} className="text-primary text-sm hover:underline">
                Reintentar
              </button>
            </div>
          )}

          {phase !== "idle" && phase !== "error" && (
            <>
              <article className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown>{
                  tab === "vender"
                    ? (salesScript || "_Escribiendo tu guion de venta…_")
                    : tab === "miniapp"
                      ? (miniapp || "_Preparando las instrucciones de tu mini app…_")
                      : blueprint
                }</ReactMarkdown>
              </article>

              {/* VSL elegido + guion listo: ofrecer generar el video del hook */}
              {tab === "vender" && salesPath === "vsl" && salesScript && !salesLoading && (
                <div className="mt-6 rounded-xl border border-primary/25 bg-primary/5 p-5">
                  <div className="flex items-start gap-3">
                    <Video className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-display font-semibold text-sm text-foreground">Hacer el video del inicio de tu guion</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        Un presentador hecho con IA lee los primeros 45 a 60 segundos de tu guion. Te queda un video listo para subir a Facebook, Instagram o TikTok. Cuesta {MEDIA_COST_PER_VIDEO} créditos de video.
                      </p>
                      <button
                        onClick={handleGenerateHookVideo}
                        disabled={videoState === "loading" || videoState === "done"}
                        className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/15 text-primary text-sm font-semibold hover:bg-primary/25 disabled:opacity-50 transition-colors"
                      >
                        {videoState === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                        {videoState === "done" ? "Haciéndose en Media Studio…" : `Hacer el video · ${MEDIA_COST_PER_VIDEO} créditos de video`}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* WhatsApp elegido + guion listo: ofrecer generar el creativo de imagen */}
              {tab === "vender" && salesPath === "whatsapp" && salesScript && !salesLoading && (
                <div className="mt-6 rounded-xl border border-primary/25 bg-primary/5 p-5">
                  <div className="flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-display font-semibold text-sm text-foreground">Crear una imagen para tu anuncio</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        Una imagen para acompañar tu mensaje de WhatsApp o publicarla en tus redes. Cuesta {CREDIT_COSTS.gen_ad_image} créditos.
                      </p>
                      <button
                        onClick={handleGenerateAdImage}
                        disabled={imageState === "loading" || imageState === "done"}
                        className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/15 text-primary text-sm font-semibold hover:bg-primary/25 disabled:opacity-50 transition-colors"
                      >
                        {imageState === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        {imageState === "done" ? "Imagen lista ✓" : `Crear imagen · ${CREDIT_COSTS.gen_ad_image} créditos`}
                      </button>
                      {adImage && (
                        <img src={adImage} alt="Creativo de anuncio generado" className="mt-4 w-40 rounded-lg border border-border" />
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Elegir camino de venta: aparece en cuanto la Mini App está lista */}
              {phase === "done" && tab === "miniapp" && !salesPath && (
                <div className="mt-6 rounded-xl border border-primary/25 bg-primary/5 p-5">
                  <h4 className="font-display font-semibold text-sm text-foreground">¿Cómo vas a vender esto?</h4>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">
                    Elige un camino y te damos el guion para empezar a ofrecerlo. Ya va incluido en lo que pagaste.
                  </p>

                  <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                    Tu país (para el precio y el método de cobro)
                  </label>
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full sm:w-64 bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground mb-4 focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </select>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <button
                      onClick={() => runSalesPath("whatsapp")}
                      className="flex items-start gap-3 p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 text-left transition-colors"
                    >
                      <MessageCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-sm text-foreground">Por WhatsApp · cobras tú a mano</div>
                        <div className="text-xs text-muted-foreground mt-0.5">Precio en tu moneda, qué escribirle al cliente y cómo cobrarle. Ideal si empiezas de cero.</div>
                      </div>
                    </button>
                    <button
                      onClick={() => runSalesPath("vsl")}
                      className="flex items-start gap-3 p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 text-left transition-colors"
                    >
                      <Play className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-sm text-foreground">Con un video de ventas · cobro automático</div>
                        <div className="text-xs text-muted-foreground mt-0.5">Guion del video que explica tu producto + cómo conectar tu enlace de pago de Whop.</div>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer acciones */}
        {(phase === "done" || (running && blueprint)) && (
          <div className="flex items-center gap-2 px-5 py-3 border-t border-border">
            <button
              onClick={copyCurrent}
              disabled={busy || !currentText}
              className="flex-1 gradient-brand text-primary-foreground py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copyLabel}
            </button>
            <button
              onClick={saveToBrain}
              disabled={busy}
              className="px-4 py-2.5 rounded-lg border border-border text-sm text-foreground hover:bg-secondary flex items-center gap-2 disabled:opacity-50"
            >
              {saved ? <Check className="w-4 h-4 text-success" /> : <Save className="w-4 h-4" />}
              {saved ? "Guardado ✓" : "Guardar en Proyectos"}
            </button>
          </div>
        )}
      </div>
    </div>
    </ModalPortal>
  );
}
