import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Copy, HeartHandshake, Loader2, Mail, MessageCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { CopyLevelPicker } from "@/components/CopyLevelPicker";
import { profileReady, useBusinessProfile, type RecoveryMessage } from "@/lib/businessProfile";
import { fnErrorMessage, fnHeaders, readBilling } from "@/lib/fnAuth";
import { useCredits } from "@/hooks/useCredits";
import { PageHeader } from "@/components/PageHeader";

/**
 * Etapa 6 del recorrido "Mi negocio": recuperar a quien casi compra.
 * La edge function recovery-sequence arma la secuencia (día 0, 1, 3 y 7) con la ficha de Mi negocio
 * y cobra 15 créditos en el servidor. Aquí solo se muestra, se edita y se guarda en
 * business_profile.recovery (con savePatch, para no pisar otras partes de la ficha).
 */

type Channel = "whatsapp" | "email";

const HOW_TO = [
  "Guarda el número (o el correo) de cada persona que pregunta, hace clic o empieza a pagar y no termina.",
  "En WhatsApp Business ponle la etiqueta \"casi compra\" para encontrarla rápido.",
  "Envía cada mensaje el día que toca. Cambia {nombre} por su nombre y {link} por tu enlace de pago.",
  "Si alguien responde, deja la secuencia y conversa con esa persona. Si te pide que no le escribas más, no le escribas.",
];

const dayLabel = (d: number) => (d === 0 ? "Día 0 · hoy" : `Día ${d}`);

