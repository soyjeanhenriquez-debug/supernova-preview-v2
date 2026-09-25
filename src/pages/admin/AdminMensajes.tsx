import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Loader2, Mail, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { fnHeaders } from "@/lib/fnAuth";

/**
 * Admin → Mensajes: escribir y enviar correos a un cliente o a un grupo (función admin-email, solo
 * admin). Plantillas honestas (sin promesas de ingresos, manual de SUPERNOVA), {{nombre}} por persona,
 * prueba al propio correo antes de enviar, confirmación con el número exacto y enlace de baja en los
 * envíos a grupos. Las respuestas llegan al correo del admin (el dominio de envío no recibe).
 */
const APP = "https://supernova-six-eta.vercel.app/app";
const SEGMENTS: { id: string; label: string; hint: string }[] = [
  { id: "todos", label: "Todos los usuarios", hint: "Todos los registrados que no se dieron de baja" },
  { id: "prueba", label: "En prueba", hint: "Tienen los 3 días de prueba activos" },
  { id: "vencen", label: "Prueba vence en 48 h", hint: "Buen momento para ayudarles a decidir" },
  { id: "pagando", label: "Pagando", hint: "PRO o Comunidad activos" },
  { id: "comunidad", label: "Comunidad", hint: "Miembros de Creativos 10X" },
  { id: "sin_plan", label: "Registrados sin plan", hint: "Crearon cuenta pero no activaron" },
  { id: "avisame", label: "Esperan los videos", hint: "Tocaron \"Avísame\" en Vende sin mostrar tu cara" },
  { id: "leads", label: "Leads de la landing", hint: "Dejaron su correo pero no tienen cuenta" },
];

const TEMPLATES: { id: string; label: string; subject: string; body: string }[] = [
  { id: "blank", label: "En blanco", subject: "", body: "Hola {{nombre}},\n\n\n\nUn abrazo,\nJean" },
  {
    id: "bienvenida", label: "Bienvenida", subject: "{{nombre}}, empieza por aquí",
    body: `Hola {{nombre}},\n\nBienvenido a SUPERNOVA. El primer paso es el más importante: elegir qué vender.\n\nEntra a **Mi negocio**, mira las ofertas que llevan más días pagando anuncios (esa es la prueba de que venden) y clona una en 3 toques. Es gratis.\n\n${APP}\n\nSi te atascas en algo, responde este correo y te ayudo.\n\nJean`,
  },
  {
    id: "vence", label: "Tu prueba vence pronto", subject: "{{nombre}}, tu prueba termina pronto",
    body: `Hola {{nombre}},\n\nTu prueba de SUPERNOVA termina pronto. Antes de que decidas, te dejo lo que más ayuda en los primeros días:\n\n1. Elige una oferta que ya vende en **Mi negocio**.\n2. Valídala con la matriz (3 minutos).\n3. Ponle precio en tu moneda y mira cuánto puedes pagar por venta en anuncios.\n\n${APP}\n\nSi algo no te quedó claro, responde este correo y lo vemos juntos.\n\nJean`,
  },
  {
    id: "atascado", label: "¿Te atascaste?", subject: "¿Te ayudo con tu siguiente paso?",
    body: `Hola {{nombre}},\n\nVi que empezaste a armar tu negocio en SUPERNOVA. Muchos se detienen en el mismo punto, y casi siempre es por una duda pequeña.\n\nRespóndeme con una línea: ¿en qué paso estás y qué te frenó? Te contesto yo.\n\n${APP}\n\nJean`,
  },
  {
    id: "novedad", label: "Novedad: vende sin mostrar tu cara", subject: "Nuevo en SUPERNOVA: vende sin mostrar tu cara",
    body: `Hola {{nombre}},\n\nSi te da pena grabarte, esto es para ti. En **Vende sin mostrar tu cara** la app te propone un personaje creado con IA para tu oferta, crea su foto y te escribe 10 guiones para Reels y TikTok.\n\nLo encuentras en el menú, en la etapa 5 (Vender).\n\n${APP}#/personaje\n\nJean`,
  },
  {
    id: "comunidad", label: "Invitación a la Comunidad", subject: "{{nombre}}, ¿avanzamos juntos?",
    body: `Hola {{nombre}},\n\nSi quieres acompañamiento para no avanzar solo, te invito a la Comunidad Creativos 10X: todo lo de SUPERNOVA PRO, la comunidad privada y llamadas en vivo para revisar tu avance. Además tiene los modelos de video más avanzados de la app.\n\nCuesta US$99 al mes y puedes cancelar cuando quieras:\nhttps://whop.com/checkout/plan_oRht08inLOu39\n\nSi tienes dudas, responde este correo.\n\nJean`,
  },
  {
    id: "sinplan", label: "Activa tu prueba", subject: "{{nombre}}, tu cuenta está lista",
    body: `Hola {{nombre}},\n\nCreaste tu cuenta en SUPERNOVA pero todavía no activaste tu plan. Los primeros 3 días son gratis y con todo abierto: ofertas que ya venden, tu negocio gemelo y tus primeros anuncios.\n\n${APP}\n\nUsa este mismo correo al activar y tu acceso se enciende solo.\n\nJean`,
  },
  {
    id: "extrañamos", label: "Te extrañamos", subject: "{{nombre}}, ¿qué te faltó?",
    body: `Hola {{nombre}},\n\nVi que dejaste SUPERNOVA. No te escribo para convencerte: quiero saber qué te faltó o qué no funcionó, para mejorarlo.\n\nResponde este correo con una línea. Lo leo yo.\n\nGracias por haberlo probado,\nJean`,
  },
];

