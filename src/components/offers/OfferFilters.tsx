import { useState } from "react";
import { SlidersHorizontal, X, Check, Search } from "lucide-react";
import { ModalPortal } from "@/components/ModalPortal";
import { Select, SelectTrigger, SelectContent, SelectItem } from "@/components/ui/select";

/**
 * Filtros de Ofertas (29-oct-2026, estilo Cazador Swipe):
 *  · Computadora: una fila de píldoras (cada una abre su lista), "Solo las que haces tú solo", "Limpiar filtros"
 *    y el orden a la derecha.
 *  · Teléfono: buscador + botón "Filtros" que abre una hoja con todas las opciones a la vista y el botón
 *    "Ver N ofertas". Los filtros se aplican al tocarlos, así N es el conteo real de la base, no un cálculo.
 * Un filtro vale "all" cuando está apagado.
 */
export interface FiltroOferta {
  key: string;
  titulo: string;
  /** Texto de la opción "todas" (ej.: "Todos los temas"). */
  todos: string;
  valor: string;
  opciones: { v: string; l: string }[];
  cambiar: (v: string) => void;
}
export interface InterruptorOferta { label: string; corto: string; on: boolean; cambiar: (on: boolean) => void }

interface Props {
  search: string;
  onSearch: (v: string) => void;
  filtros: FiltroOferta[];
  orden: FiltroOferta;
  interruptor?: InterruptorOferta;
  activos: number;
  onClear: () => void;
  total: number;
  loading: boolean;
}

