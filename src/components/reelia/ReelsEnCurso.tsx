import { useEffect, useState } from "react";
import { Clapperboard, FileText, Lightbulb, Trash2 } from "lucide-react";

/**
 * "Sigue donde lo dejaste" (27-oct-2026, Jean: la lista de texto "se ve muy poco intuitiva"): cada reel en curso es
 * una portada vertical como un reel de verdad, con su origen, su avance en los 4 pasos y su estado. Un toque lo abre.
 */
export type ReelEnCurso = {
  id: string;
  titulo: string;
  origen: "referencia" | "idea" | "guion";
  /** 0 a 3: Tu idea · Tus recursos · Tu video · Crear reel. */
  paso: number;
  preparado: boolean;
  actualizado?: number;
  abierto: boolean;
  /** El comienzo del guion o de la idea, para la portada sin imagen. */
  texto: string;
};

const ORIGEN = {
  referencia: { nombre: "Recreado", Icon: Clapperboard, fondo: "from-sky-500/15 via-background to-background" },
  idea: { nombre: "Desde una idea", Icon: Lightbulb, fondo: "from-emerald-500/15 via-background to-background" },
  guion: { nombre: "Tu guion", Icon: FileText, fondo: "from-violet-500/15 via-background to-background" },
} as const;
const PASOS = ["Tu idea", "Tus recursos", "Tu video", "Crear reel"];

function cuando(ms?: number): string {
  if (!ms) return "";
  const d = new Date(ms), hoy = new Date();
  const dias = Math.round((new Date(hoy.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (dias <= 0) return `Hoy ${d.toLocaleTimeString("es", { hour: "numeric", minute: "2-digit" })}`;
  if (dias === 1) return "Ayer";
  return d.toLocaleDateString("es", { day: "numeric", month: "short" });
}

function Portada({ r, cargar }: { r: ReelEnCurso; cargar: (id: string) => Promise<string | null> }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true, url: string | null = null;
    void cargar(r.id).then(u => { url = u; if (vivo) setSrc(u); }).catch(() => undefined);
    return () => { vivo = false; if (url?.startsWith("blob:")) URL.revokeObjectURL(url); };
  }, [r.id, cargar]);
  const o = ORIGEN[r.origen];
  if (src) return <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />;
  return (
    <div className={`absolute inset-0 bg-gradient-to-b ${o.fondo} p-3 pt-10`}>
      <p className="font-display text-[15px] leading-snug text-foreground/90 line-clamp-6">«{r.texto || r.titulo}»</p>
    </div>
  );
}

export function ReelsEnCurso({ reels, cargarPortada, onAbrir, onBorrar }: {
  reels: ReelEnCurso[];
  cargarPortada: (id: string) => Promise<string | null>;
  onAbrir: (id: string) => void;
  onBorrar: (id: string) => void;
}) {
  if (!reels.length) return null;
  return (
    <section className="space-y-3" aria-label="Tus reels en curso">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[17px] font-semibold text-foreground">Sigue donde lo dejaste <span className="text-muted-foreground font-normal">· {reels.length}</span></h2>
        <p className="text-[12px] text-muted-foreground hidden sm:block">Toca un reel para seguir. Ninguno se pierde al empezar otro.</p>
      </div>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 snap-x snap-mandatory [scrollbar-width:thin]">
        {reels.map(r => {
          const o = ORIGEN[r.origen];
          const paso = Math.max(0, Math.min(3, r.paso));
          return (
            <div key={r.id} className="group relative w-[150px] sm:w-[168px] shrink-0 snap-start">
              <button type="button" onClick={() => onAbrir(r.id)} aria-label={`Abrir ${r.titulo}`}
                className={`block w-full text-left rounded-2xl border bg-card overflow-hidden transition-colors ${r.abierto ? "border-primary/70" : "border-border hover:border-foreground/40"}`}>
                <div className="relative aspect-[9/16] bg-secondary/30">
                  <Portada r={r} cargar={cargarPortada} />
                  <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm">
                    <o.Icon className="w-3 h-3" />{o.nombre}
                  </span>
                  {r.abierto && <span className="absolute left-2 top-8 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">Abierto</span>}
                  <div className="absolute inset-x-0 bottom-0 p-2.5 space-y-2">
                    <p className="font-display text-[13px] font-semibold leading-tight text-white line-clamp-2">{r.titulo}</p>
                    <div className="flex gap-1" aria-label={`Paso ${paso + 1} de 4`}>
                      {PASOS.map((_, i) => <span key={i} className={`h-1 flex-1 rounded-full ${i <= paso && r.preparado ? "bg-white" : i === 0 ? "bg-white/60" : "bg-white/20"}`} />)}
                    </div>
                  </div>
                </div>
                <div className="px-2.5 py-2">
                  <p className="text-[11px] text-foreground truncate">{r.preparado ? `Paso ${paso + 1} · ${PASOS[paso]}` : "Sin preparar"}</p>
                  <p className="text-[10px] text-muted-foreground">{cuando(r.actualizado)}</p>
                </div>
              </button>
              <button type="button" onClick={() => onBorrar(r.id)} aria-label={`Borrar ${r.titulo}`}
                className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white/80 backdrop-blur-sm hover:text-white md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