type Hist = { segment: string; subject: string; recipients: number; sent: number; failed: number; test: boolean; created_at: string };

async function call(payload: Record<string, unknown>) {
  const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-email`, {
    method: "POST", headers: await fnHeaders(), body: JSON.stringify(payload),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error || "No se pudo completar.");
  return d;
}

export default function AdminMensajes() {
  const [mode, setMode] = useState<"grupo" | "uno">("grupo");
  const [segment, setSegment] = useState("prueba");
  const [to, setTo] = useState("");
  const [tpl, setTpl] = useState("blank");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState(TEMPLATES[0].body);
  const [count, setCount] = useState<{ count: number; sample: string[]; capped: boolean } | null>(null);
  const [busy, setBusy] = useState<"" | "test" | "send">("");
  const [history, setHistory] = useState<Hist[]>([]);

  const loadHistory = useCallback(() => { call({ action: "history" }).then(d => setHistory(d.history ?? [])).catch(() => {}); }, []);
  useEffect(() => { loadHistory(); }, [loadHistory]);
  useEffect(() => {
    if (mode !== "grupo") { setCount(null); return; }
    let alive = true;
    setCount(null);
    call({ action: "count", segment }).then(d => { if (alive) setCount(d); }).catch(() => {});
    return () => { alive = false; };
  }, [mode, segment]);

  const pick = (id: string) => {
    const t = TEMPLATES.find(x => x.id === id)!;
    if ((subject || body !== TEMPLATES.find(x => x.id === tpl)?.body) && id !== tpl && !confirm("¿Reemplazar lo que escribiste por la plantilla?")) return;
    setTpl(id); setSubject(t.subject); setBody(t.body);
  };

  const target = mode === "uno" ? { to: to.trim() } : { segment };
  const valid = subject.trim().length > 1 && body.trim().length > 5 && (mode === "grupo" ? (count?.count ?? 0) > 0 : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim()));
  const withName = (s: string) => s.replace(/\s*\{\{\s*nombre\s*\}\}/gi, mode === "uno" ? "" : " Carolina").replace(/^\s+/, "");
  const preview = useMemo(() => withName(body), [body, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (test: boolean) => {
    if (!valid) { toast.error(mode === "uno" ? "Escribe un correo válido, el asunto y el mensaje." : "Escribe el asunto y el mensaje, y elige un grupo con personas."); return; }
    const n = mode === "uno" ? 1 : Math.min(count?.count ?? 0, 500);
    if (!test && !confirm(`¿Enviar "${subject}" a ${n} ${n === 1 ? "persona" : "personas"}? No se puede deshacer.`)) return;
    setBusy(test ? "test" : "send");
    try {
      const d = await call({ action: "send", ...target, subject, body, test });
      toast.success(test ? "Prueba enviada a tu correo. Revísala antes de enviar." : `Enviado a ${d.sent} ${d.sent === 1 ? "persona" : "personas"}${d.failed ? ` (${d.failed} fallaron)` : ""}.`);
      loadHistory();
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo enviar."); }
    finally { setBusy(""); }
  };

  const seg = SEGMENTS.find(s => s.id === segment);
  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Mensajes</h1>
        <p className="text-sm text-muted-foreground mt-1">Escribe a un cliente o a un grupo. Sale de <b className="text-foreground">hola@supernova.jeanhenriquez.com</b> y las respuestas llegan a tu correo.</p>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="space-y-2">
            <p className="text-[12px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-2"><Users className="w-4 h-4" />Para</p>
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-background" role="radiogroup">
              {([["grupo", "Un grupo"], ["uno", "Un correo"]] as const).map(([id, l]) => (
                <button key={id} role="radio" aria-checked={mode === id} onClick={() => setMode(id)}
                  className={`h-9 rounded-lg text-[13px] font-semibold ${mode === id ? "bg-secondary text-foreground" : "text-muted-foreground"}`}>{l}</button>
              ))}
            </div>
            {mode === "grupo" ? (
              <>
                <select value={segment} onChange={e => setSegment(e.target.value)} className="w-full h-10 rounded-lg bg-background border border-border px-3 text-[14px] text-foreground">
                  {SEGMENTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <p className="text-[12px] text-muted-foreground">
                  {seg?.hint}. {count ? <b className="text-foreground">{count.count} {count.count === 1 ? "persona" : "personas"}</b> : <Loader2 className="inline w-3 h-3 animate-spin" />}
                  {count?.sample.length ? ` · ej.: ${count.sample.join(", ")}` : ""}{count?.capped ? " · se envía a las primeras 500" : ""}
                </p>
              </>
            ) : (
              <input type="email" value={to} onChange={e => setTo(e.target.value)} placeholder="cliente@gmail.com"
                className="w-full h-10 rounded-lg bg-background border border-border px-3 text-[14px] text-foreground" />
            )}
          </div>

          <div className="space-y-2">
            <p className="text-[12px] uppercase tracking-wider text-muted-foreground font-semibold">Plantillas</p>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATES.map(t => (
                <button key={t.id} onClick={() => pick(t.id)}
                  className={`h-8 px-3 rounded-full text-[12px] font-semibold border ${tpl === t.id ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
              ))}
            </div>
          </div>

          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Asunto" maxLength={150}
            className="w-full h-10 rounded-lg bg-background border border-border px-3 text-[14px] text-foreground" />
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={12} maxLength={20000}
            className="w-full rounded-lg bg-background border border-border px-3 py-2.5 text-[14px] text-foreground leading-relaxed" />
          <p className="text-[11px] text-muted-foreground">{"{{nombre}}"} se cambia por el nombre de cada persona · **texto** sale en negrita · los enlaces https se vuelven clicables. Sin promesas de ingresos ni resultados.</p>

          <div className="flex flex-wrap gap-2">
            <button onClick={() => void send(true)} disabled={busy !== ""} className="h-11 px-4 rounded-full border border-border text-[14px] font-semibold text-foreground inline-flex items-center gap-2 disabled:opacity-50">
              {busy === "test" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Enviarme una prueba
            </button>
            <button onClick={() => void send(false)} disabled={busy !== "" || !valid} className="h-11 px-5 rounded-full btn-primary-nova text-[14px] inline-flex items-center gap-2">
              {busy === "send" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Enviar{mode === "grupo" && count ? ` a ${Math.min(count.count, 500)}` : ""}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-white text-neutral-900 p-5 space-y-3">
            <p className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">Vista previa</p>
            <p className="text-[13px] text-neutral-500">De: SUPERNOVA · Asunto: <b className="text-neutral-900">{withName(subject) || "(sin asunto)"}</b></p>
            <div className="text-[14px] leading-relaxed whitespace-pre-wrap border-t border-neutral-200 pt-3">{preview.replace(/\*\*(.+?)\*\*/g, "$1")}</div>
            <p className="text-[11px] text-neutral-400 border-t border-neutral-200 pt-2">SUPERNOVA · Entrar a la app{mode === "grupo" ? " · Dejar de recibir estos correos" : ""}</p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
            <p className="text-[12px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-2"><History className="w-4 h-4" />Enviados</p>
            {history.length ? history.map((h, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-[13px] py-1.5 border-b border-border/50 last:border-0">
                <span className="min-w-0 truncate text-foreground">{h.test ? "[Prueba] " : ""}{h.subject}</span>
                <span className="shrink-0 text-muted-foreground">{SEGMENTS.find(s => s.id === h.segment)?.label ?? h.segment} · {h.sent}/{h.recipients}{h.failed ? ` · ${h.failed} fallaron` : ""} · {new Date(h.created_at).toLocaleDateString("es", { day: "numeric", month: "short" })}</span>
              </div>
            )) : <p className="text-sm text-muted-foreground">Todavía no has enviado nada desde aquí.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
