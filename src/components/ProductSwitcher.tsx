import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, LayoutGrid, Package, Plus } from "lucide-react";
import { toast } from "sonner";
import { useProducts } from "@/contexts/ProductContext";
import { productLabel } from "@/lib/productLabel";

/**
 * Selector del producto activo, arriba del menú (como cambiar de cuenta). Todo lo que se ve en la
 * app es del producto elegido. "+ Nuevo producto" respeta el límite del plan (3 en PRO).
 * Muestra la ficha (lo que usan las herramientas) y, abajo, el nombre que le puso la persona.
 * `bar` = versión chica para la barra de arriba del teléfono, donde el menú está escondido.
 */
export function ProductSwitcher({ collapsed, onNavigate, bar, alignRight }: { collapsed?: boolean; onNavigate: (page: string) => void; bar?: boolean; alignRight?: boolean }) {
  const { products, active, activeId, setActive, createProduct, limit, activeCount, loaded } = useProducts();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  // Mientras se crea: evita productos repetidos por doble clic o Enter repetido.
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setCreating(false); } };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (!loaded) return null;
  const list = products.filter(p => p.status === "activo");
  const label = productLabel(active);
  const full = activeCount >= limit;

  const create = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await createProduct(name || "Nuevo producto");
      setName(""); setCreating(false); setOpen(false);
      toast.success("Producto creado", { description: "Empieza por su ficha: qué vendes y para quién." });
      onNavigate("Mi negocio");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el producto");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      {bar ? (
        <button onClick={() => setOpen(o => !o)} title={active ? `Las herramientas usan: ${label.full}` : "Elegir producto"}
          className="flex max-w-full items-center gap-1 min-h-6 text-[11px] text-muted-foreground hover:text-foreground">
          <span className="truncate">Para: <span className="text-foreground">{active ? label.main : "Elegir producto"}</span></span>
          <ChevronDown className="w-3 h-3 shrink-0" />
        </button>
      ) : (
        <button onClick={() => setOpen(o => !o)} title={active ? `Las herramientas usan: ${label.full}` : "Elegir producto"}
          className={`w-full flex items-center gap-2 rounded-lg border border-border hover:border-primary/50 bg-secondary/40 transition-colors ${collapsed ? "justify-center p-2" : "px-3 py-2 max-lg:min-h-11 text-left"}`}>
          <Package className="w-4 h-4 text-primary shrink-0" />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Producto</span>
                <span className="block text-[13px] font-semibold text-foreground truncate">{active ? label.main : "Elegir"}</span>
                {active && label.sub && <span className="block text-[11px] text-muted-foreground truncate">{label.sub}</span>}
              </span>
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            </>
          )}
        </button>
      )}

      {open && (
        <div className={`absolute z-50 ${alignRight ? "right-0" : "left-0"} mt-1 w-64 max-w-[calc(100vw-24px)] max-h-[min(70dvh,480px)] overflow-y-auto overscroll-contain rounded-xl border border-border bg-card shadow-xl p-1.5`}>
          <p className="px-2 pt-1 pb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Tus productos · {activeCount} de {limit}</p>
          {list.map(p => {
            const l = productLabel(p);
            return (
              <button key={p.id} onClick={async () => { await setActive(p.id); setOpen(false); }} title={l.full}
                className="w-full flex items-center gap-2 rounded-lg px-2 py-2 max-lg:min-h-11 text-left text-sm hover:bg-secondary/60">
                <span className="w-4 shrink-0">{p.id === activeId && <Check className="w-4 h-4 text-primary" />}</span>
                <span className="min-w-0">
                  <span className="block truncate text-foreground">{l.main}</span>
                  {l.sub && <span className="block truncate text-[11px] text-muted-foreground">{l.sub}</span>}
                </span>
              </button>
            );
          })}
          <div className="border-t border-border mt-1 pt-1">
            {creating ? (
              <div className="p-2 space-y-2">
                <input autoFocus value={name} onChange={e => setName(e.target.value.slice(0, 120))} onKeyDown={e => { if (e.key === "Enter") void create(); }}
                  placeholder="Nombre del producto" className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 max-lg:min-h-11 text-base lg:text-sm text-foreground" />
                <button onClick={create} disabled={saving} className="btn-primary-nova w-full rounded-lg px-3 py-1.5 max-lg:min-h-11 text-xs">{saving ? "Creando…" : "Crear producto"}</button>
              </div>
            ) : full ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">Tu plan permite {limit} productos activos. Archiva uno en "Mis productos" o pásate a Comunidad para tener más.</p>
            ) : (
              <button onClick={() => setCreating(true)} className="w-full flex items-center gap-2 rounded-lg px-2 py-2 max-lg:min-h-11 text-left text-sm text-primary hover:bg-secondary/60">
                <Plus className="w-4 h-4" /> Nuevo producto
              </button>
            )}
            <button onClick={() => { setOpen(false); onNavigate("Productos"); }} className="w-full flex items-center gap-2 rounded-lg px-2 py-2 max-lg:min-h-11 text-left text-sm text-muted-foreground hover:bg-secondary/60 hover:text-foreground">
              <LayoutGrid className="w-4 h-4" /> Ver todos mis productos
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