export function RecoveryPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { profile, savePatch, loaded } = useBusinessProfile();
  const { applyServerCharge, canAfford } = useCredits();
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [objection, setObjection] = useState("");
  const [messages, setMessages] = useState<RecoveryMessage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const saveTimer = useRef<number | null>(null);
  // Lo que falta guardar: si el usuario sale antes del segundo de espera, se guarda al salir.
  const pending = useRef<{ messages: RecoveryMessage[]; generated_at: string | null } | null>(null);
  const savePatchRef = useRef(savePatch);
  savePatchRef.current = savePatch;

  // Arranca con la secuencia guardada.
  useEffect(() => {
    if (loaded && messages === null) setMessages(profile.recovery?.messages?.length ? profile.recovery.messages : []);
  }, [loaded, profile.recovery, messages]);

  useEffect(() => () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    if (pending.current) savePatchRef.current({ recovery: pending.current });
  }, []);

  if (!loaded || messages === null) return <div className="text-sm text-muted-foreground p-6">Cargando…</div>;

  const ready = profileReady(profile);
  const generatedAt = profile.recovery?.generated_at ?? null;

  const generate = async () => {
    if (!canAfford("gen_light")) {
      toast.error("Te faltan créditos: esto cuesta 15", { description: "Recarga créditos o espera a que se renueven el mes que viene." });
      return;
    }
    // Una edición pendiente de la secuencia vieja no debe pisar la nueva.
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    pending.current = null;
    setLoading(true);
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recovery-sequence`, {
        method: "POST",
        headers: await fnHeaders(),
        body: JSON.stringify({ channel, objection: objection.trim().slice(0, 300) || undefined, tone: profile.copy_level }),
      });
      if (!resp.ok) throw new Error(await fnErrorMessage(resp, "No se pudo crear tu secuencia. Intenta de nuevo."));
      applyServerCharge("gen_light", readBilling(resp), "Recuperación de ventas");
      const data = await resp.json() as { messages?: RecoveryMessage[] };
      const next = Array.isArray(data.messages) ? data.messages : [];
      if (!next.length) throw new Error("La IA no devolvió mensajes. Intenta de nuevo.");
      setMessages(next);
      const ok = await savePatch({ recovery: { messages: next, generated_at: new Date().toISOString() } });
      if (ok) toast.success("Tu secuencia está lista", { description: "Se guardó en Mi negocio." });
      else toast.error("La secuencia se creó, pero no se pudo guardar");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear tu secuencia.");
    } finally {
      setLoading(false);
    }
  };

  // Edición con guardado automático (1 s después del último cambio).
  const editText = (i: number, text: string) => {
    const next = messages.map((m, j) => (j === i ? { ...m, text } : m));
    setMessages(next);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    pending.current = { messages: next, generated_at: generatedAt };
    saveTimer.current = window.setTimeout(() => {
      const data = pending.current;
      pending.current = null;
      if (data) savePatch({ recovery: data }).then(ok => { if (!ok) toast.error("No se pudo guardar el cambio"); });
    }, 1000);
  };

  const copy = (i: number, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(i);
      window.setTimeout(() => setCopied(c => (c === i ? null : c)), 1500);
    }, () => toast.error("No se pudo copiar"));
  };

  // Funciones de render (no componentes): así los textarea no se vuelven a montar y no pierden el foco.
  const channelButton = (id: Channel, label: string, Icon: typeof Mail) => (
    <button key={id} type="button" onClick={() => setChannel(id)}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${channel === id ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground hover:text-foreground"}`}>
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );

  const messageCard = (m: RecoveryMessage, i: number) => (
    <li key={`${m.day}-${i}`} className="relative pl-8">
      <span className="absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full gradient-brand text-[11px] font-bold text-primary-foreground">{m.day}</span>
      <div className="card-surface rounded-2xl p-4 space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">{dayLabel(m.day)}</p>
          {m.when && <p className="text-xs text-muted-foreground">{m.when}</p>}
        </div>
        <textarea value={m.text} onChange={e => editText(i, e.target.value)} rows={Math.min(12, Math.max(4, Math.ceil(m.text.length / 70)))}
          aria-label={`Mensaje del ${dayLabel(m.day)}`}
          className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed text-foreground focus:outline-none focus:border-primary/60" />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => copy(i, m.text)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
            {copied === i ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />} {copied === i ? "Copiado" : "Copiar"}
          </button>
          {/* Los mensajes de correo empiezan con "Asunto:": a esos no se les ofrece WhatsApp. */}
          {!/^\s*asunto\s*:/i.test(m.text) && (
            <a href={`https://wa.me/?text=${encodeURIComponent(m.text)}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/10">
              <MessageCircle className="w-3.5 h-3.5" /> Abrir en WhatsApp
            </a>
          )}
        </div>
      </div>
    </li>
  );

  return (
    <div className="space-y-5 max-w-5xl">
      <PageHeader stage="Mi negocio · Etapa 6" title="Recupera a quien casi compra"
        icon={<HeartHandshake className="w-5 h-5 text-primary" />}
        line="Mensajes listos para quien preguntó y no compró: día 0, 1, 3 y 7."
        details={["Úsalos con quien hizo clic, preguntó o empezó a pagar y no terminó.", "No siempre es un no: a veces le faltó una respuesta o se le olvidó.", "Escríbele pocas veces y con respeto, en los días que toca."]} />

      <div className="grid lg:grid-cols-[1fr_340px] gap-5 items-start">
        <div className="space-y-5">
          {/* Producto */}
          {ready ? (
            <div className="card-surface rounded-2xl p-5 text-sm space-y-1">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Tu producto</p>
              <p className="text-foreground font-medium">{profile.product}</p>
              <p className="text-muted-foreground">Para: {profile.who}</p>
              <p className="text-muted-foreground">Promete: {profile.promise}</p>
              {(profile.price || profile.proof) && (
                <p className="text-muted-foreground">{[profile.price && `Precio: ${profile.price}`, profile.proof && `Garantía o prueba: ${profile.proof}`].filter(Boolean).join(" · ")}</p>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5 text-sm space-y-3">
              <p className="text-foreground font-medium">Primero cuéntanos qué vendes</p>
              <p className="text-muted-foreground">Los mensajes se escriben con tu producto, para quién es y qué promete. Llénalo en Mi negocio y vuelve aquí.</p>
              {onNavigate && (
                <button onClick={() => onNavigate("Mi negocio")} className="inline-flex items-center gap-2 rounded-lg gradient-brand px-4 py-2 text-sm font-semibold text-primary-foreground">
                  Llenar Mi negocio <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* Opciones */}
          <div className="card-surface rounded-2xl p-5 space-y-4">
            <div className="space-y-2">
              <p className="text-xs text-foreground font-medium">¿Por dónde le vas a escribir?</p>
              <div className="flex flex-wrap gap-2">
                {channelButton("whatsapp", "WhatsApp", MessageCircle)}
                {channelButton("email", "Correo", Mail)}
              </div>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              <span className="text-foreground font-medium">¿Qué duda o excusa te dicen más? <span className="text-muted-foreground font-normal">(opcional)</span></span>
              <input value={objection} onChange={e => setObjection(e.target.value.slice(0, 300))} maxLength={300}
                placeholder='Ej.: "Está caro", "No tengo tiempo", "¿Y si no me funciona?"'
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60" />
            </label>
            <CopyLevelPicker profile={profile} onChange={p => { savePatch({ copy_level: p.copy_level }); }} />
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={generate} disabled={loading || !ready}
                className="inline-flex items-center gap-2 rounded-lg gradient-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : messages.length ? <RotateCcw className="w-4 h-4" /> : <HeartHandshake className="w-4 h-4" />}
                {loading ? "Escribiendo tus mensajes…" : messages.length ? "Rehacer · 15 créditos" : "Crear mi secuencia · 15 créditos"}
              </button>
              {messages.length > 0 && !loading && <span className="text-xs text-muted-foreground">Rehacer reemplaza los mensajes de abajo.</span>}
            </div>
          </div>

          {/* Secuencia */}
          {messages.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Tu secuencia</p>
                <p className="text-[11px] text-muted-foreground/80">Puedes editar cada mensaje: se guarda solo.</p>
              </div>
              <ol className="relative space-y-3 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-px before:bg-border">
                {messages.map(messageCard)}
              </ol>
              <p className="text-[11px] text-muted-foreground/80">Revisa cada mensaje antes de enviarlo. Ningún mensaje garantiza ventas.</p>
            </div>
          )}
        </div>

        {/* Cómo usarla */}
        <div className="space-y-4 lg:sticky lg:top-4">
          <div className="card-surface rounded-2xl p-5 text-sm space-y-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Cómo usarla</p>
            <ul className="space-y-2.5">
              {HOW_TO.map(t => (
                <li key={t} className="flex gap-2 text-muted-foreground leading-snug">
                  <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" /> <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          {onNavigate && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => onNavigate("Resultados")}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground">
                Ver resultados de tus anuncios <ArrowRight className="w-4 h-4" />
              </button>
              <button onClick={() => onNavigate("Dashboard")} className="text-sm text-muted-foreground hover:text-foreground px-2">Volver al inicio</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
