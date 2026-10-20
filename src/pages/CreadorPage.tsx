import { lazy, Suspense, useEffect } from "react";
import { Captions, ChevronRight, Loader2, ScrollText, Search, Video } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { AnalizaReel } from "@/components/reel/AnalizaReel";
import { TeleprompterLibre } from "@/components/reel/TeleprompterLibre";
import { useSubRoute } from "@/lib/useSubRoute";
import { CREDIT_COSTS } from "@/hooks/useCredits";
import { openTool, TOOLS } from "@/lib/tools";

// Sube tu video carga Remotion (vista previa y armado del video): solo se baja cuando se abre.
const SubeTuVideo = lazy(() => import("@/components/subs/SubeTuVideo").then(m => ({ default: m.SubeTuVideo })));

/**
 * "Con tu cara" (13-oct-2026, pedido de Jean): para creadores que salen en sus videos.
 *  · Sube tu video (20 créditos los subtítulos): estilos de subtítulos y edición con Remotion, portada,
 *    cierre y voz grave; se ve en vivo y se descarga armado en el navegador, gratis
 *    (src/components/subs/SubeTuVideo.tsx).
 *  · Analiza un Reel (25 créditos, otra versión 5): por qué funciona y tu versión según el nivel, con
 *    teleprompter (src/components/reel/AnalizaReel.tsx).
 * Fase 1 de la organización (16-oct-2026): cada herramienta tiene su dirección (#/con-tu-cara/video,
 * #/con-tu-cara/reel/<id>), migas, "Volver" y para qué producto trabaja. El cobro lo hace el servidor.
 */

export function CreadorPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { segs, go } = useSubRoute("con-tu-cara");
  const nav = onNavigate ?? (() => undefined);

  // Direcciones viejas (#/analiza-reel, #/subtitulos) y enlaces guardados: se llevan a la nueva.
  useEffect(() => {
    const h = window.location.hash;
    if (h.startsWith("#/analiza-reel")) go(["reel"], true);
    else if (h.startsWith("#/subtitulos")) go(["video"], true);
  }, [go]);

  if (segs[0] === "reel") {
    return <AnalizaReel route={segs.slice(1)} go={(s, r) => go(["reel", ...s], r)} onUpload={() => go(["video"])} onHome={() => go([])} onNavigate={nav} />;
  }
  if (segs[0] === "teleprompter") return <TeleprompterLibre onHome={() => go([])} />;
  if (segs[0] === "video") {
    return (
      <Suspense fallback={<div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}>
        <SubeTuVideo onHome={() => go([])} onNavigate={nav} />
      </Suspense>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <PageHeader stage="Crear · Con tu cara" title="Para creadores que salen en sus videos"
        icon={<Video className="w-5 h-5 text-primary" />}
        line="Elige qué quieres hacer. Las dos herramientas trabajan para tu producto activo."
        details={[
          "Analiza un Reel: pega el enlace de cualquier Reel público, elige cuánto se parece tu versión y grábala con el teleprompter.",
          "Sube tu video: la IA escucha lo que dices, te da los subtítulos con sus tiempos y 3 ganchos para los primeros 3 segundos.",
          "Se modela la estructura y el ritmo, nunca se copian las palabras, la cara ni la marca de otra persona.",
        ]} />

      <div className="grid gap-3 sm:grid-cols-3">
        {([
          ["reel", Search, "Analiza un Reel", "Pega un Reel que funciona → elige Espejo, Recrear, Reinventar o Vender → grábalo con el teleprompter.", `${CREDIT_COSTS.reel_analyze} créditos`],
          ["video", Captions, "Sube tu video", "Ya grabaste: subtítulos con sus tiempos, el texto para publicar y si tu inicio engancha.", `${CREDIT_COSTS.video_subtitles} créditos`],
          ["teleprompter", ScrollText, "Teleprompter", "Pega cualquier texto y léelo mirando a la cámara, a pantalla completa.", ""],
        ] as const).map(([id, Icon, title, desc, cost]) => (
          <button key={id} type="button" onClick={() => go([id])}
            className="card-surface group rounded-2xl p-5 text-left hover:border-primary/50 transition-colors">
            <span className="flex items-center gap-2 text-foreground"><Icon className="w-5 h-5 text-primary" /><span className="font-display text-lg font-semibold">{title}</span>
              <ChevronRight className="ml-auto w-4 h-4 text-muted-foreground group-hover:text-foreground" /></span>
            <span className="mt-1.5 block text-[13px] text-muted-foreground">{desc}</span>
            {cost && <span className="mt-3 block text-[12px] text-muted-foreground">{cost}</span>}
          </button>
        ))}
      </div>

      <div className="card-surface rounded-2xl p-5 space-y-3">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Más para tu marca personal</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {[
            ["Guiones de Reels", "Generadores", "Guiones cortos con gancho para grabar con tu cara."],
            ["Carrusel con tu foto", "Carrusel", "En \"Tu firma\" subes tu foto y sales en las láminas."],
            ["Creador de YouTube", "Creador YouTube", "Ideas con datos reales y guion con gancho en 5 s."],
            ["Calendario de contenido", "Contenido", "Qué publicar cada día y \"Ya lo publiqué\"."],
          ].map(([label, page, desc]) => (
            <button key={label} type="button" onClick={() => {
              const reels = page === "Generadores" ? TOOLS.find(t => t.id === "reels") : undefined;
              if (reels && onNavigate) openTool(reels, onNavigate); else onNavigate?.(page);
            }}
              className="text-left rounded-xl border border-border p-3 hover:bg-secondary/40 min-h-[44px]">
              <p className="text-sm font-semibold text-foreground">{label}</p>
              <p className="text-[12px] text-muted-foreground">{desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default CreadorPage;
