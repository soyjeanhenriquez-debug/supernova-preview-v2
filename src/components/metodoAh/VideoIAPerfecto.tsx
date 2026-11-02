import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Clapperboard, Loader2, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { ToolFeedback } from "@/components/ToolFeedback";
import { PresenterPicker } from "@/components/video/PresenterPicker";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits, CREDIT_COSTS } from "@/hooks/useCredits";
import { fnHeaders, fnErrorMessage, readBilling } from "@/lib/fnAuth";

/**
 * «Video IA Perfecto» (Modelo AH), fase 1 (02-nov-2026, pedido de Jean): la persona escribe UNA frase y la app
 * arma el storyboard con un personaje fijo (agentes en el servidor: metodo-ah + _shared/metodoAh.ts).
 * El método, los modelos y el cobro viven en el servidor; aquí solo se pide y se muestra.
 * Flujo: crear (cobra el storyboard) → imagen del personaje → imágenes de las escenas (2 a la vez, ya pagadas)
 * → «Cambiar solo…» por escena (10 créditos). El video llega en la fase 2. En prueba: solo admins.
 */
type Escena = { idx: number; estado: string; intentos: number; url: string | null; error: string | null;
  datos: { id: string; segundos: number; proposito: string; voz: string; transicion: string } };
type Proyecto = {
  id: string; idea: string; reembolsado: boolean;
  plan: { titulo: string; modo: "A" | "B" | "C"; brief: { publico: string; gancho: string; final: string }; personaje: { nombre: string } };
  personaje: { estado: string; intentos: number; url: string | null };
  escenas: Escena[];
};
type Item = { id: string; idea: string; titulo: string | null; created_at: string };

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/metodo-ah`;
const MODOS = [["auto", "Que decida la IA"], ["A", "Influencer"], ["B", "UGC cercano"], ["C", "Animado"]] as const;
const VOCES = [["off", "Voz en off"], ["dialogo", "Habla a cámara"], ["ninguna", "Sin voz"]] as const;
const PLANTILLAS = [["libre", "Libre"], ["monologo", "Monólogo que vende"], ["reto", "Reto: ¿real o IA?"]] as const;
const CAMPOS = [["ropa", "La ropa"], ["lugar", "El sitio"], ["pose", "La pose"], ["luz", "La luz"], ["camara", "La cámara"]] as const;
const EJEMPLOS = [
  "Una influencer sale de un hotel de lujo de noche, sube a un coche y llega a una fiesta en una azotea.",
  "Un chico prueba un café nuevo en su cocina por la mañana y lo recomienda como si se lo contara a un amigo.",
  "Una emprendedora enseña cómo vende por WhatsApp desde su casa en 3 pasos.",
];
const MODO_NOMBRE = { A: "Influencer", B: "UGC cercano", C: "Animado" };

async function llamar(body: Record<string, unknown>): Promise<{ res: Response; data: { proyecto?: Proyecto; items?: Item[]; error?: string; refunded?: boolean } }> {
  const res = await fetch(FN, { method: "POST", headers: await fnHeaders(), body: JSON.stringify(body) });
  const data = await res.clone().json().catch(() => ({}));
  return { res, data };
}

export function VideoIAPerfecto({ onHome }: { onHome: () => void }) {
  const { user } = useAuth();
  const { applyServerCharge } = useCredits();
  const [idea, setIdea] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<string>("auto");
  const [duracion, setDuracion] = useState(30);
  const [voz, setVoz] = useState<string>("off");
  const [plantilla, setPlantilla] = useState<string>("libre");
  const [cara, setCara] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [p, setP] = useState<Proyecto | null>(null);
  const [lista, setLista] = useState<Item[]>([]);
  const [cambio, setCambio] = useState<{ idx: number; campo: string; deseo: string } | null>(null);
  const [cambiando, setCambiando] = useState<number | null>(null);
  const vivo = useRef(true);
  useEffect(() => () => { vivo.current = false; }, []);

  const cargarLista = useCallback(async () => {
    const { res, data } = await llamar({ action: "lista" });
    if (res.ok && vivo.current) setLista(data.items ?? []);
  }, []);
  useEffect(() => { void cargarLista(); }, [cargarLista]);

  /** Pide las imágenes que falten: primero el personaje, luego 2 escenas a la vez (cada una con un reintento). */
  const producir = useCallback(async (inicial: Proyecto) => {
    let actual = inicial;
    const pedir = async (cual: "personaje" | number) => {
      for (let i = 0; i < 2; i++) {
        const { res, data } = await llamar({ action: "imagen", proyecto: actual.id, cual });
        if (data.proyecto) { actual = data.proyecto; if (vivo.current) setP(data.proyecto); }
        if (res.ok) return true;
        if (data.refunded || res.status === 409) { if (data.error) toast.error(data.error); return false; }
      }
      return false;
    };
    if (actual.personaje.estado !== "lista" && !(await pedir("personaje"))) return;
    const cola = actual.escenas.filter(e => e.estado !== "lista").map(e => e.idx);
    const trabajador = async () => { for (let k = cola.shift(); k !== undefined; k = cola.shift()) await pedir(k); };
    await Promise.all([trabajador(), trabajador()]);
    const { data } = await llamar({ action: "ver", proyecto: actual.id });
    if (data.proyecto && vivo.current) setP(data.proyecto);
  }, []);

  const crear = async () => {
    if (creando) return;
    if (idea.trim().length < 8) { toast.error("Cuéntanos tu idea en una frase."); return; }
    setCreando(true);
    try {
      const { res, data } = await llamar({
        action: "crear", idea, modo: modo === "auto" ? undefined : modo, duracion, voz, plantilla,
        ...(cara ? { cara: { bucket: "personajes", path: cara } } : {}),
      });
      if (!res.ok || !data.proyecto) { toast.error(await fnErrorMessage(res, "No pudimos armar tu storyboard. No se te cobró.")); return; }
      applyServerCharge("ah_storyboard", readBilling(res), data.proyecto.plan.titulo);
      setP(data.proyecto);
      void cargarLista();
      await producir(data.proyecto);
    } catch { toast.error("Se cortó la conexión. Revisa tu internet e inténtalo de nuevo."); }
    finally { if (vivo.current) setCreando(false); }
  };

  const abrir = async (id: string) => {
    const { res, data } = await llamar({ action: "ver", proyecto: id });
    if (!res.ok || !data.proyecto) { toast.error(await fnErrorMessage(res, "No se pudo abrir.")); return; }
    setP(data.proyecto);
    if (data.proyecto.personaje.estado !== "lista" || data.proyecto.escenas.some(e => e.estado === "pendiente")) void producir(data.proyecto);
  };

  const hacerCambio = async () => {
    if (!p || !cambio || cambiando !== null) return;
    setCambiando(cambio.idx);
    try {
      const { res, data } = await llamar({ action: "cambiar", proyecto: p.id, escena: cambio.idx, campo: cambio.campo, deseo: cambio.deseo });
      if (!res.ok || !data.proyecto) { toast.error(await fnErrorMessage(res, "El cambio no salió. No se te cobró.")); return; }
      applyServerCharge("ah_cambio", readBilling(res), p.plan.titulo);
      setP(data.proyecto);
      setCambio(null);
      toast.success("Listo: solo cambió eso.");
    } catch { toast.error("Se cortó la conexión. Inténtalo de nuevo."); }
    finally { if (vivo.current) setCambiando(null); }
  };

  const chip = (on: boolean) => `px-3 py-1.5 rounded-full border text-[13px] transition-colors ${on ? "border-foreground/60 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`;
  const listas = p ? p.escenas.filter(e => e.estado === "lista").length : 0;

  return (
    <div className="space-y-5 max-w-4xl">
      <button type="button" onClick={p ? () => setP(null) : onHome} className="text-[13px] text-muted-foreground hover:text-foreground">← {p ? "Nueva idea" : "Volver"}</button>
      <PageHeader stage="Crear · Modelo AH · solo admin" title="Video IA Perfecto"
        icon={<Clapperboard className="w-5 h-5 text-primary" />}
        line="Escribe tu idea en una frase. La app crea el personaje, el guion y cada escena con su imagen. Tú solo apruebas."
        details={[
          "Un mismo personaje en todas las escenas, con textura de foto real de móvil (o animado, si lo eliges).",
          "Si algo no te gusta, «Cambiar solo…» rehace esa parte sin tocar lo demás.",
          "Primero ves el storyboard. El video se hace después, cuando lo apruebes.",
        ]} />

      {!p && (
        <div className="card-surface rounded-2xl p-5 space-y-4">
          <label className="block text-sm font-medium text-foreground" htmlFor="ah-idea">Tu idea en una frase</label>
          <textarea id="ah-idea" value={idea} onChange={e => setIdea(e.target.value.slice(0, 600))} rows={3} disabled={creando}
            placeholder="Ej.: una chica prueba unos leggings nuevos en el gimnasio y se los recomienda a su amiga"
            className="w-full rounded-xl border border-border bg-background/60 p-3 text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40" />
          <div className="flex flex-wrap gap-2">
            {EJEMPLOS.map(e => <button key={e} type="button" disabled={creando} onClick={() => setIdea(e)} className="text-left text-[12px] text-muted-foreground hover:text-foreground border border-border rounded-xl px-3 py-2 max-w-[260px]">{e}</button>)}
          </div>

          <button type="button" onClick={() => setAbierto(a => !a)} className="flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
            Personalizar (opcional) <ChevronDown className={`w-4 h-4 transition-transform ${abierto ? "rotate-180" : ""}`} />
          </button>
          {abierto && (
            <div className="space-y-4 border-t border-border pt-4">
              <div className="space-y-2"><p className="text-xs text-muted-foreground">Estilo</p>
                <div className="flex flex-wrap gap-2">{MODOS.map(([id, t]) => <button key={id} type="button" className={chip(modo === id)} onClick={() => setModo(id)}>{t}</button>)}</div></div>
              <div className="space-y-2"><p className="text-xs text-muted-foreground">Duración</p>
                <div className="flex flex-wrap gap-2">{[15, 30, 45].map(d => <button key={d} type="button" className={chip(duracion === d)} onClick={() => setDuracion(d)}>{d} s</button>)}</div></div>
              <div className="space-y-2"><p className="text-xs text-muted-foreground">Voz</p>
                <div className="flex flex-wrap gap-2">{VOCES.map(([id, t]) => <button key={id} type="button" className={chip(voz === id)} onClick={() => setVoz(id)}>{t}</button>)}</div></div>
              <div className="space-y-2"><p className="text-xs text-muted-foreground">Formato</p>
                <div className="flex flex-wrap gap-2">{PLANTILLAS.map(([id, t]) => <button key={id} type="button" className={chip(plantilla === id)} onClick={() => setPlantilla(id)}>{t}</button>)}</div></div>
              {user && <PresenterPicker uid={user.id} value={cara} onChange={setCara} disabled={creando}
                note="Con tu foto, el personaje eres tú en todas las escenas. Sin foto, la IA crea una persona nueva." />}
            </div>
          )}

          <button type="button" onClick={crear} disabled={creando || idea.trim().length < 8}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {creando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {creando ? "Armando tu storyboard…" : `Crear mi storyboard · ${CREDIT_COSTS.ah_storyboard} créditos`}
          </button>

          {lista.length > 0 && (
            <div className="border-t border-border pt-4 space-y-2">
              <p className="text-xs text-muted-foreground">Tus storyboards</p>
              {lista.map(it => (
                <button key={it.id} type="button" onClick={() => abrir(it.id)} className="block w-full text-left rounded-xl border border-border px-3 py-2 hover:border-foreground/30">
                  <span className="block text-sm text-foreground">{it.titulo || it.idea.slice(0, 60)}</span>
                  <span className="block text-[11px] text-muted-foreground">{new Date(it.created_at).toLocaleDateString("es")}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {p && (
        <div className="space-y-4">
          <div className="card-surface rounded-2xl p-5 space-y-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{MODO_NOMBRE[p.plan.modo]} · {p.escenas.reduce((a, e) => a + e.datos.segundos, 0)} s · {p.escenas.length} escenas</p>
            <h2 className="font-display text-xl font-semibold text-foreground">{p.plan.titulo}</h2>
            <p className="text-[13px] text-muted-foreground"><span className="text-foreground">Primeros 3 segundos:</span> {p.plan.brief.gancho}</p>
            <p className="text-[13px] text-muted-foreground"><span className="text-foreground">Para quién:</span> {p.plan.brief.publico}</p>
            <div className="flex items-center gap-4 pt-1">
              <div className="w-24 aspect-[9/16] rounded-xl border border-border overflow-hidden bg-card/60 flex items-center justify-center shrink-0">
                {p.personaje.url ? <img src={p.personaje.url} alt={`Personaje: ${p.plan.personaje.nombre}`} className="w-full h-full object-cover" />
                  : p.personaje.estado === "error" ? <AlertTriangle className="w-5 h-5 text-muted-foreground" /> : <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
              </div>
              <div className="text-[13px] text-muted-foreground">
                <p className="text-foreground font-medium">{p.plan.personaje.nombre}</p>
                <p>Tu personaje fijo: sale igual en todas las escenas.</p>
                {p.reembolsado && <p className="mt-1 text-foreground">El personaje no salió. Te devolvimos los créditos.</p>}
                {!p.reembolsado && p.personaje.estado === "error" && <button type="button" onClick={() => producir(p)} className="mt-1 inline-flex items-center gap-1 text-foreground"><RefreshCw className="w-3.5 h-3.5" /> Reintentar (gratis)</button>}
              </div>
            </div>
            <p className="text-[12px] text-muted-foreground">{listas} de {p.escenas.length} escenas listas</p>
          </div>

          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
            {p.escenas.map(e => (
              <div key={e.idx} className="card-surface rounded-2xl overflow-hidden flex flex-col">
                <div className="aspect-[9/16] bg-card/60 flex items-center justify-center relative">
                  {e.url ? <img src={e.url} alt={e.datos.proposito} className="w-full h-full object-cover" loading="lazy" />
                    : e.estado === "error" ? <AlertTriangle className="w-5 h-5 text-muted-foreground" /> : <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
                  {cambiando === e.idx && <div className="absolute inset-0 bg-background/70 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-foreground" /></div>}
                </div>
                <div className="p-3 space-y-1.5 text-[12px] flex-1 flex flex-col">
                  <p className="text-muted-foreground">{e.datos.id} · {e.datos.segundos} s</p>
                  <p className="text-foreground">{e.datos.proposito}</p>
                  {e.datos.voz && <p className="text-muted-foreground italic">«{e.datos.voz}»</p>}
                  <p className="text-muted-foreground">→ {e.datos.transicion}</p>
                  {e.estado === "error" && e.intentos < 2 && <button type="button" onClick={() => producir(p)} className="inline-flex items-center gap-1 text-foreground"><RefreshCw className="w-3.5 h-3.5" /> Reintentar (gratis)</button>}
                  <div className="mt-auto pt-2">
                    {cambio?.idx === e.idx ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1">{CAMPOS.map(([id, t]) => <button key={id} type="button" className={chip(cambio.campo === id)} onClick={() => setCambio({ ...cambio, campo: id })}>{t}</button>)}</div>
                        <input value={cambio.deseo} onChange={ev => setCambio({ ...cambio, deseo: ev.target.value.slice(0, 300) })} placeholder="¿Cómo? (opcional)"
                          className="w-full rounded-lg border border-border bg-background/60 px-2 py-1.5 text-[12px] text-foreground" />
                        <div className="flex gap-2">
                          <button type="button" onClick={hacerCambio} disabled={cambiando !== null} className="flex-1 rounded-lg bg-primary px-2 py-1.5 text-[12px] font-semibold text-primary-foreground disabled:opacity-50">Cambiar · {CREDIT_COSTS.ah_cambio}</button>
                          <button type="button" onClick={() => setCambio(null)} className="rounded-lg border border-border px-2 py-1.5 text-[12px] text-muted-foreground">Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" disabled={e.estado === "generando" || p.personaje.estado !== "lista" || cambiando !== null}
                        onClick={() => setCambio({ idx: e.idx, campo: "ropa", deseo: "" })}
                        className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground disabled:opacity-40"><Wand2 className="w-3.5 h-3.5" /> Cambiar solo…</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="card-surface rounded-2xl p-5 space-y-2">
            <button type="button" disabled className="w-full sm:w-auto rounded-xl border border-border px-5 py-3 text-sm text-muted-foreground">Hacer el video · muy pronto</button>
            <p className="text-[12px] text-muted-foreground">El video (movimiento, voz, música y edición) llega en la siguiente fase. Tu storyboard queda guardado.</p>
          </div>
          {listas === p.escenas.length && <ToolFeedback tool="video-ia-perfecto" context={{ modo: p.plan.modo, escenas: p.escenas.length }} />}
        </div>
      )}
    </div>
  );
}
