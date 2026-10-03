import { useState } from "react";
import { PlayCircle } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { embedUrl, tutorialFor, type Tutorial } from "@/lib/tutorials";

/** Video de YouTube en una ventana (sin cookies de seguimiento: youtube-nocookie). */
export function TutorialDialog({ tutorial, open, onOpenChange }: { tutorial: Tutorial; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[880px] p-0 overflow-hidden gap-0">
        <DialogTitle className="px-5 py-3.5 text-[15px] font-display">{tutorial.title}</DialogTitle>
        <div className="aspect-video bg-black">
          {open && (
            <iframe src={embedUrl(tutorial.youtubeId)} title={tutorial.title} className="w-full h-full" loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** "Ver cómo se usa (N min)": aparece arriba de una herramienta solo si ya tiene video. */
export function TutorialButton({ page }: { page: string }) {
  const t = tutorialFor(page);
  const [open, setOpen] = useState(false);
  if (!t) return null;
  return (
    <>
      <button onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-border text-[12px] text-muted-foreground hover:text-foreground hover:border-foreground/30">
        <PlayCircle className="w-[14px] h-[14px]" strokeWidth={1.8} /> Ver cómo se usa · {t.minutes} min
      </button>
      <TutorialDialog tutorial={t} open={open} onOpenChange={setOpen} />
    </>
  );
}
