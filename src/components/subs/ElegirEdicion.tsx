import { useState } from "react";
import { ChevronLeft, Loader2, X } from "lucide-react";
import { EDITAR_OPCIONES, OPCIONES_EDICION, type ModoEdicion } from "@/lib/edicionVideo";

/**
 * ¿Qué hacemos con este video? (30-oct-2026, Jean). Al subir un video: solo programarlo (en Para publicar), subtítulos
 * o editarlo; «Editarlo» abre sus 3 formas (simple, con B-roll, plantilla Reel dinámico). Lo usan Para publicar y
 * «Sube tu video».
 */
export function ElegirEdicion({ nombre, conProgramar, ocupado, onElegir, onCancelar }: {
  nombre?: string; conProgramar?: boolean; ocupado?: boolean; onElegir: (m: ModoEdicion) => void; onCancelar?: () => void;
}) {
  const [editar, setEditar] = useState(false);
  const opciones = editar ? EDITAR_OPCIONES : OPCIONES_EDICION.filter(o => conProgramar || o.id !== "programar");
  return (
    <div className="rounded-xl border border-primary/40 bg-primary/[0.04] p-3 space-y-2" role="group" aria-label="Qué hacemos con este video">
      <div className="flex items-start gap-2">
        {editar && (
          <button type="button" aria-label="Volver" onClick={() => setEditar(false)} className="h-7 w-7 rounded-full border border-border inline-flex items-center justify-center"><ChevronLeft className="w-3.5 h-3.5" /></button>
        )}
        <p className="flex-1 text-[13px] font-semibold text-foreground">
          {editar ? "¿Cómo lo edito?" : "¿Qué hacemos con este video?"}
          {nombre ? <span className="block text-[11px] font-normal text-muted-foreground truncate">{nombre}</span> : null}
        </p>
        {onCancelar && (
          <button type="button" aria-label="Cancelar" onClick={onCancelar} className="h-7 w-7 rounded-full border border-border inline-flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
        )}
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {opciones.map(o => (
          <button key={o.id} type="button" disabled={ocupado} onClick={() => (o.id === "editar" ? setEditar(true) : onElegir(o.id as ModoEdicion))}
            className="rounded-lg border border-border bg-card p-2.5 text-left hover:border-foreground/40 disabled:opacity-50">
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] font-semibold text-foreground">{o.titulo}</span>
              <span className={`shrink-0 text-[10px] ${o.precio === "Gratis" ? "text-emerald-400" : "text-muted-foreground"}`}>{o.precio}</span>
            </span>
            <span className="block text-[11px] text-muted-foreground">{o.linea}</span>
          </button>
        ))}
      </div>
      {ocupado && <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Subiendo tu video…</p>}
    </div>
  );
}
