import { useEffect, useRef, useState } from "react";
import { Minus, Pause, Play, Plus, RefreshCcw, SwitchCamera, X } from "lucide-react";
import { promptLines } from "@/lib/reel";
import { formatoGrabacion } from "@/lib/grabacion";

/**
 * Grabarte con tu guion encima (27-oct-2026): la cámara del celular o de la computadora a pantalla completa y el
 * guion pasando arriba, cerca del lente, para que mires a cámara. Cuenta 3-2-1, graba, y al terminar lo ves y
 * eliges «Repetir» o «Usar esta toma». Gratis: el video no sale de tu navegador hasta que tú lo usas.
 */
export function GrabarConGuion({ guion, onUsar, onClose }: { guion: string; onUsar: (file: File) => void; onClose: () => void }) {
  const lines = promptLines(guion);
  const cam = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [frente, setFrente] = useState(true);
  const [error, setError] = useState("");
  const [cuenta, setCuenta] = useState(0);
  const [grabando, setGrabando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [pasa, setPasa] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [size, setSize] = useState(() => (window.innerWidth < 640 ? 26 : 34));
  const [toma, setToma] = useState<{ file: File; url: string } | null>(null);
  const formato = typeof MediaRecorder !== "undefined" ? formatoGrabacion(t => MediaRecorder.isTypeSupported(t)) : null;

  // Sin scroll detrás; la pantalla no se apaga; al salir se apaga la cámara.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then(l => { lock = l; }).catch(() => undefined);
    return () => { document.body.style.overflow = prev; void lock?.release().catch(() => undefined); stream.current?.getTracks().forEach(t => t.stop()); };
  }, []);

  // Cámara (se pide de nuevo al cambiar entre frontal y trasera).
  useEffect(() => {
    if (toma) return;
    let vivo = true;
    stream.current?.getTracks().forEach(t => t.stop());
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) { setError("Este navegador no deja usar la cámara. Prueba con Chrome o Safari."); return; }
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: frente ? "user" : "environment", width: { ideal: 1080 }, height: { ideal: 1920 }, aspectRatio: { ideal: 9 / 16 } },
      audio: { echoCancellation: true, noiseSuppression: true },
    }).then(s => {
      if (!vivo) { s.getTracks().forEach(t => t.stop()); return; }
      stream.current = s;
      if (cam.current) { cam.current.srcObject = s; void cam.current.play().catch(() => undefined); }
    }).catch(() => setError("No pudimos abrir tu cámara y micrófono. Revisa el permiso del navegador (el candado junto a la dirección) y vuelve a intentarlo."));
    return () => { vivo = false; };
  }, [frente, toma]);

  // El guion sube solo mientras grabas (y se puede pausar).
  useEffect(() => {
    if (!pasa) return;
    let raf = 0, last = performance.now(), acc = 0;
    const tick = (t: number) => {
      const el = box.current;
      if (!el) return;
      acc += ((t - last) / 1000) * speed * 10;
      last = t;
      if (acc >= 1) { el.scrollTop += Math.floor(acc); acc -= Math.floor(acc); }
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) { setPasa(false); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pasa, speed]);

  // Reloj de la grabación.
  useEffect(() => {
    if (!grabando) return;
    const t0 = Date.now();
    const id = setInterval(() => setSegundos(Math.floor((Date.now() - t0) / 1000)), 250);
    return () => clearInterval(id);
  }, [grabando]);

  const empezar = () => {
    if (!stream.current || !formato || cuenta || grabando) return;
    if (box.current) box.current.scrollTop = 0;
    setCuenta(3);
    let n = 3;
    const id = setInterval(() => {
      n -= 1;
      if (n > 0) { setCuenta(n); return; }
      clearInterval(id); setCuenta(0);
      chunks.current = [];
      const r = new MediaRecorder(stream.current!, { mimeType: formato.mime, videoBitsPerSecond: 6_000_000 });
      r.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = () => {
        const blob = new Blob(chunks.current, { type: formato.mime.split(";")[0] });
        const file = new File([blob], `mi-toma.${formato.ext}`, { type: blob.type });
        setToma({ file, url: URL.createObjectURL(blob) });
        stream.current?.getTracks().forEach(t => t.stop());
      };
      r.start(1000);
      rec.current = r;
      setSegundos(0); setGrabando(true); setPasa(true);
    }, 1000);
  };
  const terminar = () => { setPasa(false); setGrabando(false); rec.current?.stop(); };
  const repetir = () => { if (toma) URL.revokeObjectURL(toma.url); setToma(null); setSegundos(0); };
  const salir = () => { if (grabando) rec.current?.stop(); if (toma) URL.revokeObjectURL(toma.url); onClose(); };
  const mmss = `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;
  const boton = "flex h-11 w-11 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 disabled:opacity-40";

  return (
    <div className="fixed inset-0 z-[70] bg-black text-white" role="dialog" aria-modal="true" aria-label="Grabarte con tu guion">
      {toma ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-4">
          <video src={toma.url} controls playsInline className="max-h-[75dvh] rounded-2xl bg-black" />
          <p className="text-[13px] text-white/70">Mírala. Si te gusta, la llevamos a subtítulos.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={repetir} className="min-h-[44px] rounded-full border border-white/30 px-5 text-[14px] hover:border-white/60"><RefreshCcw className="mr-1.5 inline w-4 h-4" />Repetir</button>
            <button type="button" onClick={() => onUsar(toma.file)} className="min-h-[44px] rounded-full bg-primary px-5 text-[14px] font-semibold text-primary-foreground">Usar esta toma →</button>
          </div>
          <button type="button" onClick={salir} className="text-[12px] text-white/50 hover:text-white">Salir sin guardar</button>
        </div>
      ) : (
        <>
          <video ref={cam} muted playsInline autoPlay className="absolute inset-0 h-full w-full object-cover" style={{ transform: frente ? "scaleX(-1)" : undefined }} />
          {/* El guion arriba, cerca del lente: así miras a cámara mientras lees. */}
          <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/85 via-black/60 to-transparent pt-[max(0.5rem,env(safe-area-inset-top))]">
            <div className="flex items-center gap-2 px-3 py-2">
              <button type="button" onClick={salir} aria-label="Cerrar" className={boton}><X className="w-5 h-5" /></button>
              {grabando ? <span className="flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-[13px] font-semibold"><span className="h-2 w-2 animate-pulse rounded-full bg-white" />{mmss}</span>
                : <span className="text-[12px] text-white/70">Lee el texto mirando hacia arriba.</span>}
              <div className="ml-auto flex items-center gap-1">
                <button type="button" onClick={() => setSize(s => Math.max(18, s - 3))} aria-label="Letra más chica" className={boton}><Minus className="w-4 h-4" /></button>
                <button type="button" onClick={() => setSize(s => Math.min(56, s + 3))} aria-label="Letra más grande" className={boton}><Plus className="w-4 h-4" /></button>
                <button type="button" onClick={() => setFrente(f => !f)} disabled={grabando || !!cuenta} aria-label="Cambiar de cámara" className={boton}><SwitchCamera className="w-4 h-4" /></button>
              </div>
            </div>
            <div ref={box} className="h-[34dvh] overflow-hidden px-6 pb-6" style={{ fontSize: size, lineHeight: 1.3 }}>
              {lines.map((l, i) => <p key={i} className="mb-3 font-semibold [text-shadow:0_2px_8px_rgba(0,0,0,0.8)]">{l}</p>)}
              <div className="h-[30dvh]" />
            </div>
          </div>
          {cuenta > 0 && <div className="absolute inset-0 flex items-center justify-center text-[120px] font-bold [text-shadow:0_4px_24px_rgba(0,0,0,0.6)]">{cuenta}</div>}
          {error && <p className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-2xl bg-black/80 p-4 text-center text-[14px]">{error}</p>}
          {!formato && !error && <p className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-2xl bg-black/80 p-4 text-center text-[14px]">Este navegador no puede grabar video. Prueba con Chrome o Safari actualizado, o graba con tu cámara y sube el video.</p>}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-6 bg-gradient-to-t from-black/80 to-transparent pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-10">
            <button type="button" onClick={() => setSpeed(s => Math.max(1, s - 1))} disabled={!grabando} aria-label="Texto más lento" className={boton}><Minus className="w-4 h-4" /></button>
            {grabando
              ? <button type="button" onClick={terminar} aria-label="Terminar de grabar" className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white"><span className="h-7 w-7 rounded-md bg-red-600" /></button>
              : <button type="button" onClick={empezar} disabled={!!error || !formato || !!cuenta} aria-label="Grabar" className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white disabled:opacity-40"><span className="h-14 w-14 rounded-full bg-red-600" /></button>}
            <button type="button" onClick={() => setSpeed(s => Math.min(10, s + 1))} disabled={!grabando} aria-label="Texto más rápido" className={boton}><Plus className="w-4 h-4" /></button>
            {grabando && <button type="button" onClick={() => setPasa(p => !p)} aria-label={pasa ? "Pausar el texto" : "Seguir el texto"} className={`${boton} absolute right-4`}>{pasa ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}</button>}
          </div>
        </>
      )}
    </div>
  );
}
