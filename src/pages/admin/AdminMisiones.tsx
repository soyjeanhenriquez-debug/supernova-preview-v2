import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { listClaims, revokeClaim, screenshotUrl, type MissionClaim } from "@/lib/publishBonus";

/**
 * Admin → Misiones: los bonos de "Publica lo que hiciste con SUPERNOVA". Los créditos se dan al
 * instante; aquí se revisa que la captura sea del post y se anula el que no (se descuentan).
 */
const TABS: { id: MissionClaim["status"]; label: string }[] = [
  { id: "granted", label: "Pagados" },
  { id: "revoked", label: "Anulados" },
];

export default function AdminMisiones() {
  const [tab, setTab] = useState<MissionClaim["status"]>("granted");
  const [rows, setRows] = useState<MissionClaim[] | null>(null);
  const [shots, setShots] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    setRows(null);
    listClaims(tab).then(setRows).catch(() => setRows([]));
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  const show = async (c: MissionClaim) => {
    if (shots[c.id] !== undefined) { setShots(s => { const n = { ...s }; delete n[c.id]; return n; }); return; }
    const u = await screenshotUrl(c.screenshot_path);
    setShots(s => ({ ...s, [c.id]: u }));
  };

  const revoke = async (c: MissionClaim) => {
    const reason = prompt("¿Por qué se anula? (la captura no es del post, post ajeno…)", "La captura no corresponde al post");
    if (reason === null) return;
    setBusy(c.id);
    const ok = await revokeClaim(c.id, reason);
    setBusy("");
    if (ok) { toast.success(`Anulado: se descontaron ${c.credits} créditos.`); load(); }
    else toast.error("No se pudo anular.");
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Misiones</h1>
        <p className="text-sm text-muted-foreground mt-1">Bonos por publicar en redes lo hecho con SUPERNOVA (50 créditos, 1 al día, 1.000 al mes). Revisa la captura y anula si no corresponde.</p>
      </div>
      <div className="inline-flex rounded-xl border border-border p-1 gap-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`h-8 px-3.5 rounded-lg text-[13px] font-medium ${tab === t.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
        ))}
      </div>

      {rows === null ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-5 text-[13px] text-muted-foreground">Nada en esta lista.</p>
      ) : (
        <div className="space-y-3">
          {rows.map(c => (
            <div key={c.id} className="rounded-xl border border-border p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-foreground capitalize">{c.network} · {c.credits} créditos</p>
                  <a href={c.post_url} target="_blank" rel="noopener noreferrer nofollow" className="text-[12px] text-primary inline-flex items-center gap-1 break-all">
                    {c.post_url.slice(0, 90)} <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                  <p className="text-[12px] text-muted-foreground mt-1">
                    Usuario {c.user_id.slice(0, 8)} · {new Date(c.created_at).toLocaleString("es")}
                    {c.revoke_reason && <> · Motivo: {c.revoke_reason}</>}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => void show(c)} className="h-8 px-3 rounded-lg border border-border text-[12px] text-muted-foreground hover:text-foreground">
                    {shots[c.id] !== undefined ? "Ocultar captura" : "Ver captura"}
                  </button>
                  {c.status === "granted" && (
                    <button disabled={busy === c.id} onClick={() => void revoke(c)} className="h-8 px-3 rounded-lg border border-border text-[12px] text-muted-foreground hover:text-destructive inline-flex items-center gap-1">
                      <X className="w-3.5 h-3.5" /> Anular
                    </button>
                  )}
                </div>
              </div>
              {shots[c.id] !== undefined && (shots[c.id]
                ? <img src={shots[c.id] as string} alt="Captura del post" className="max-h-96 rounded-lg border border-border" />
                : <p className="text-[12px] text-muted-foreground">No se pudo cargar la captura.</p>)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
