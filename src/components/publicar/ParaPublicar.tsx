import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, ChevronLeft, ChevronRight, Film, Images, Loader2, Send, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { fnErrorMessage, fnHeaders } from "@/lib/fnAuth";
import { CASILLAS, ESTADO_PUB, diaRD, etiquetaCasilla, instante, semana, siguienteLibre, type MediaTipo, type PubEstado } from "@/lib/publicar";

/**
 * Para publicar (26-oct-2026, pedido de Jean): la biblioteca visual de lo que sale cada día y a qué hora.
 * 7 días × 3 casillas en hora de RD (12:30 reel · 18:30 carrusel · 21:00 reel). Cada casilla muestra la pieza
 * (video o láminas), su copy y su estado. «Programar» lo hace el servidor (edge function publicar → Upload-Post y
 * Notion); aquí solo se ve, se sube, se escribe el copy y se mueve. Los reels terminados en Reel Studio entran solos.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabase as any;
const BUCKET = "publicaciones";
const REDES: { id: string; label: string }[] = [{ id: "instagram", label: "Instagram" }, { id: "youtube", label: "YouTube" }, { id: "tiktok", label: "TikTok" }];

export type Pieza = {
  id: string; title: string | null; topic: string; caption: string | null; slot_at: string; media_tipo: MediaTipo | null;
  media_paths: string[]; pub_estado: PubEstado; pub_redes: string[]; pub_error: string | null;
};

export function ParaPublicar() {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [desde, setDesde] = useState(() => diaRD(new Date()));
  const [piezas, setPiezas] = useState<Pieza[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string>("");
  const dias = useMemo(() => semana(desde), [desde]);

  const cargar = useCallback(async () => {
    if (!uid) return;
    const ini = instante(dias[0], "00:00"), fin = instante(dias[6], "23:59");
    const { data, error } = await db().from("content_items")
      .select("id, title, topic, caption, slot_at, media_tipo, media_paths, pub_estado, pub_redes, pub_error")
      .eq("user_id", uid).gte("slot_at", ini).lte("slot_at", fin).order("slot_at");
    if (error) { toast.error("No se pudo cargar lo que toca publicar."); setPiezas([]); return; }
    const lista = (data ?? []) as Pieza[];
    setPiezas(lista);
    const paths = lista.map(p => p.media_paths[0]).filter(Boolean);
    if (paths.length) {
      const { data: s } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
      setUrls(Object.fromEntries((s ?? []).filter(x => x.signedUrl).map(x => [x.path ?? "", x.signedUrl])));
    }
  }, [uid, dias]);
  useEffect(() => { void cargar(); }, [cargar]);

  const porCasilla = useMemo(() => new Map((piezas ?? []).map(p => [new Date(p.slot_at).toISOString(), p])), [piezas]);

  const subir = async (slot: string, tipo: MediaTipo, files: FileList) => {
    if (!uid || !files.length) return;
    setOcupado(slot);
    try {
      const lista = [...files].slice(0, tipo === "reel" ? 1 : 10);
      if (tipo === "reel" && !lista[0].type.startsWith("video/")) throw new Error("En esta casilla va un reel: sube un video.");
      if (tipo === "carrusel" && lista.some(f => !f.type.startsWith("image/"))) throw new Error("En esta casilla va un carrusel: sube las imágenes.");
      const carpeta = `${uid}/${crypto.randomUUID()}`;
      const paths: string[] = [];
      for (const [k, f] of lista.entries()) {
        const p = `${carpeta}/${String(k + 1).padStart(2, "0")}-${f.name.replace(/[^\w.-]+/g, "-").slice(-60)}`;
        const up = await supabase.storage.from(BUCKET).upload(p, f, { contentType: f.type, upsert: false });
        if (up.error) throw new Error(`No se pudo subir ${f.name}.`);
        paths.push(p);
      }
      const nombre = lista[0].name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").slice(0, 120);
      const { error } = await db().from("content_items").insert({
        user_id: uid, topic: nombre || (tipo === "reel" ? "Reel" : "Carrusel"), title: nombre, kind: tipo === "reel" ? "corto" : "carrusel",
        platform: tipo === "reel" ? "reels" : "instagram", status: "grabado", source: "para-publicar", due: slot.slice(0, 10),
        slot_at: slot, media_tipo: tipo, media_paths: paths, pub_estado: "listo", pub_redes: tipo === "reel" ? ["instagram", "youtube"] : ["instagram"],
      });
      if (error) throw new Error("No se pudo guardar en la casilla.");
      toast.success("Listo en su casilla. Escribe el copy y toca Programar.");
      await cargar();
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo subir."); }
    finally { setOcupado(""); }
  };

  const guardar = async (p: Pieza, patch: Partial<Pieza>) => {
    setPiezas(l => (l ?? []).map(x => (x.id === p.id ? { ...x, ...patch } : x)));
    const { error } = await db().from("content_items").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", p.id);
    if (error) toast.error("No se pudo guardar el cambio.");
  };

  const llamar = async (action: "programar" | "notion", p: Pieza) => {
    setOcupado(p.slot_at);
    try {
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/publicar`, {
        method: "POST", headers: await fnHeaders(), body: JSON.stringify({ action, item_id: p.id }),
      });
      if (!r.ok) throw new Error(await fnErrorMessage(r, "No se pudo programar."));
      const d = await r.json();
      if (action === "programar") toast.success(`Programado para ${etiquetaCasilla(p.slot_at)}.`, { description: d.notion === "sin conexión" ? "Notion todavía no está conectado." : d.notion === "actualizado" ? "Notion quedó al día." : undefined });
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo programar."); }
    finally { setOcupado(""); await cargar(); }
  };

  const mover = async (p: Pieza) => {
    const tipo = p.media_tipo ?? "reel";
    // Todas las casillas ocupadas desde ahora (no solo las de esta semana), para no chocar con otra pieza.
    const { data: futuras } = await db().from("content_items").select("slot_at").eq("user_id", uid).gte("slot_at", new Date().toISOString());
    const ocupadas = ((futuras ?? []) as { slot_at: string }[]).map(x => x.slot_at);
    const libre = siguienteLibre(tipo, ocupadas, new Date(p.slot_at));
    if (!libre) { toast.error("No hay casillas libres en los próximos 60 días."); return; }
    await guardar(p, { slot_at: libre, pub_estado: p.pub_estado === "error" ? "listo" : p.pub_estado });
    toast.success(`Movido a ${etiquetaCasilla(libre)}.`);
    await cargar();
  };

  const hoy = diaRD(new Date());
  return (
    <section className="card-surface rounded-2xl p-4 sm:p-5 space-y-4" aria-label="Para publicar">
      <div className="flex flex-wrap items-center gap-3">
        <CalendarClock className="w-5 h-5 text-primary" />
        <div className="flex-1 min-w-[180px]">
          <h2 className="font-display text-lg">Para publicar</h2>
          <p className="text-[12px] text-muted-foreground">Cada día: 12:30 reel · 18:30 carrusel · 21:00 reel (hora de RD). Los reels que terminas en Reel Studio entran solos.</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Semana anterior" onClick={() => setDesde(semana(diaRD(new Date(new Date(`${desde}T12:00:00-04:00`).getTime() - 7 * 86_400_000)))[0])}
            className="h-9 w-9 rounded-full border border-border flex items-center justify-center"><ChevronLeft className="w-4 h-4" /></button>
          <button type="button" onClick={() => setDesde(hoy)} className="h-9 px-3 rounded-full border border-border text-[12px]">Hoy</button>
          <button type="button" aria-label="Semana siguiente" onClick={() => setDesde(semana(dias[6])[1])}
            className="h-9 w-9 rounded-full border border-border flex items-center justify-center"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      {!piezas ? <p className="text-sm text-muted-foreground">Cargando…</p> : (
        <div className="space-y-4">
          {dias.map(dia => (
            <div key={dia} className="space-y-2">
              <p className={`text-[12px] font-semibold ${dia === hoy ? "text-primary" : "text-muted-foreground"}`}>
                {dia === hoy ? "Hoy · " : ""}{etiquetaCasilla(instante(dia, "12:00")).split(" · ")[0]}
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                {CASILLAS.map(c => {
                  const slot = instante(dia, c.hora);
                  const p = porCasilla.get(slot);
                  return p ? (
                    <Tarjeta key={slot} p={p} url={urls[p.media_paths[0]]} ocupado={ocupado === slot} hora={c.hora}
                      onCaption={caption => void guardar(p, { caption })} onRedes={pub_redes => void guardar(p, { pub_redes })}
                      onProgramar={() => void llamar("programar", p)} onMover={() => void mover(p)}
                      onPublicado={async () => { await guardar(p, { pub_estado: "publicado" }); void llamar("notion", p); }}
                      onQuitar={async () => { await db().from("content_items").update({ slot_at: null, pub_estado: "borrador" }).eq("id", p.id); await cargar(); }} />
                  ) : (
                    <Vacia key={slot} hora={c.hora} tipo={c.tipo} ocupado={ocupado === slot} pasada={new Date(slot).getTime() < Date.now()}
                      onArchivos={files => void subir(slot, c.tipo, files)} />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Vacia({ hora, tipo, ocupado, pasada, onArchivos }: { hora: string; tipo: MediaTipo; ocupado: boolean; pasada: boolean; onArchivos: (f: FileList) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const Icon = tipo === "reel" ? Film : Images;
  return (
    <div className={`rounded-xl border border-dashed border-border p-3 min-h-[120px] flex flex-col items-center justify-center gap-2 text-center ${pasada ? "opacity-50" : ""}`}>
      <p className="text-[12px] text-muted-foreground"><Icon className="inline w-3.5 h-3.5 mr-1" />{hora} · {tipo === "reel" ? "Reel" : "Carrusel"}</p>
      {!pasada && (
        <>
          <input ref={ref} type="file" className="hidden" multiple={tipo === "carrusel"} accept={tipo === "reel" ? "video/*" : "image/*"}
            onChange={e => { if (e.target.files) onArchivos(e.target.files); e.target.value = ""; }} />
          <button type="button" disabled={ocupado} onClick={() => ref.current?.click()} className="h-9 px-3 rounded-full border border-border text-[12px] inline-flex items-center gap-1.5">
            {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} {tipo === "reel" ? "Subir el reel" : "Subir las láminas"}
          </button>
        </>
      )}
    </div>
  );
}

function Tarjeta({ p, url, hora, ocupado, onCaption, onRedes, onProgramar, onMover, onPublicado, onQuitar }: {
  p: Pieza; url?: string; hora: string; ocupado: boolean;
  onCaption: (c: string) => void; onRedes: (r: string[]) => void; onProgramar: () => void; onMover: () => void; onPublicado: () => void; onQuitar: () => void;
}) {
  const [copy, setCopy] = useState(p.caption ?? "");
  useEffect(() => setCopy(p.caption ?? ""), [p.caption]);
  const est = ESTADO_PUB[p.pub_estado];
  const fijo = p.pub_estado === "programado" || p.pub_estado === "publicado";
  return (
    <article className="rounded-xl border border-border bg-card p-2.5 space-y-2 text-[12px]">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-foreground">{hora}</span>
        <span className="text-muted-foreground">{p.media_tipo === "carrusel" ? `Carrusel · ${p.media_paths.length} láminas` : "Reel"}</span>
        <span className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] ${est.cls}`}>{est.label}</span>
      </div>
      <div className="rounded-lg overflow-hidden bg-black aspect-[9/16] max-h-56 mx-auto">
        {url ? (p.media_tipo === "carrusel" ? <img src={url} alt="" className="w-full h-full object-contain" />
          : <video src={url} controls muted playsInline preload="metadata" className="w-full h-full object-contain" />)
          : <div className="w-full h-full flex items-center justify-center text-muted-foreground">Sin vista previa</div>}
      </div>
      <p className="text-foreground line-clamp-2">{p.title || p.topic}</p>
      <textarea value={copy} disabled={fijo} onChange={e => setCopy(e.target.value.slice(0, 2200))} onBlur={() => { if (copy !== (p.caption ?? "")) onCaption(copy); }}
        rows={3} placeholder="Copy de la publicación (con tu palabra clave)" className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[12px]" />
      {p.media_tipo !== "carrusel" && !fijo && (
        <div className="flex flex-wrap gap-1">
          {REDES.map(r => {
            const on = p.pub_redes.includes(r.id);
            return <button key={r.id} type="button" aria-pressed={on} onClick={() => onRedes(on ? p.pub_redes.filter(x => x !== r.id) : [...p.pub_redes, r.id])}
              className={`h-7 px-2 rounded-full border text-[11px] ${on ? "border-primary/60 text-foreground" : "border-border text-muted-foreground"}`}>{r.label}</button>;
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
        {p.pub_estado === "programado" && <button type="button" onClick={onPublicado} className="h-8 px-3 rounded-full border border-border">Ya se publicó</button>}
        {!fijo && <button type="button" onClick={onMover} className="h-8 px-3 rounded-full border border-border">Mover</button>}
        {!fijo && <button type="button" aria-label="Quitar de la casilla" onClick={onQuitar} className="h-8 w-8 rounded-full border border-border inline-flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>}
      </div>
    </article>
  );
}
