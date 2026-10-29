// Admin → Mensajes: el resumen de hoy para el grupo de WhatsApp, listo para copiar (28-oct-2026, opción A).
// Lee la base al abrir (consultas a offers, sin IA: no cuesta nada). Nada se publica solo: Jean lo pega.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Loader2, MessageCircle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { contarNichos, resumenGrupo, type OfertaResumen } from "@/lib/resumenGrupo";

export function ResumenGrupo() {
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const dia = new Date(Date.now() - 86_400_000).toISOString(), semana = new Date(Date.now() - 7 * 86_400_000).toISOString();
      // Una tarjeta por anunciante (is_primary) y nunca lo excluido (adulto, novelas) ni lo que falló al leerse.
      const base = () => supabase.from("offers").select("id", { count: "exact", head: true }).eq("is_primary", true).eq("enrich_failed", false).is("excluded_reason", null);
      const cols = "niche, market, days_active, active_ads, canal, copy_score";
      const [hoy, sem, total, wa, waG, nuevas] = await Promise.all([
        base().gte("created_at", dia),
        base().gte("created_at", semana),
        base(),
        base().filter("canal", "eq", "whatsapp"),
        supabase.from("offers").select("id", { count: "exact", head: true }).eq("is_winner", true).is("excluded_reason", null).filter("canal", "eq", "whatsapp"),
        supabase.from("offers").select(`${cols}, offer_type`).eq("is_primary", true).eq("enrich_failed", false).is("excluded_reason", null).gte("created_at", semana).limit(500),
      ]);
      const rows = ((nuevas.data ?? []) as unknown as (OfertaResumen & { offer_type: string | null })[]);
      // Los que más tiempo llevan pagando entre los nuevos de la semana (productos digitales con nicho claro y anuncios activos).
      let top: OfertaResumen[] = rows.filter(o => o.offer_type !== "ecommerce" && o.niche && o.niche !== "otro" && (o.active_ads ?? 0) >= 3)
        .sort((a, b) => (b.days_active ?? 0) - (a.days_active ?? 0)).slice(0, 3);
      if (!top.length) {
        const { data } = await supabase.from("offers").select(cols).eq("is_winner", true).is("excluded_reason", null).order("days_active", { ascending: false }).limit(3);
        top = (data ?? []) as unknown as OfertaResumen[];
      }
      setTexto(resumenGrupo({
        hoy: hoy.count ?? 0, semana: sem.count ?? 0, total: total.count ?? 0, top,
        whatsapp: wa.count ?? 0, whatsappGanadoras: waG.count ?? 0, nichos: contarNichos(rows.map(o => o.niche)),
      }));
    } catch { toast.error("No se pudo leer la base. Toca Actualizar."); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[12px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-2"><MessageCircle className="w-4 h-4" />Resumen de hoy para el grupo de WhatsApp</p>
          <p className="text-[12px] text-muted-foreground mt-1">Datos reales de la base al momento de abrir. Revísalo, cópialo y pégalo en el grupo. Los nombres van ocultos.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void cargar()} disabled={cargando} className="h-9 px-3 rounded-full border border-border text-[12px] text-muted-foreground hover:text-foreground disabled:opacity-50">
            {cargando ? <Loader2 className="inline w-3.5 h-3.5 animate-spin mr-1" /> : <RefreshCw className="inline w-3.5 h-3.5 mr-1" />}Actualizar
          </button>
          <button type="button" disabled={!texto || cargando} onClick={() => void navigator.clipboard?.writeText(texto).then(() => toast.success("Copiado: pégalo en el grupo"))}
            className="h-9 px-4 rounded-full bg-primary text-primary-foreground text-[12px] font-semibold disabled:opacity-50"><Copy className="inline w-3.5 h-3.5 mr-1" />Copiar</button>
        </div>
      </div>
      <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={18} placeholder={cargando ? "Leyendo los datos de hoy…" : ""}
        className="w-full rounded-xl border border-border bg-background p-3 text-[13px] leading-relaxed text-foreground font-mono" />
    </div>
  );
}
