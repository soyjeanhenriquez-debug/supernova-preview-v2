// SUPERNOVA — Reel Studio · Tus imágenes por plano (28-oct-2026).
// Jean: «que yo también pueda subir imágenes para que no las tengas que crear… y solo le tengamos que dar lipsync».
// Cada plano de la referencia dice qué imagen pide (su ficha en JSON, para pedirla a otra IA o buscarla). Lo que subes
// se usa tal cual: una foto tuya donde hablas = solo se le anima la boca; una imagen de apoyo = no se crea con IA.
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, Copy, ImagePlus, Loader2, X } from "lucide-react";
import { fichaHueco, huecoDe, type RefPlano } from "@/lib/reelDinamico";

export type Propia = { tipo: "tu" | "imagen"; bucket: string; path: string; url: string };

type Props = {
  planos: RefPlano[];
  thumbs: string[];
  propias: Record<string, Propia>;
  ocupado: number | null;
  disabled: boolean;
  onSubir: (i: number, file: File) => void;
  onQuitar: (i: number) => void;
};

export function TusImagenes({ planos, thumbs, propias, ocupado, disabled, onSubir, onQuitar }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [ficha, setFicha] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const destino = useRef(-1);
  const subidas = Object.keys(propias).length;
  const fotos = planos.filter(p => huecoDe(p.forma) === "tu").length;

  const copiar = (i: number) => {
    void navigator.clipboard?.writeText(JSON.stringify(fichaHueco(planos[i], i), null, 2))
      .then(() => toast.success(`Ficha del plano ${i + 1} copiada`, { description: "Pégala en tu IA de imágenes o úsala para buscar la foto." }));
  };

  return (
    <div className="card-surface rounded-2xl p-4 space-y-3">
      <button type="button" onClick={() => setAbierto(v => !v)} className="flex w-full items-start justify-between gap-2 text-left">
        <span>
          <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">Tus imágenes (opcional)</span>
          <span className="block text-[13px] text-foreground mt-1">Sube tus fotos e imágenes por plano</span>
          <span className="block text-[11px] text-muted-foreground leading-snug">
            Lo que subes no se crea con IA. En tus fotos solo se anima tu boca. {subidas > 0 ? `${subidas} de ${planos.length} planos con tu imagen.` : `${fotos} planos piden tu foto y ${planos.length - fotos} una imagen de apoyo.`}
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 mt-1 text-muted-foreground transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>
      {abierto && (
        <>
          <input ref={input} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f && destino.current >= 0) onSubir(destino.current, f); }} />
          <ul className="space-y-2">
            {planos.map((p, i) => {
              const tu = huecoDe(p.forma) === "tu";
              const pr = propias[String(i)];
              return (
                <li key={i} className="rounded-xl border border-border p-2 space-y-2">
                  <div className="flex gap-2">
                    <div className="relative shrink-0">
                      {(pr?.url || thumbs[i]) && <img src={pr?.url || thumbs[i]} alt="" className={`h-16 aspect-[9/16] rounded object-cover ${pr ? "" : "opacity-60"}`} />}
                      {pr && <Check className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary p-0.5 text-primary-foreground" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] text-foreground">{i + 1}. {tu ? "Tu foto" : "Imagen de apoyo"} · {(p.t1 - p.t0).toFixed(1).replace(".", ",")} s</p>
                      <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{p.descripcion}</p>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {pr ? (
                          <button type="button" disabled={disabled} onClick={() => onQuitar(i)} className="h-7 px-2.5 rounded-full border border-border text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40">
                            <X className="inline w-3 h-3 mr-1" />Quitar
                          </button>
                        ) : (
                          <button type="button" disabled={disabled} onClick={() => { destino.current = i; input.current?.click(); }}
                            className="h-7 px-2.5 rounded-full border border-border text-[11px] text-foreground hover:border-foreground/40 disabled:opacity-40">
                            {ocupado === i ? <Loader2 className="inline w-3 h-3 mr-1 animate-spin" /> : <ImagePlus className="inline w-3 h-3 mr-1" />}Subir
                          </button>
                        )}
                        <button type="button" onClick={() => setFicha(ficha === i ? null : i)} className="h-7 px-2.5 rounded-full border border-border text-[11px] text-muted-foreground hover:text-foreground">Ficha</button>
                      </div>
                    </div>
                  </div>
                  {ficha === i && (
                    <div className="space-y-1.5">
                      <pre className="max-h-48 overflow-auto rounded-lg bg-background p-2 text-[10px] leading-snug text-muted-foreground whitespace-pre-wrap">{JSON.stringify(fichaHueco(p, i), null, 2)}</pre>
                      <button type="button" onClick={() => copiar(i)} className="text-[11px] text-primary"><Copy className="inline w-3 h-3 mr-1" />Copiar ficha</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-muted-foreground">Si cambias una imagen después de preparar el reel, se usa en la próxima producción.</p>
        </>
      )}
    </div>
  );
}
