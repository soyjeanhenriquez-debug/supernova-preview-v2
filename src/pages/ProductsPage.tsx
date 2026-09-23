import { useEffect, useState } from "react";
import { Archive, ArrowRight, Check, LayoutGrid, Pencil, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProducts, type ProductSummary } from "@/contexts/ProductContext";
import { PageHeader } from "@/components/PageHeader";

/**
 * "Mis productos": todos los productos del usuario y cuánto avanzó cada uno en el recorrido, para ver
 * de un vistazo qué está lanzado. Abrir uno lo vuelve el producto activo de toda la app.
 */
type AdStats = { count: number; measured: boolean; winners: number };

function stageOf(p: ProductSummary, ads: AdStats | undefined) {
  const ready = !!(p.product && p.product.trim().length > 2 && p.who && p.who.trim().length > 2);
  const tasks = p.launch_plan?.tasks ?? [];
  const planPct = tasks.length ? tasks.filter(t => t.done).length / tasks.length : 0;
  const done = [
    ready,
    !!p.validation?.completed_at && (p.validation?.score == null || p.validation.score >= 50),
    !!p.pricing?.chosen,
    planPct >= 0.8,
    (ads?.count ?? 0) >= 5,
    !!ads?.measured && !!p.recovery?.messages?.length,
  ];
  const next = done.findIndex(d => !d);
  return { doneCount: done.filter(Boolean).length, next: next === -1 ? null : next + 1, planPct };
}
const STAGE_NAMES = ["Elegir", "Validar", "Precio", "Construir", "Vender", "Medir"];

export function ProductsPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { products, activeId, setActive, createProduct, rename, setStatus, limit, activeCount, refresh } = useProducts();
  const [ads, setAds] = useState<Record<string, AdStats>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [newName, setNewName] = useState("");

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("mandala_ads").select("product_id,spend,sales,status").limit(1000)
      .then(({ data }: { data: { product_id: string | null; spend: number | null; sales: number | null; status: string }[] | null }) => {
        const out: Record<string, AdStats> = {};
        for (const a of data ?? []) {
          if (!a.product_id) continue;
          const s = out[a.product_id] ?? { count: 0, measured: false, winners: 0 };
          s.count++;
          if (a.spend != null || a.sales != null || a.status === "ganador" || a.status === "descartado") s.measured = true;
          if (a.status === "ganador") s.winners++;
          out[a.product_id] = s;
        }
        setAds(out);
      });
  }, [products.length]);

  const open = async (id: string) => { await setActive(id); onNavigate?.("Dashboard"); };
  const create = async () => {
    try { await createProduct(newName || "Nuevo producto"); setNewName(""); onNavigate?.("Mi negocio"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo crear"); }
  };
  const toggleArchive = async (p: ProductSummary) => {
    try { await setStatus(p.id, p.status === "activo" ? "archivado" : "activo"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo cambiar"); }
  };

  const card = (p: ProductSummary) => {
    const st = stageOf(p, ads[p.id]);
    const a = ads[p.id];
    const isActive = p.id === activeId;
    return (
      <div key={p.id} className={`card-surface rounded-2xl p-4 space-y-3 ${isActive ? "border-primary/50" : ""} ${p.status === "archivado" ? "opacity-70" : ""}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {editing === p.id ? (
              <input autoFocus value={draft} onChange={e => setDraft(e.target.value.slice(0, 120))}
                onBlur={() => { rename(p.id, draft); setEditing(null); }} onKeyDown={e => { if (e.key === "Enter") { rename(p.id, draft); setEditing(null); } }}
                className="w-full rounded-lg border border-border bg-background px-2 py-1 text-sm font-semibold text-foreground" />
            ) : (
              <p className="font-display font-semibold text-foreground truncate">{p.name}</p>
            )}
            <p className="text-xs text-muted-foreground truncate">{p.who || "Sin ficha todavía"}</p>
          </div>
          {isActive && <span className="text-[10px] rounded-full bg-primary/15 text-primary px-2 py-0.5 shrink-0">Abierto</span>}
        </div>

        <div className="flex gap-1" aria-label={`${st.doneCount} de 6 etapas`}>
          {STAGE_NAMES.map((n, i) => (
            <span key={n} title={n} className={`h-1.5 flex-1 rounded-full ${i < st.doneCount ? "bg-emerald-500" : st.next === i + 1 ? "bg-primary" : "bg-secondary"}`} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {st.next ? <>Etapa {st.next} · {STAGE_NAMES[st.next - 1]}</> : <span className="text-emerald-400 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Las 6 etapas hechas</span>}
          {a?.count ? ` · ${a.count} anuncios${a.winners ? ` · ${a.winners} ganador${a.winners > 1 ? "es" : ""}` : ""}` : ""}
          {st.planPct > 0 && st.planPct < 1 ? ` · plan ${Math.round(st.planPct * 100)}%` : ""}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {p.status === "activo" && (
            <button onClick={() => open(p.id)} className="inline-flex items-center gap-1.5 rounded-lg gradient-brand px-3 py-1.5 text-xs font-semibold text-primary-foreground">
              {isActive ? "Seguir" : "Abrir"} <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={() => { setEditing(p.id); setDraft(p.name); }} className="p-1.5 text-muted-foreground hover:text-foreground" aria-label="Renombrar" title="Renombrar"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={() => toggleArchive(p)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ml-auto" title={p.status === "activo" ? "Archivar (no cuenta en tu límite)" : "Reactivar"}>
            {p.status === "activo" ? <><Archive className="w-3.5 h-3.5" /> Archivar</> : <><RotateCcw className="w-3.5 h-3.5" /> Reactivar</>}
          </button>
        </div>
      </div>
    );
  };

  const activeList = products.filter(p => p.status === "activo");
  const archived = products.filter(p => p.status === "archivado");

  return (
    <div className="space-y-5 max-w-5xl">
      <PageHeader stage="Mi negocio" title="Mis productos" icon={<LayoutGrid className="w-5 h-5 text-primary" />}
        line={`Cada producto tiene su propio recorrido, sus anuncios y su semana. Tienes ${activeCount} de ${limit} activos.`}
        details={["Abre uno y toda la app pasa a ese producto: ficha, matriz, precio, plan, anuncios, contenido y recuperación.", "Archiva los que ya no trabajas: no cuentan en tu límite y no pierdes nada.", "¿Necesitas más de 3 productos activos? El plan Comunidad te da más."]} />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {activeList.map(card)}
        {activeCount < limit ? (
          <div className="rounded-2xl border border-dashed border-border p-4 flex flex-col justify-center gap-2">
            <p className="text-sm font-semibold text-foreground flex items-center gap-2"><Plus className="w-4 h-4 text-primary" /> Nuevo producto</p>
            <input value={newName} onChange={e => setNewName(e.target.value.slice(0, 120))} onKeyDown={e => { if (e.key === "Enter") create(); }}
              placeholder="Ej.: Calistenia en casa" className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
            <button onClick={create} className="rounded-lg gradient-brand px-3 py-2 text-sm font-semibold text-primary-foreground">Crear y empezar</button>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground flex items-center">
            Llegaste a tus {limit} productos activos. Archiva uno o pásate a Comunidad para tener más.
          </div>
        )}
      </div>

      {archived.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Archivados</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{archived.map(card)}</div>
        </div>
      )}
    </div>
  );
}
