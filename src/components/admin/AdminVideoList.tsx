import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminPrivacy } from "@/lib/adminPrivacy";

/**
 * Videos que creó o pidió cada persona (12-oct-2026, pedido de Jean). Lee admin_recent_videos (solo
 * admin, une Video con IA, presentador y Genjutsu). Sin userId muestra a todos; con userId, solo los suyos.
 */
type Row = {
  id: string; user_id: string; email: string; kind: string; model: string | null; status: string;
  seconds: number | null; credits: number | null; prompt: string | null; url: string | null; error: string | null; created_at: string;
};

const KIND: Record<string, string> = {
  clip: "Video con IA", anuncio: "Video anuncio", ugc: "UGC", serie: "Serie", yt_scene: "Escena de YouTube",
  presentador: "Presentador", genjutsu: "Genjutsu", motion: "Motion",
};
const STATUS: Record<string, { label: string; cls: string }> = {
  done: { label: "Listo", cls: "text-emerald-500" }, completed: { label: "Listo", cls: "text-emerald-500" },
  failed: { label: "Falló", cls: "text-destructive" }, error: { label: "Falló", cls: "text-destructive" },
};
const fmt = (s: string) => new Date(s).toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function AdminVideoList({ days = 30, userId, showUser = true }: { days?: number; userId?: string; showUser?: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const { who } = useAdminPrivacy();

  useEffect(() => {
    let alive = true;
    setRows(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc("admin_recent_videos", { p_days: days, p_user: userId ?? null })
      .then(({ data }: { data: Row[] | null }) => { if (alive) setRows(data ?? []); });
    return () => { alive = false; };
  }, [days, userId]);

  if (rows === null) return <div className="flex items-center gap-2 text-[12px] text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando videos…</div>;
  if (!rows.length) return <p className="text-[13px] text-muted-foreground">{userId ? "No ha creado videos en este período." : "Nadie creó videos en este período."}</p>;

  return (
    <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
      {rows.map((v) => {
        const st = STATUS[v.status] ?? { label: "En proceso", cls: "text-muted-foreground" };
        const expanded = open === v.id;
        return (
          <div key={v.id} className="px-3 py-2.5 text-[12.5px]">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-muted-foreground tabular-nums w-[104px] shrink-0">{fmt(v.created_at)}</span>
              {showUser && <span className="text-foreground truncate max-w-[220px]" data-ph-mask>{who(v.email)}</span>}
              <span className="text-foreground">{KIND[v.kind] ?? v.kind}</span>
              <span className={st.cls}>{st.label}</span>
              {v.seconds ? <span className="text-muted-foreground">{v.seconds} s</span> : null}
              <span className="text-muted-foreground">{v.credits ? `${v.credits.toLocaleString("es")} créditos` : "sin cobro"}</span>
              <span className="ml-auto flex items-center gap-2">
                {v.prompt && (
                  <button onClick={() => setOpen(expanded ? null : v.id)} className="text-muted-foreground hover:text-foreground">
                    {expanded ? "Ocultar" : "Qué pidió"}
                  </button>
                )}
                {v.url && (st.label === "Listo") && (
                  <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-primary font-semibold inline-flex items-center gap-1 hover:underline">
                    Ver <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </span>
            </div>
            {expanded && (
              <p className="mt-2 text-[12px] text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {v.prompt}{v.model ? `\n\nModelo: ${v.model}` : ""}{v.error ? `\nError: ${v.error}` : ""}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
