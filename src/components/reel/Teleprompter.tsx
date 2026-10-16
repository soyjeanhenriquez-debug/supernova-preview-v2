import { useEffect, useRef, useState } from "react";
import { Minus, Pause, Play, Plus, RotateCcw, X } from "lucide-react";
import { speakSeconds } from "@/lib/reel";

/**
 * Teleprompter a pantalla completa (Analiza un Reel v2, 16-oct-2026): solo lo que se dice, una frase
 * por párrafo, letra grande y ajustable, avance automático con velocidad. Pensado para grabar con el
 * celular: se apoya el teléfono, se toca "Empezar" y el texto sube solo. La pantalla no se apaga
 * mientras está abierto (si el navegador lo permite).
 */
export function Teleprompter({ lines, ganchos, hook, onHook, onClose }: {
  lines: string[];
  ganchos: string[];
  hook: number;
  onHook: (i: number) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4); // 1–10 → 12–120 px por segundo
  const [size, setSize] = useState(() => (window.innerWidth < 640 ? 30 : 42));

  // Sin scroll de la página de atrás; Esc cierra y la barra espaciadora pausa.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === " ") { e.preventDefault(); setPlaying(p => !p); }
    };
    window.addEventListener("keydown", key);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", key); };
  }, [onClose]);

  // Que la pantalla no se apague mientras graba.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then(l => { lock = l; }).catch(() => { /* sin permiso: sigue igual */ });
    return () => { void lock?.release().catch(() => undefined); };
  }, []);

  // Avance automático: suma píxeles según el tiempo real entre cuadros (igual en cualquier teléfono).
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now(), acc = 0;
    const tick = (t: number) => {
      const el = box.current;
      if (!el) return;
      acc += ((t - last) / 1000) * speed * 12;
      last = t;
      if (acc >= 1) { el.scrollTop += Math.floor(acc); acc -= Math.floor(acc); }
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) { setPlaying(false); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  const restart = () => { setPlaying(false); if (box.current) box.current.scrollTop = 0; };
  const secs = speakSeconds(lines);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Teleprompter">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} aria-label="Cerrar el teleprompter" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"><X className="w-5 h-5" /></button>
        <span className="text-[12px] text-white/60">≈ {secs} s hablando</span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setSize(s => Math.max(20, s - 4))} aria-label="Letra más chica" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"><Minus className="w-4 h-4" /></button>
          <span className="w-8 text-center text-[12px] text-white/60">Aa</span>
          <button type="button" onClick={() => setSize(s => Math.min(72, s + 4))} aria-label="Letra más grande" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"><Plus className="w-4 h-4" /></button>
        </div>
      </div>

      {ganchos.length > 1 && (
        <div className="scroll-row flex gap-2 px-3 py-2" role="group" aria-label="Elige el gancho">
          {ganchos.map((g, i) => (
            <button key={g} type="button" onClick={() => { onHook(i); restart(); }} aria-pressed={hook === i}
              className={`shrink-0 max-w-[80vw] truncate rounded-full border px-3 min-h-[36px] text-[12px] ${hook === i ? "border-primary bg-primary/20 text-white" : "border-white/20 text-white/70"}`}>
              Gancho {i + 1}: {g}
            </button>
          ))}
        </div>
      )}

      <div className="relative flex-1 min-h-0">
        {/* Franja de lectura: los ojos van aquí, cerca del lente. */}
        <div className="pointer-events-none absolute inset-x-0 top-[22%] h-[2px] bg-primary/50" aria-hidden />
        <div ref={box} className="h-full overflow-y-auto overscroll-contain px-6 sm:px-16" onClick={() => setPlaying(p => !p)}>
          <div className="mx-auto max-w-3xl pt-[22vh] pb-[70vh] space-y-[0.9em] font-semibold leading-snug" style={{ fontSize: size }}>
            {lines.map((l, i) => <p key={i}>{l}</p>)}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-white/10 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button type="button" onClick={restart} aria-label="Volver al inicio" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"><RotateCcw className="w-5 h-5" /></button>
        <button type="button" onClick={() => setPlaying(p => !p)}
          className="btn-primary-nova inline-flex min-h-[48px] flex-1 sm:flex-none items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold">
          {playing ? <><Pause className="w-4 h-4" /> Pausar</> : <><Play className="w-4 h-4" /> Empezar</>}
        </button>
        <label className="flex items-center gap-2 text-[12px] text-white/70">
          Velocidad
          <input type="range" min={1} max={10} value={speed} onChange={e => setSpeed(Number(e.target.value))} className="w-24 sm:w-40 accent-[hsl(var(--primary))]" aria-label="Velocidad" />
        </label>
      </div>
    </div>
  );
}