export function OfferFilters({ search, onSearch, filtros, orden, interruptor, activos, onClear, total, loading }: Props) {
  const [sheet, setSheet] = useState(false);
  const ordenLabel = orden.opciones.find((x) => x.v === orden.valor)?.l ?? orden.todos;

  return (
    <div className="space-y-2.5">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input value={search} onChange={(e) => onSearch(e.target.value)} aria-label="Buscar ofertas"
          placeholder="Busca un producto, una marca o un tema (ej: ansiedad, inglés)…"
          className="w-full h-11 bg-secondary/50 border border-border rounded-xl pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40" />
        {search && (
          <button onClick={() => onSearch("")} aria-label="Borrar búsqueda"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Teléfono: un botón para todos los filtros + el orden */}
      <div className="flex sm:hidden items-center gap-2">
        <button onClick={() => setSheet(true)}
          className={`h-10 px-4 rounded-full border text-[13px] font-semibold inline-flex items-center gap-2 ${activos ? "border-foreground/60 bg-card text-foreground" : "border-border bg-secondary/40 text-foreground"}`}>
          <SlidersHorizontal className="w-4 h-4" /> Filtros
          {activos > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-foreground text-background text-[11px] font-bold inline-flex items-center justify-center tabular-nums">{activos}</span>}
        </button>
        <ChipSelect f={orden} label={ordenLabel} className="min-w-0 flex-1" />
      </div>

      {/* Computadora: todo en una fila */}
      <div className="hidden sm:flex flex-wrap items-center gap-2">
        {filtros.map((f) => <ChipSelect key={f.key} f={f} />)}
        {interruptor && (
          <button onClick={() => interruptor.cambiar(!interruptor.on)} aria-pressed={interruptor.on}
            className={`h-9 px-3.5 rounded-full border text-[12.5px] font-semibold inline-flex items-center gap-1.5 transition-colors ${interruptor.on ? "bg-success/10 text-success border-success/40" : "bg-secondary/40 text-muted-foreground border-border hover:text-foreground"}`}>
            {interruptor.on && <Check className="w-3.5 h-3.5" />} {interruptor.label}
          </button>
        )}
        {activos > 0 && (
          <button onClick={onClear} className="h-9 px-3 rounded-full text-[12.5px] font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <X className="w-3.5 h-3.5" /> Limpiar filtros
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[12px] text-muted-foreground">Ordenar:</span>
          <ChipSelect f={orden} label={ordenLabel} />
        </div>
      </div>

      {sheet && (
        <FilterSheet filtros={filtros} interruptor={interruptor} activos={activos} onClear={onClear}
          total={total} loading={loading} onClose={() => setSheet(false)} />
      )}
    </div>
  );
}

function ChipSelect({ f, label, className = "" }: { f: FiltroOferta; label?: string; className?: string }) {
  const activo = f.valor !== "all" && !label;
  const texto = label ?? (activo ? (f.opciones.find((x) => x.v === f.valor)?.l ?? f.titulo) : f.titulo);
  return (
    <Select value={f.valor} onValueChange={f.cambiar}>
      <SelectTrigger aria-label={f.titulo}
        className={`h-10 sm:h-9 w-auto max-w-full rounded-full px-3.5 gap-1.5 text-[12.5px] font-semibold ${activo ? "border-foreground/60 bg-card text-foreground" : "border-border bg-secondary/40 text-foreground/85 hover:text-foreground"} ${className}`}>
        <span className="truncate max-w-[200px]">{texto}</span>
      </SelectTrigger>
      <SelectContent>
        {f.todos && <SelectItem value="all">{f.todos}</SelectItem>}
        {f.opciones.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function FilterSheet({ filtros, interruptor, activos, onClear, total, loading, onClose }: {
  filtros: FiltroOferta[]; interruptor?: InterruptorOferta; activos: number; onClear: () => void;
  total: number; loading: boolean; onClose: () => void;
}) {
  return (
    <ModalPortal onClose={onClose}>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
        <div role="dialog" aria-modal="true" aria-label="Filtros" onClick={(e) => e.stopPropagation()}
          className="bg-card border border-border w-full max-h-[88vh] supports-[height:100dvh]:max-h-[88dvh] rounded-t-3xl flex flex-col overflow-hidden shadow-2xl">
          <div className="pt-2.5 pb-1 flex justify-center shrink-0" aria-hidden><span className="w-10 h-1 rounded-full bg-border" /></div>
          <header className="px-4 pb-3 flex items-center justify-between shrink-0">
            <h3 className="font-display font-semibold text-[18px] text-foreground">Filtros</h3>
            <button onClick={onClose} aria-label="Cerrar" className="w-10 h-10 -mr-1 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary">
              <X className="w-5 h-5" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4 space-y-5">
            {interruptor && (
              <button onClick={() => interruptor.cambiar(!interruptor.on)} aria-pressed={interruptor.on}
                className="w-full flex items-center justify-between gap-3 rounded-xl border border-border px-3.5 py-3 text-left">
                <span className="text-[14px] font-semibold text-foreground">{interruptor.label}</span>
                <span className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 ${interruptor.on ? "bg-foreground border-foreground text-background" : "border-border"}`}>
                  {interruptor.on && <Check className="w-4 h-4" />}
                </span>
              </button>
            )}
            {filtros.map((f) => (
              <section key={f.key}>
                <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-2">{f.titulo}</h4>
                <div className="flex flex-wrap gap-2">
                  {[{ v: "all", l: f.todos }, ...f.opciones].map((o) => {
                    const on = f.valor === o.v;
                    return (
                      <button key={o.v} onClick={() => f.cambiar(o.v)} aria-pressed={on}
                        className={`min-h-[40px] px-3.5 rounded-full border text-[13px] font-medium inline-flex items-center gap-1.5 transition-colors ${on ? "bg-foreground text-background border-foreground" : "border-border text-foreground hover:border-foreground/40"}`}>
                        {on && <Check className="w-3.5 h-3.5" />}{o.l}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <footer className="shrink-0 border-t border-border bg-card/95 backdrop-blur px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center gap-2">
            <button onClick={onClear} disabled={!activos}
              className="h-12 px-4 rounded-xl border border-border text-[13px] font-semibold text-foreground disabled:opacity-40">
              Limpiar
            </button>
            <button onClick={onClose} className="flex-1 h-12 btn-primary-nova rounded-xl text-[14px] font-semibold">
              {loading ? "Buscando…" : `Ver ${total.toLocaleString("es-ES")} ${total === 1 ? "oferta" : "ofertas"}`}
            </button>
          </footer>
        </div>
      </div>
    </ModalPortal>
  );
}
