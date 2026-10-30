import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CalendarClock, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, Film, Images, ListChecks, Loader2, Plus, Send, Upload, Wand2, X,
} from "lucide-react";
import { dejarEncargo, type ModoEdicion } from "@/lib/edicionVideo";
import { ElegirEdicion } from "@/components/subs/ElegirEdicion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { fnErrorMessage, fnHeaders } from "@/lib/fnAuth";
import {
  AJUSTES_BASE, ESTADO_PUB, REDES, ajustesDe, avance, casillasDelDia, conExtra, diaRD, etiquetaCasilla, etiquetaDia, horaRD, instante, marcar,
  redPosible, redesDe, semana, siguienteLibre, sumarDias,
  type Ajustes, type Hecha, type MediaTipo, type Plan, type PubEstado, type RedId,
} from "@/lib/publicar";

/**
 * Para publicar v2 (26-oct-2026, pedido de Jean): lo que sale cada día, a qué hora y en qué red ya salió.
 *  · Hoy: una fila por casilla y un botón por red. Un toque = publicado ahí (con la hora y quién lo marcó).
 *  · Semana: un día por columna para planear; tocar un día abre su vista Hoy.
 *  · Plan de 3, 5 o 10 al día (hora de RD) + casillas sueltas. La app recuerda la vista y el plan de cada quien.
 * «Programar» lo hace el servidor (edge function publicar → Upload-Post) y Notion solo recibe lo que pasa aquí.
 * Los reels terminados en Reel Studio entran solos en la siguiente casilla libre.
 * Editar antes de programar (30-oct-2026, Jean): al subir un reel se pregunta si solo se programa, se le ponen
 * subtítulos o se edita (simple, con B-roll o con la plantilla Reel dinámico). Lo que se edita va a «Sube tu video» y vuelve
 * solo a su casilla. «Subir varios» llena las siguientes casillas libres y «Programar los listos» los programa de una vez.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabase as any;
const BUCKET = "publicaciones";

export type Pieza = {
  id: string; title: string | null; topic: string; caption: string | null; slot_at: string; media_tipo: MediaTipo | null;
  media_paths: string[]; pub_estado: PubEstado; pub_redes: string[]; pub_error: string | null; pub_job: string | null;
  pub_hechas: Record<string, Hecha> | null;
};
type Fila = { slot: string; hora: string; tipo: MediaTipo; extra: boolean; pieza?: Pieza };

export function ParaPublicar() {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const hoy = diaRD(new Date());
  const [aj, setAj] = useState<Ajustes>(AJUSTES_BASE);
  const [dia, setDia] = useState(hoy);
  const [desde, setDesde] = useState(hoy);
  const [piezas, setPiezas] = useState<Pieza[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);
  // El video que acabas de elegir para una casilla (o una pieza ya subida), esperando qué hacer con él.
  const [elegir, setElegir] = useState<{ slot: string; file?: File; pieza?: Pieza } | null>(null);
  const variosRef = useRef<HTMLInputElement>(null);
  const vista = aj.vista;
  const dias = useMemo(() => (vista === "hoy" ? [dia] : semana(desde)), [vista, dia, desde]);

  useEffect(() => {
    if (!uid) return;
    void db().from("publicar_ajustes").select("plan, extras, vista, redes").eq("user_id", uid).maybeSingle()
      .then(({ data }: { data: unknown }) => { if (data) setAj(ajustesDe(data)); });
  }, [uid]);

  const cambiarAjustes = async (patch: Partial<Ajustes>) => {
    if (!uid) return;
    const next = { ...aj, ...patch };
    setAj(next);
    const { error } = await db().from("publicar_ajustes").upsert({ user_id: uid, ...next, updated_at: new Date().toISOString() });
    if (error) toast.error("No se pudo guardar tu preferencia.");
  };

  const cargar = useCallback(async () => {
    if (!uid) return;
    const ini = instante(dias[0], "00:00"), fin = instante(dias[dias.length - 1], "23:59");
    const { data, error } = await db().from("content_items")
      .select("id, title, topic, caption, slot_at, media_tipo, media_paths, pub_estado, pub_redes, pub_error, pub_job, pub_hechas")
      .eq("user_id", uid).gte("slot_at", ini).lte("slot_at", fin).order("slot_at");
    if (error) { toast.error("No se pudo cargar lo que toca publicar."); setPiezas([]); return; }
    const lista = ((data ?? []) as Pieza[]).map(p => ({ ...p, pub_hechas: p.pub_hechas ?? {} }));
    setPiezas(lista);
    const paths = lista.map(p => p.media_paths[0]).filter(Boolean);
    if (paths.length) {
      const { data: s } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
      setUrls(Object.fromEntries((s ?? []).filter(x => x.signedUrl).map(x => [x.path ?? "", x.signedUrl])));
    }
  }, [uid, dias]);
  useEffect(() => { void cargar(); }, [cargar]);

  /** Las filas de un día: sus casillas (plan + extra) y cualquier pieza que esté a otra hora. */
  const filasDe = useCallback((d: string): Fila[] => {
    const propias = (piezas ?? []).filter(p => diaRD(new Date(p.slot_at)) === d);
    const porSlot = new Map(propias.map(p => [new Date(p.slot_at).toISOString(), p]));
    const filas: Fila[] = casillasDelDia(aj, d).map(c => {
      const slot = instante(d, c.hora);
      return { slot, hora: c.hora, tipo: c.tipo, extra: !!c.extra, pieza: porSlot.get(slot) };
    });
    const usados = new Set(filas.map(f => f.slot));
    for (const p of propias) {
      const slot = new Date(p.slot_at).toISOString();
      if (!usados.has(slot)) filas.push({ slot, hora: horaRD(slot), tipo: p.media_tipo ?? "reel", extra: false, pieza: p });
    }
    return filas.sort((a, b) => a.slot.localeCompare(b.slot));
  }, [piezas, aj]);

  /** Sube los archivos y crea la pieza en su casilla. Devuelve su id (lanza un error con el motivo si falla). */
  const crear = async (slot: string, tipo: MediaTipo, files: File[], estado: PubEstado = "listo"): Promise<string> => {
    if (!uid) throw new Error("Inicia sesión.");
    const lista = files.slice(0, tipo === "reel" ? 1 : 10);
    if (tipo === "reel" && !lista[0]?.type.startsWith("video/")) throw new Error("En esta casilla va un reel: sube un video.");
    if (tipo === "carrusel" && lista.some(f => !f.type.startsWith("image/"))) throw new Error("En esta casilla va un carrusel: sube las imágenes.");
    {
      const carpeta = `${uid}/${crypto.randomUUID()}`;
      const paths: string[] = [];
      for (const [k, f] of lista.entries()) {
        const p = `${carpeta}/${String(k + 1).padStart(2, "0")}-${f.name.replace(/[^\w.-]+/g, "-").slice(-60)}`;
        const up = await supabase.storage.from(BUCKET).upload(p, f, { contentType: f.type, upsert: false });
        if (up.error) throw new Error(`No se pudo subir ${f.name}.`);
        paths.push(p);
      }
      const nombre = lista[0].name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").slice(0, 120);
      const redes = aj.redes.filter(r => redPosible({ media_tipo: tipo }, r));
      const { data, error } = await db().from("content_items").insert({
        user_id: uid, topic: nombre || (tipo === "reel" ? "Reel" : "Carrusel"), title: nombre, kind: tipo === "reel" ? "corto" : "carrusel",
        platform: tipo === "reel" ? "reels" : "instagram", status: "grabado", source: "para-publicar", due: slot.slice(0, 10),
        slot_at: slot, media_tipo: tipo, media_paths: paths, pub_estado: estado, pub_redes: redes.length ? redes : ["instagram"],
      }).select("id").single();
      if (error || !data) throw new Error("No se pudo guardar en la casilla.");
      return (data as { id: string }).id;
    }
  };

  const subir = async (slot: string, tipo: MediaTipo, files: File[]) => {
    if (!uid || !files.length) return;
    setOcupado(slot);
    try {
      await crear(slot, tipo, files);
      toast.success("Listo en su casilla. Escribe el copy y toca Programar.");
      setAbierta(slot);
      await cargar();
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo subir."); }
    finally { setOcupado(""); }
  };

  /** Lo que se eligió para el video: programarlo tal cual o llevarlo al editor (y que vuelva solo a su casilla). */
  const decidir = async (modo: ModoEdicion) => {
    const e = elegir;
    if (!e) return;
    if (modo === "programar") {
      setElegir(null);
      if (e.file) await subir(e.slot, "reel", [e.file]);
      return;
    }
    setOcupado(e.slot);
    try {
      let file = e.file, itemId = e.pieza?.id;
      const caption = e.pieza?.caption ?? "";
      if (!itemId && file) itemId = await crear(e.slot, "reel", [file], "borrador");
      if (!file && e.pieza) {
        const { data, error } = await supabase.storage.from(BUCKET).download(e.pieza.media_paths[0]);
        if (error || !data) throw new Error("No se pudo abrir el video de esta casilla.");
        file = new File([data], "video.mp4", { type: data.type || "video/mp4" });
      }
      if (!file || !itemId) return;
      dejarEncargo({ file, itemId, modo, caption });
      setElegir(null);
      window.location.hash = "#/con-tu-cara/video";
    } catch (err) { toast.error(err instanceof Error ? err.message : "No se pudo abrir el editor."); await cargar(); }
    finally { setOcupado(""); }
  };

  /** Varios videos de una vez: cada uno a la siguiente casilla libre de reel, listos para escribir el copy y programar. */
  const subirVarios = async (files: FileList) => {
    const videos = [...files].filter(f => f.type.startsWith("video/")).slice(0, 30);
    if (!uid || !videos.length) { toast.error("Elige uno o más videos."); return; }
    setOcupado("varios");
    let hechos = 0;
    try {
      const { data: futuras } = await db().from("content_items").select("slot_at").eq("user_id", uid).gte("slot_at", new Date().toISOString());
      const ocupadas = ((futuras ?? []) as { slot_at: string }[]).map(x => x.slot_at);
      for (const f of videos) {
        const slot = siguienteLibre("reel", ocupadas, new Date(), d => casillasDelDia(aj, d));
        if (!slot) { toast.error("No hay más casillas libres en los próximos 60 días."); break; }
        await crear(slot, "reel", [f]);
        ocupadas.push(slot);
        hechos++;
      }
      if (hechos) toast.success(`${hechos} video${hechos > 1 ? "s" : ""} en sus casillas`, { description: "Ábrelos para editarlos o escribe el copy y programa." });
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo subir."); }
    finally { setOcupado(""); await cargar(); }
  };

  /** Programa de una vez todo lo que ya está listo y tiene copy (en lo que estás viendo). */
  const programarListos = async () => {
    const lista = (piezas ?? []).filter(p => (p.pub_estado === "listo" || p.pub_estado === "error") && (p.caption ?? "").trim() && new Date(p.slot_at).getTime() > Date.now() + 5 * 60_000);
    if (!lista.length) return;
    setOcupado("varios");
    let ok = 0;
    for (const p of lista) {
      const r = await llamar("programar", p).catch(() => null);
      if (r?.ok) ok++;
    }
    setOcupado("");
    await cargar();
    if (ok === lista.length) toast.success(`${ok} programado${ok > 1 ? "s" : ""}.`);
    else toast.error(`Se programaron ${ok} de ${lista.length}. Abre los que dicen «No se pudo programar» para ver el motivo.`);
  };

  const guardar = async (p: Pieza, patch: Partial<Pieza>) => {
    setPiezas(l => (l ?? []).map(x => (x.id === p.id ? { ...x, ...patch } : x)));
    const { error } = await db().from("content_items").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", p.id);
    if (error) { toast.error("No se pudo guardar el cambio."); void cargar(); }
    return !error;
  };

  const llamar = async (action: "programar" | "notion", p: Pieza) => {
    const headers = await fnHeaders();
    return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/publicar`, { method: "POST", headers, body: JSON.stringify({ action, item_id: p.id }) });
  };

  const programar = async (p: Pieza) => {
    setOcupado(p.slot_at);
    try {
      const r = await llamar("programar", p);
      if (!r.ok) throw new Error(await fnErrorMessage(r, "No se pudo programar."));
      const d = await r.json();
      toast.success(`Programado para ${etiquetaCasilla(p.slot_at)}.`, { description: d.notion === "sin conexión" ? "Notion todavía no está conectado." : d.notion === "actualizado" ? "Notion quedó al día." : undefined });
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo programar."); }
    finally { setOcupado(""); await cargar(); }
  };

  /** Un toque en una red: publicado ahí (o se desmarca). Si cambia el estado general, Notion recibe el cambio. */
  const tocarRed = async (p: Pieza, red: RedId) => {
    const patch = marcar(p, red, uid);
    const ok = await guardar(p, patch);
    if (!ok) return;
    const nombre = REDES.find(r => r.id === red)?.nombre ?? red;
    if (patch.pub_hechas[red]) toast.success(`Publicado en ${nombre}`, { description: patch.pub_estado === "publicado" ? "Salió en todas sus redes." : undefined, duration: 2200 });
    if (patch.pub_estado !== p.pub_estado) void llamar("notion", { ...p, ...patch }).catch(() => undefined);
  };

  const mover = async (p: Pieza) => {
    const tipo = p.media_tipo ?? "reel";
    // Todas las casillas ocupadas desde ahora (no solo las que se ven), para no chocar con otra pieza.
    const { data: futuras } = await db().from("content_items").select("slot_at").eq("user_id", uid).gte("slot_at", new Date().toISOString());
    const ocupadas = ((futuras ?? []) as { slot_at: string }[]).map(x => x.slot_at);
    const libre = siguienteLibre(tipo, ocupadas, new Date(p.slot_at), d => casillasDelDia(aj, d));
    if (!libre) { toast.error("No hay casillas libres en los próximos 60 días."); return; }
    await guardar(p, { slot_at: libre, pub_estado: p.pub_estado === "error" ? "listo" : p.pub_estado });
    toast.success(`Movido a ${etiquetaCasilla(libre)}.`);
    setAbierta(null);
    await cargar();
  };

  const quitar = async (p: Pieza) => {
    await db().from("content_items").update({ slot_at: null, pub_estado: "borrador" }).eq("id", p.id);
    setAbierta(null);
    await cargar();
  };

  const visibles = useMemo(() => dias.flatMap(d => filasDe(d)), [dias, filasDe]);
  const listos = (piezas ?? []).filter(p => (p.pub_estado === "listo" || p.pub_estado === "error") && (p.caption ?? "").trim() && new Date(p.slot_at).getTime() > Date.now() + 5 * 60_000).length;
  const resumen = useMemo(() => avance(visibles.flatMap(f => (f.pieza ? [f.pieza] : []))), [visibles]);
  const vacias = visibles.filter(f => !f.pieza && new Date(f.slot).getTime() > Date.now()).length;
  const redesVisibles = REDES.filter(r => aj.redes.includes(r.id));

  const irA = (d: string) => { setDia(d); void cambiarAjustes({ vista: "hoy" }); };
  const mover7 = (n: number) => (vista === "hoy" ? setDia(sumarDias(dia, n)) : setDesde(sumarDias(desde, n * 7)));
  const titulo = vista === "hoy" ? `${dia === hoy ? "Hoy · " : ""}${etiquetaDia(dia)}` : `${etiquetaDia(dias[0])} – ${etiquetaDia(dias[6])}`;

  return (
    <section className="card-surface rounded-2xl p-4 sm:p-5 space-y-4" aria-label="Para publicar">
      <div className="flex flex-wrap items-start gap-3">
        <CalendarClock className="w-5 h-5 text-primary mt-1" />
        <div className="flex-1 min-w-[200px]">
          <h2 className="font-display text-lg">Para publicar</h2>
          <p className="text-[12px] text-muted-foreground">Plan de {aj.plan} al día en hora de RD. Toca una red cuando salga ahí. Lo que terminas en Reel Studio entra solo.</p>
        </div>
        <div role="tablist" aria-label="Vista" className="inline-flex rounded-full border border-border p-0.5">
          {([["hoy", "Hoy", ListChecks], ["semana", "Semana", CalendarDays]] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" role="tab" aria-selected={vista === id} onClick={() => void cambiarAjustes({ vista: id })}
              className={`h-8 px-3 rounded-full text-[12px] inline-flex items-center gap-1.5 transition-colors ${vista === id ? "bg-foreground text-background font-semibold" : "text-muted-foreground hover:text-foreground"}`}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-label={vista === "hoy" ? "Día anterior" : "Semana anterior"} onClick={() => mover7(-1)}
          className="h-9 w-9 rounded-full border border-border flex items-center justify-center"><ChevronLeft className="w-4 h-4" /></button>
        <p className={`text-[13px] font-semibold min-w-[150px] text-center ${vista === "hoy" && dia === hoy ? "text-primary" : "text-foreground"}`}>{titulo}</p>
        <button type="button" aria-label={vista === "hoy" ? "Día siguiente" : "Semana siguiente"} onClick={() => mover7(1)}
          className="h-9 w-9 rounded-full border border-border flex items-center justify-center"><ChevronRight className="w-4 h-4" /></button>
        <button type="button" onClick={() => { setDia(hoy); setDesde(hoy); }} className="h-9 px-3 rounded-full border border-border text-[12px]">Hoy</button>
        <div className="ml-auto inline-flex items-center gap-1 text-[12px] text-muted-foreground">
          <span className="mr-1">Al día:</span>
          {([3, 5, 10] as Plan[]).map(n => (
            <button key={n} type="button" aria-pressed={aj.plan === n} onClick={() => void cambiarAjustes({ plan: n })}
              className={`h-8 min-w-[36px] px-2 rounded-full border text-[12px] ${aj.plan === n ? "border-primary/60 text-foreground bg-primary/10" : "border-border hover:text-foreground"}`}>{n}</button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input ref={variosRef} type="file" accept="video/*" multiple className="hidden"
          onChange={e => { if (e.target.files) void subirVarios(e.target.files); e.target.value = ""; }} />
        <button type="button" disabled={!!ocupado} onClick={() => variosRef.current?.click()}
          className="h-9 px-3 rounded-full border border-border text-[12px] inline-flex items-center gap-1.5 disabled:opacity-50">
          {ocupado === "varios" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Subir varios videos
        </button>
        {listos > 0 && (
          <button type="button" disabled={!!ocupado} onClick={() => void programarListos()}
            className="h-9 px-3 rounded-full bg-primary text-primary-foreground text-[12px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
            <Send className="w-3.5 h-3.5" /> Programar los listos ({listos})
          </button>
        )}
        <p className="text-[11px] text-muted-foreground basis-full sm:basis-auto">Cada video va a la siguiente casilla libre. Ábrelo para editarlo o escribe el copy.</p>
      </div>

      <Resumen hechas={resumen.hechas} total={resumen.total} porRed={resumen.porRed} redes={redesVisibles.map(r => r.id)} vacias={vacias} />

      {!piezas ? <p className="text-sm text-muted-foreground">Cargando…</p> : vista === "hoy" ? (
        <div className="space-y-2">
          {filasDe(dia).map(f => f.pieza ? (
            <FilaPieza key={f.slot} f={f} p={f.pieza} url={urls[f.pieza.media_paths[0]]} redes={redesVisibles.map(r => r.id)} abierta={abierta === f.slot}
              ocupado={ocupado === f.slot} onAbrir={() => setAbierta(abierta === f.slot ? null : f.slot)} onRed={red => void tocarRed(f.pieza!, red)}
              onCaption={caption => void guardar(f.pieza!, { caption })} onRedes={pub_redes => void guardar(f.pieza!, { pub_redes })}
              onProgramar={() => void programar(f.pieza!)} onMover={() => void mover(f.pieza!)} onQuitar={() => void quitar(f.pieza!)}
              onEditar={() => setElegir({ slot: f.slot, pieza: f.pieza! })}
              eleccion={elegir?.pieza?.id === f.pieza.id ? <ElegirEdicion ocupado={ocupado === f.slot} onElegir={m => void decidir(m)} onCancelar={() => setElegir(null)} /> : null} />
          ) : (
            <div key={f.slot} className="space-y-2">
              <FilaVacia f={f} ocupado={ocupado === f.slot} pasada={new Date(f.slot).getTime() < Date.now()}
                onArchivos={files => (f.tipo === "reel" ? setElegir({ slot: f.slot, file: files[0] }) : void subir(f.slot, f.tipo, [...files]))}
                onQuitar={f.extra ? () => void cambiarAjustes({ extras: conExtra(aj.extras, dia, { hora: f.hora, tipo: f.tipo }, true) }) : undefined} />
              {elegir?.slot === f.slot && elegir.file && !elegir.pieza && (
                <ElegirEdicion conProgramar nombre={elegir.file.name} ocupado={ocupado === f.slot} onElegir={m => void decidir(m)} onCancelar={() => setElegir(null)} />
              )}
            </div>
          ))}
          <AgregarCasilla existentes={filasDe(dia).map(f => f.hora)} onAgregar={c => void cambiarAjustes({ extras: conExtra(aj.extras, dia, c) })} />
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
          {dias.map(d => {
            const filas = filasDe(d);
            const a = avance(filas.flatMap(f => (f.pieza ? [f.pieza] : [])));
            return (
              <div key={d} className={`rounded-xl border p-2 space-y-1.5 min-w-0 ${d === hoy ? "border-primary/40 bg-primary/[0.03]" : "border-border"}`}>
                <button type="button" onClick={() => irA(d)} className="w-full text-left space-y-1" aria-label={`Abrir ${etiquetaDia(d)}`}>
                  <div className="flex items-baseline justify-between gap-1">
                    <span className={`text-[12px] font-semibold ${d === hoy ? "text-primary" : "text-foreground"}`}>{etiquetaDia(d)}</span>
                    <span className="text-[11px] text-muted-foreground">{a.total ? `${a.hechas}/${a.total}` : "—"}</span>
                  </div>
                  <Barra valor={a.total ? a.hechas / a.total : 0} />
                </button>
                {filas.map(f => (
                  <button key={f.slot} type="button" onClick={() => { irA(d); setAbierta(f.slot); }}
                    className={`w-full rounded-lg px-2 py-1.5 text-left text-[11px] ${f.pieza ? "bg-card border border-border hover:border-foreground/30" : "border border-dashed border-border text-muted-foreground hover:text-foreground"}`}>
                    <div className="flex items-center gap-1">
                      {f.tipo === "reel" ? <Film className="w-3 h-3 shrink-0" /> : <Images className="w-3 h-3 shrink-0" />}
                      <span className="font-semibold">{f.hora}</span>
                      {f.pieza && <Puntos p={f.pieza} />}
                    </div>
                    <p className="truncate">{f.pieza ? (f.pieza.title || f.pieza.topic) : "Vacía"}</p>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Barra({ valor }: { valor: number }) {
  return (
    <div className="h-1.5 rounded-full bg-border overflow-hidden" aria-hidden>
      <div className={`h-full rounded-full transition-all duration-500 ${valor >= 1 ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${Math.round(valor * 100)}%` }} />
    </div>
  );
}

function Resumen({ hechas, total, porRed, redes, vacias }: { hechas: number; total: number; porRed: Record<RedId, { hechas: number; total: number }>; redes: RedId[]; vacias: number }) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-3 space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="font-display text-xl text-foreground">{hechas}<span className="text-muted-foreground text-sm"> / {total}</span></p>
        <p className="text-[12px] text-muted-foreground">{total ? "publicaciones hechas" : "Todavía no hay piezas en estas casillas"}{vacias ? ` · ${vacias} casilla${vacias > 1 ? "s" : ""} por llenar` : ""}</p>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {redes.map(r => {
            const x = porRed[r];
            const red = REDES.find(y => y.id === r)!;
            const lleno = x.total > 0 && x.hechas === x.total;
            return <span key={r} className={`rounded-full border px-2 py-0.5 text-[11px] ${lleno ? "border-emerald-500/50 text-emerald-400" : "border-border text-muted-foreground"}`}>{red.corto} {x.hechas}/{x.total}</span>;
          })}
        </div>
      </div>
      <Barra valor={total ? hechas / total : 0} />
    </div>
  );
}

/** Puntos de color por red (verde = ya salió ahí). */
function Puntos({ p }: { p: Pieza }) {
  return (
    <span className="ml-auto flex gap-0.5" aria-label={`${redesDe(p).filter(r => p.pub_hechas?.[r]).length} de ${redesDe(p).length} redes`}>
      {redesDe(p).map(r => <span key={r} className={`w-1.5 h-1.5 rounded-full ${p.pub_hechas?.[r] ? "bg-emerald-400" : "bg-muted-foreground/40"}`} />)}
    </span>
  );
}

function BotonRed({ p, red, onClick }: { p: Pieza; red: RedId; onClick: () => void }) {
  const r = REDES.find(x => x.id === red)!;
  if (!redPosible(p, red)) return <span className="h-9 w-[60px] inline-flex items-center justify-center text-[11px] text-muted-foreground/40" title={`Los carruseles no van a ${r.nombre}`}>—</span>;
  const hecha = p.pub_hechas?.[red];
  const va = p.pub_redes.includes(red);
  return (
    <button type="button" aria-pressed={!!hecha} onClick={onClick}
      title={hecha ? `${r.nombre}: publicado a las ${horaRD(hecha.at)}. Toca para desmarcar.` : `Marcar publicado en ${r.nombre}`}
      className={`h-9 w-[60px] rounded-full border text-[11px] inline-flex items-center justify-center gap-1 transition-all active:scale-95 ${
        hecha ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-300 font-semibold"
          : va ? "border-border text-foreground hover:border-foreground/40" : "border-dashed border-border text-muted-foreground/70 hover:text-foreground"}`}>
      {hecha && <Check className="w-3.5 h-3.5" />}{r.corto}
    </button>
  );
}

function Miniatura({ url, tipo }: { url?: string; tipo: MediaTipo | null }) {
  return (
    <div className="w-9 h-16 shrink-0 rounded-md overflow-hidden bg-black border border-border">
      {url ? (tipo === "carrusel" ? <img src={url} alt="" className="w-full h-full object-cover" />
        : <video src={url} muted playsInline preload="metadata" className="w-full h-full object-cover" />) : null}
    </div>
  );
}

function FilaPieza({ f, p, url, redes, abierta, ocupado, onAbrir, onRed, onCaption, onRedes, onProgramar, onMover, onQuitar, onEditar, eleccion }: {
  f: Fila; p: Pieza; url?: string; redes: RedId[]; abierta: boolean; ocupado: boolean; onAbrir: () => void; onRed: (r: RedId) => void;
  onCaption: (c: string) => void; onRedes: (r: string[]) => void; onProgramar: () => void; onMover: () => void; onQuitar: () => void;
  onEditar: () => void; eleccion: React.ReactNode;
}) {
  const est = ESTADO_PUB[p.pub_estado];
  const todas = p.pub_estado === "publicado";
  return (
    <article className={`rounded-xl border transition-colors ${todas ? "border-emerald-500/30 bg-emerald-500/[0.03]" : abierta ? "border-foreground/25 bg-card" : "border-border bg-card/60"}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-2.5">
        <button type="button" onClick={onAbrir} aria-expanded={abierta} className="flex items-center gap-3 min-w-0 flex-1 basis-[220px] text-left">
          <div className="w-12 shrink-0 text-center">
            <p className="font-display text-[15px] text-foreground leading-tight">{f.hora}</p>
            <p className="text-[10px] text-muted-foreground">{f.tipo === "reel" ? "Reel" : "Carrusel"}</p>
          </div>
          <Miniatura url={url} tipo={p.media_tipo} />
          <div className="min-w-0 space-y-1">
            <p className="text-[13px] text-foreground truncate">{p.title || p.topic}</p>
            <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] ${est.cls}`}>{est.label}</span>
          </div>
        </button>
        <div className="flex flex-wrap items-center gap-1.5">
          {redes.map(r => <BotonRed key={r} p={p} red={r} onClick={() => onRed(r)} />)}
          <button type="button" onClick={onAbrir} aria-label={abierta ? "Cerrar detalles" : "Ver detalles"} className="h-9 w-9 rounded-full inline-flex items-center justify-center text-muted-foreground hover:text-foreground">
            <ChevronDown className={`w-4 h-4 transition-transform ${abierta ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>
      {abierta && <Detalle p={p} url={url} redes={redes} ocupado={ocupado} onCaption={onCaption} onRedes={onRedes} onProgramar={onProgramar} onMover={onMover} onQuitar={onQuitar} onEditar={onEditar} />}
      {abierta && eleccion && <div className="px-3 pb-3">{eleccion}</div>}
    </article>
  );
}

function Detalle({ p, url, redes, ocupado, onCaption, onRedes, onProgramar, onMover, onQuitar, onEditar }: {
  p: Pieza; url?: string; redes: RedId[]; ocupado: boolean;
  onCaption: (c: string) => void; onRedes: (r: string[]) => void; onProgramar: () => void; onMover: () => void; onQuitar: () => void; onEditar: () => void;
}) {
  const [copy, setCopy] = useState(p.caption ?? "");
  useEffect(() => setCopy(p.caption ?? ""), [p.caption]);
  const fijo = p.pub_estado === "programado" || p.pub_estado === "publicado";
  const descargar = async () => {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(p.media_paths[0], 600, { download: true });
    if (data?.signedUrl) window.location.assign(data.signedUrl); else toast.error("No se pudo preparar la descarga.");
  };
  return (
    <div className="border-t border-border p-3 grid gap-3 sm:grid-cols-[150px_minmax(0,1fr)] text-[12px]">
      <div className="rounded-lg overflow-hidden bg-black aspect-[9/16] w-[150px] max-w-full mx-auto sm:mx-0">
        {url ? (p.media_tipo === "carrusel" ? <img src={url} alt="" className="w-full h-full object-contain" />
          : <video src={url} controls muted playsInline preload="metadata" className="w-full h-full object-contain" />)
          : <div className="w-full h-full flex items-center justify-center text-muted-foreground">Sin vista previa</div>}
      </div>
      <div className="space-y-2 min-w-0">
        <textarea value={copy} disabled={fijo} onChange={e => setCopy(e.target.value.slice(0, 2200))} onBlur={() => { if (copy !== (p.caption ?? "")) onCaption(copy); }}
          rows={4} placeholder="Copy de la publicación (con tu palabra clave)" className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[12px]" />
        {!fijo && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-muted-foreground mr-1">Programar en:</span>
            {REDES.filter(r => redes.includes(r.id) && redPosible(p, r.id)).map(r => {
              const on = p.pub_redes.includes(r.id);
              return <button key={r.id} type="button" aria-pressed={on} onClick={() => onRedes(on ? p.pub_redes.filter(x => x !== r.id) : [...p.pub_redes, r.id])}
                className={`h-7 px-2 rounded-full border text-[11px] ${on ? "border-primary/60 text-foreground" : "border-border text-muted-foreground"}`}>{r.nombre}</button>;
            })}
          </div>
        )}
        {p.pub_error && p.pub_estado === "error" && <p className="text-destructive">{p.pub_error}</p>}
        <div className="flex flex-wrap gap-1.5">
          {(p.pub_estado === "listo" || p.pub_estado === "error" || p.pub_estado === "borrador") && (
            <button type="button" disabled={ocupado || !copy.trim()} onClick={onProgramar} title={!copy.trim() ? "Escribe el copy primero" : undefined}
              className="h-8 px-3 rounded-full bg-primary text-primary-foreground font-semibold inline-flex items-center gap-1 disabled:opacity-50">
              {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Programar
            </button>
          )}
          <button type="button" onClick={() => void navigator.clipboard?.writeText(copy).then(() => toast.success("Copy copiado"))} className="h-8 px-3 rounded-full border border-border inline-flex items-center gap-1"><Copy className="w-3.5 h-3.5" />Copiar copy</button>
          <button type="button" onClick={() => void descargar()} className="h-8 px-3 rounded-full border border-border inline-flex items-center gap-1"><Download className="w-3.5 h-3.5" />Descargar</button>
          {!fijo && p.media_tipo !== "carrusel" && p.media_paths.length > 0 && (
            <button type="button" onClick={onEditar} className="h-8 px-3 rounded-full border border-border inline-flex items-center gap-1"><Wand2 className="w-3.5 h-3.5" />Editar video</button>
          )}
          {!fijo && <button type="button" onClick={onMover} className="h-8 px-3 rounded-full border border-border">Mover</button>}
          {!fijo && <button type="button" aria-label="Quitar de la casilla" onClick={onQuitar} className="h-8 w-8 rounded-full border border-border inline-flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>}
        </div>
        {Object.keys(p.pub_hechas ?? {}).length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            {REDES.filter(r => p.pub_hechas?.[r.id]).map(r => `${r.nombre} ${horaRD(p.pub_hechas![r.id].at)}`).join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}

function FilaVacia({ f, ocupado, pasada, onArchivos, onQuitar }: { f: Fila; ocupado: boolean; pasada: boolean; onArchivos: (fl: FileList) => void; onQuitar?: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const Icon = f.tipo === "reel" ? Film : Images;
  return (
    <div className={`rounded-xl border border-dashed border-border px-2.5 py-2 flex items-center gap-3 ${pasada ? "opacity-50" : ""}`}>
      <div className="w-12 shrink-0 text-center">
        <p className="font-display text-[15px] text-muted-foreground leading-tight">{f.hora}</p>
        <p className="text-[10px] text-muted-foreground">{f.tipo === "reel" ? "Reel" : "Carrusel"}</p>
      </div>
      <Icon className="w-4 h-4 text-muted-foreground" />
      <p className="text-[12px] text-muted-foreground flex-1">{pasada ? "Sin pieza" : "Casilla libre"}{f.extra ? " · extra" : ""}</p>
      {!pasada && (
        <>
          <input ref={ref} type="file" className="hidden" multiple={f.tipo === "carrusel"} accept={f.tipo === "reel" ? "video/*" : "image/*"}
            onChange={e => { if (e.target.files) onArchivos(e.target.files); e.target.value = ""; }} />
          <button type="button" disabled={ocupado} onClick={() => ref.current?.click()} className="h-8 px-3 rounded-full border border-border text-[12px] inline-flex items-center gap-1.5">
            {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} {f.tipo === "reel" ? "Subir el reel" : "Subir las láminas"}
          </button>
        </>
      )}
      {onQuitar && <button type="button" aria-label="Quitar casilla extra" onClick={onQuitar} className="h-8 w-8 rounded-full border border-border inline-flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>}
    </div>
  );
}

function AgregarCasilla({ existentes, onAgregar }: { existentes: string[]; onAgregar: (c: { hora: string; tipo: MediaTipo }) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [hora, setHora] = useState("");
  const [tipo, setTipo] = useState<MediaTipo>("reel");
  const [error, setError] = useState("");
  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="w-full rounded-xl border border-dashed border-border py-2.5 text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5">
        <Plus className="w-3.5 h-3.5" />Agregar casilla
      </button>
    );
  }
  const agregar = () => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) { setError("Elige la hora."); return; }
    if (existentes.includes(hora)) { setError("Ya hay una casilla a esa hora."); return; }
    onAgregar({ hora, tipo }); setAbierto(false); setHora(""); setError("");
  };
  return (
    <div className="rounded-xl border border-border p-2.5 flex flex-wrap items-center gap-2 text-[12px]">
      <input type="time" value={hora} onChange={e => { setHora(e.target.value); setError(""); }} aria-label="Hora de la casilla"
        className="h-9 rounded-lg border border-border bg-background px-2 text-base sm:text-sm" />
      {(["reel", "carrusel"] as MediaTipo[]).map(t => (
        <button key={t} type="button" aria-pressed={tipo === t} onClick={() => setTipo(t)}
          className={`h-8 px-3 rounded-full border ${tipo === t ? "border-primary/60 text-foreground" : "border-border text-muted-foreground"}`}>{t === "reel" ? "Reel" : "Carrusel"}</button>
      ))}
      <button type="button" onClick={agregar} className="h-8 px-3 rounded-full bg-primary text-primary-foreground font-semibold">Agregar</button>
      <button type="button" onClick={() => { setAbierto(false); setError(""); }} className="h-8 px-3 rounded-full border border-border">Cancelar</button>
      {error && <p className="w-full text-destructive">{error}</p>}
    </div>
  );
}
