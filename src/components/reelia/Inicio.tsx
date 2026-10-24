import { useState } from "react";
import { CalendarClock, Clapperboard, FileText, Lightbulb, Loader2, Trash2, UserRound } from "lucide-react";
import { MODO_NOMBRE, type ModoReel } from "@/lib/reelDinamico";
import type { Borrador, Diario, Identidad, Plantilla } from "./useStudioDatos";

/**
 * Pantalla de inicio de Reel Studio (25-oct-2026): ¿qué quieres crear? Tres tarjetas grandes (recrear un reel,
 * desde una idea, tengo mi guion), los borradores que dejó el productor diario, tus plantillas de referencia y
 * la producción diaria. Cada botón lleva a algo que funciona.
 */
export type Origen = "referencia" | "idea" | "guion";
const MODOS: ModoReel[] = ["espejo", "recrear", "inspiracion", "adaptacion"];

export function Inicio(p: {
  idn: Identidad;
  plantillas: Plantilla[] | null;
  borradores: Borrador[];
  diario: Diario;
  busy: boolean;
  onElegir: (o: Origen) => void;
  onIdentidad: () => void;
  onBorrador: (b: Borrador) => void;
  onDescartar: (b: Borrador) => void;
  onPlantilla: (pl: Plantilla) => void;
  onBorrarPlantilla: (pl: Plantilla) => void;
  onGuardarDiario: (d: Diario) => Promise<boolean>;
  onCrearAhora: () => Promise<void>;
}) {
  const [d, setD] = useState<Diario | null>(null);
  const diario = d ?? p.diario;
  const [temas, setTemas] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const temasTxt = temas ?? diario.temas.join("\n");
  const plantillas = p.plantillas ?? [];
  const tarjetas: { o: Origen; icon: typeof Clapperboard; titulo: string; linea: string; art: string }[] = [
    { o: "referencia", icon: Clapperboard, titulo: "Recrear un reel", linea: "¿Viste un reel que te gustó? Pega el enlace o súbelo y crea tu propia versión.", art: "from-cyan-500/30 via-sky-700/20 to-transparent" },
    { o: "idea", icon: Lightbulb, titulo: "Crear desde una idea", linea: "Cuéntanos tu idea y SUPERNOVA convierte tu mensaje en un reel.", art: "from-amber-500/30 via-orange-700/20 to-transparent" },
    { o: "guion", icon: FileText, titulo: "Tengo mi guion", linea: "Ya sabes qué quieres decir. Nosotros nos encargamos del video.", art: "from-violet-500/30 via-purple-700/20 to-transparent" },
  ];
  const guardar = async (next: Diario) => { setD(next); await p.onGuardarDiario(next); };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {tarjetas.map(t => (
          <button key={t.o} type="button" onClick={() => p.onElegir(t.o)} disabled={p.busy}
            className="group text-left rounded-2xl border border-border bg-card overflow-hidden hover:border-foreground/30 disabled:opacity-50">
            <div className={`relative h-28 bg-gradient-to-br ${t.art} flex items-center justify-center`}>
              {t.o === "referencia" && plantillas[0]?.thumbUrls.length ? (
                <div className="absolute inset-0 flex gap-1 p-2 opacity-80">{plantillas[0].thumbUrls.slice(0, 5).map((u, i) => u && <img key={i} src={u} alt="" className="h-full aspect-[9/16] rounded-md object-cover" />)}</div>
              ) : <t.icon className="w-9 h-9 text-foreground/80" />}
            </div>
            <div className="p-4 space-y-1">
              <p className="font-display text-[16px] font-semibold text-foreground">{t.titulo}</p>
              <p className="text-[13px] text-muted-foreground leading-snug">{t.linea}</p>
            </div>
          </button>
        ))}
      </div>

      <button type="button" onClick={p.onIdentidad} className="w-full flex items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left hover:border-foreground/30">
        <div className="flex -space-x-2">
          {p.idn.fotos.slice(0, 3).map((f, i) => <img key={i} src={f.url} alt="" className="w-10 h-10 rounded-full object-cover border-2 border-background" />)}
          {!p.idn.fotos.length && <span className="w-10 h-10 rounded-full border border-dashed border-border flex items-center justify-center"><UserRound className="w-4 h-4 text-muted-foreground" /></span>}
        </div>
        <div className="flex-1">
          <p className="text-[14px] font-semibold text-foreground">Mi identidad</p>
          <p className="text-[12px] text-muted-foreground">{p.idn.fotos.length ? `${p.idn.fotos.length} foto${p.idn.fotos.length > 1 ? "s" : ""} · tu voz · colores${p.idn.logo ? " · logo" : ""}. Se usa sola en cada reel.` : "Configúrala una vez: tu foto, tu voz, tus colores y tu logo."}</p>
        </div>
        <span className="text-[12px] text-primary">{p.idn.fotos.length ? "Editar" : "Configurar"}</span>
      </button>

      {p.borradores.length > 0 && (
        <section className="space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Borradores para aprobar</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {p.borradores.map(b => (
              <div key={b.id} className="rounded-xl border border-border p-3 space-y-2">
                <p className="text-[13px] font-semibold text-foreground line-clamp-1">{b.reel.titulo || b.tema}</p>
                <p className="text-[12px] text-muted-foreground line-clamp-2">{b.reel.guion}</p>
                <p className="text-[11px] text-muted-foreground">{MODO_NOMBRE[b.modo] ?? b.modo} · {b.reel.planos.length} planos · {new Date(b.created_at).toLocaleDateString("es")}{b.origen === "diario" ? " · productor diario" : ""}</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => p.onBorrador(b)} disabled={p.busy} className="h-9 px-3 rounded-full bg-primary text-primary-foreground text-[12px] font-semibold disabled:opacity-50">Abrir y producir</button>
                  <button type="button" onClick={() => p.onDescartar(b)} disabled={p.busy} className="h-9 px-3 rounded-full border border-border text-[12px] text-muted-foreground">Descartar</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {plantillas.length > 0 && (
        <section className="space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Tus plantillas de referencia</p>
          <div className="space-y-2">
            {plantillas.map(pl => (
              <div key={pl.id} className="rounded-xl border border-border p-2.5 space-y-2">
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-[13px] text-foreground line-clamp-1">{pl.nombre}</p>
                  <span className="text-[11px] text-muted-foreground">{pl.analisis.planos.length} planos · {Math.round(pl.duracion ?? pl.analisis.duracion)} s</span>
                  <button type="button" onClick={() => p.onPlantilla(pl)} disabled={p.busy} className="h-8 px-3 rounded-full border border-border text-[12px] text-foreground">Usar</button>
                  <button type="button" aria-label="Borrar plantilla" onClick={() => p.onBorrarPlantilla(pl)} disabled={p.busy} className="h-8 w-8 rounded-full border border-border flex items-center justify-center text-muted-foreground"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <div className="flex gap-1 overflow-x-auto">{pl.thumbUrls.map((u, i) => u && <img key={i} src={u} alt="" className="h-16 aspect-[9/16] rounded object-cover shrink-0" />)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-primary" />
          <p className="text-[14px] font-semibold text-foreground flex-1">Producción diaria</p>
          <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <input type="checkbox" checked={diario.activo} disabled={!plantillas.length} onChange={e => void guardar({ ...diario, activo: e.target.checked, temas: temasTxt.split("\n") })} /> {diario.activo ? "Activa" : "Apagada"}
          </label>
        </div>
        {!plantillas.length ? (
          <p className="text-[12px] text-muted-foreground">Primero recrea un reel: su análisis queda guardado como plantilla y el productor la usa cada día con tus temas, sin volver a analizarlo.</p>
        ) : (
          <>
            <p className="text-[12px] text-muted-foreground">Cada mañana (7:00, hora de RD) deja borradores nuevos con el estilo de tu plantilla sobre tus temas. Tú los apruebas y produces.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-[12px] text-muted-foreground">Plantilla
                <select value={diario.plantilla_id ?? ""} onChange={e => void guardar({ ...diario, plantilla_id: e.target.value || null, temas: temasTxt.split("\n") })}
                  className="mt-1 w-full min-h-[40px] rounded-lg border border-border bg-background px-2 text-[13px] text-foreground">
                  <option value="">Elige una</option>
                  {plantillas.map(pl => <option key={pl.id} value={pl.id}>{pl.nombre}</option>)}
                </select>
              </label>
              <div className="text-[12px] text-muted-foreground">Reels por día
                <div className="mt-1 flex gap-2">{[1, 2].map(n => <button key={n} type="button" onClick={() => void guardar({ ...diario, por_dia: n, temas: temasTxt.split("\n") })} className={`h-10 px-4 rounded-full border text-[12px] ${diario.por_dia === n ? "border-foreground/40 text-foreground bg-card" : "border-border"}`}>{n}</button>)}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">{MODOS.map(m => <button key={m} type="button" onClick={() => void guardar({ ...diario, modo: m, temas: temasTxt.split("\n") })} className={`h-9 px-3 rounded-full border text-[12px] ${diario.modo === m ? "border-foreground/40 text-foreground bg-card" : "border-border text-muted-foreground"}`}>{MODO_NOMBRE[m]}</button>)}</div>
            <label className="block text-[12px] text-muted-foreground">Tus temas (uno por línea; se van rotando)
              <textarea value={temasTxt} rows={4} onChange={e => setTemas(e.target.value.slice(0, 3000))} onBlur={() => void guardar({ ...diario, temas: temasTxt.split("\n") })}
                placeholder={"Cómo saber si un producto digital ya vende\nCuánto cobrar por tu primer producto"} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground" />
            </label>
            <button type="button" disabled={creando || !diario.plantilla_id || !temasTxt.trim()}
              onClick={async () => { setCreando(true); try { await guardar({ ...diario, activo: true, temas: temasTxt.split("\n") }); await p.onCrearAhora(); } finally { setCreando(false); } }}
              className="h-10 px-4 rounded-full border border-border text-[12px] text-foreground disabled:opacity-50">
              {creando ? <><Loader2 className="inline w-3.5 h-3.5 animate-spin mr-1" />Escribiendo borradores…</> : "Crear los borradores de hoy ahora"}
            </button>
          </>
        )}
      </section>
    </div>
  );
}
