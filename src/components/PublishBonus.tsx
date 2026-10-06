import { useEffect, useRef, useState } from "react";
import { Camera, Check, Gift, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { fmtNumber } from "@/lib/gemelo";
import { useAuth } from "@/contexts/AuthContext";
import { SYNC_EVENT } from "@/hooks/useCredits";
import { claimBonus, getBonusStatus, networkOf, uploadScreenshot, type BonusStatus } from "@/lib/publishBonus";

/**
 * Bono "Publica lo que hiciste con SUPERNOVA" en Contenido: una tarjeta arriba con el progreso
 * del mes y un botón "Ganar 50" en cada pieza que salió de una herramienta y ya se publicó.
 * El servidor decide si se paga (claim_publish_bonus); aquí solo se sube la captura.
 */

const STATUS_EVENT = "supernova_publish_bonus";
let cached: BonusStatus | null = null;

export function useBonusStatus() {
  const [s, setS] = useState<BonusStatus | null>(cached);
  useEffect(() => {
    let alive = true;
    const load = () => getBonusStatus().then(r => { cached = r; if (alive) setS(r); });
    if (!cached) load();
    window.addEventListener(STATUS_EVENT, load);
    return () => { alive = false; window.removeEventListener(STATUS_EVENT, load); };
  }, []);
  return s;
}

export function PublishBonusCard() {
  const s = useBonusStatus();
  if (!s) return null;
  const pct = Math.min(100, Math.round((s.monthTotal / s.monthCap) * 100));
  const full = s.monthTotal + s.perClaim > s.monthCap;
  return (
    <div className="card-surface rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><Gift className="w-5 h-5" /></div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">Publica lo que hiciste con SUPERNOVA y gana {s.perClaim} créditos</p>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          {full ? "Ya ganaste el máximo de este mes. Vuelve el mes que viene."
            : s.claimedToday ? "Ya ganaste tu bono de hoy. Mañana puedes ganar otro."
            : "Pasa a tu tracker lo que creaste, publícalo y toca “Ganar” con el enlace y una captura. Uno por día."}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 max-w-[220px] rounded-full bg-secondary overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[11px] text-muted-foreground tabular-nums">{fmtNumber(s.monthTotal)} de {fmtNumber(s.monthCap)} este mes</span>
        </div>
      </div>
    </div>
  );
}

type Piece = { id: string; title: string | null; source: string | null; status: string; channels: Record<string, { done?: boolean; url?: string }> };

/** Botón por pieza. Solo aparece si la pieza salió de una herramienta y ya está publicada. */
export function ClaimBonusButton({ item }: { item: Piece }) {
  const s = useBonusStatus();
  const [open, setOpen] = useState(false);
  const published = item.status === "publicado" || Object.values(item.channels).some(c => c?.done);
  if (!s || !item.source || item.source === "manual" || !published) return null;
  if (s.claimedItems.includes(item.id)) {
    return <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400"><Check className="w-3 h-3" /> Bono ganado</span>;
  }
  if (s.claimedToday || s.monthTotal + s.perClaim > s.monthCap) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/15">
        <Gift className="w-3 h-3" /> Ganar {s.perClaim} créditos
      </button>
      {open && <ClaimDialog item={item} perClaim={s.perClaim} onClose={() => setOpen(false)} />}
    </>
  );
}

function ClaimDialog({ item, perClaim, onClose }: { item: Piece; perClaim: number; onClose: () => void }) {
  const { user } = useAuth();
  const firstUrl = Object.values(item.channels).find(c => c?.url)?.url ?? "";
  const [url, setUrl] = useState(firstUrl);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const net = networkOf(url);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const send = async () => {
    if (!user || !file || !net || busy) return;
    setBusy(true);
    try {
      const path = await uploadScreenshot(user.id, file);
      const r = await claimBonus(item.id, url, path);
      if ("message" in r) { toast.error(r.message); return; }
      window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { balance: r.balance } }));
      window.dispatchEvent(new Event(STATUS_EVENT));
      toast.success(`+${r.amount} créditos`, { description: "Gracias por mostrar lo que haces. Sigue así." });
      import("canvas-confetti").then(({ default: confetti }) => confetti({ particleCount: 70, spread: 65, origin: { y: 0.7 } })).catch(() => {});
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo reclamar el bono.");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogTitle className="font-display">Gana {perClaim} créditos</DialogTitle>
        <DialogDescription className="text-[13px]">
          {item.title ? `“${item.title.slice(0, 80)}”. ` : ""}Pega el enlace de tu post y sube una captura donde se vea publicado.
        </DialogDescription>
        <div className="space-y-3 mt-1">
          <label className="block space-y-1">
            <span className="text-[12px] text-muted-foreground">Enlace del post</span>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.instagram.com/p/…" inputMode="url"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60" />
            <span className={`text-[11px] ${url && !net ? "text-destructive" : "text-muted-foreground"}`}>
              {url ? (net ? `Post de ${net}` : "Debe ser un enlace https de Instagram, TikTok, YouTube, Facebook, Threads, X o LinkedIn.") : "Instagram, TikTok, YouTube, Facebook, Threads, X o LinkedIn."}
            </span>
          </label>
          <div className="space-y-1">
            <span className="text-[12px] text-muted-foreground">Captura de la publicación</span>
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
            <button type="button" onClick={() => input.current?.click()}
              className="w-full rounded-lg border border-dashed border-border px-3 py-3 text-[13px] text-muted-foreground hover:text-foreground hover:border-foreground/40 flex items-center justify-center gap-2">
              {preview ? <img src={preview} alt="Tu captura" className="max-h-40 rounded-md" /> : <><Camera className="w-4 h-4" /> Elegir captura</>}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">Revisamos las capturas. Si una no corresponde al post, el bono se anula.</p>
          <button type="button" onClick={() => void send()} disabled={!file || !net || busy}
            className="btn-primary-nova w-full h-10 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />} Reclamar {perClaim} créditos
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
