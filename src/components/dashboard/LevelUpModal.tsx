import { useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { LEVELS } from "@/lib/gamification";

interface Props { open: boolean; level: number | null; onClose: () => void; }

export function LevelUpModal({ open, level, onClose }: Props) {
  useEffect(() => {
    if (open && level) {
      import("canvas-confetti").then(({ default: confetti }) => {
        confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 }, colors: ["#f7a93d", "#ffffff", "#fbbf24"] });
        setTimeout(() => confetti({ particleCount: 80, spread: 60, origin: { y: 0.6, x: 0.2 } }), 250);
        setTimeout(() => confetti({ particleCount: 80, spread: 60, origin: { y: 0.6, x: 0.8 } }), 400);
      });
    }
  }, [open, level]);

  const lvl = level ? LEVELS.find(l => l.n === level) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md text-center">
        <div className="py-6 space-y-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-primary font-medium">Subiste de nivel</div>
          <div className="font-display text-[64px] leading-none font-semibold text-primary tabular-nums">{level}</div>
          <h2 className="font-display text-2xl font-semibold text-foreground">{lvl?.name}</h2>
          <p className="text-[14px] text-muted-foreground">Tu consistencia te puso aquí. Sigue adelante.</p>
          <button onClick={onClose} className="btn-primary-nova px-6 py-2.5 rounded-lg text-[13px] mt-2">
            Seguir subiendo →
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
