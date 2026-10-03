import { useEffect, useMemo, useState } from "react";
import { Gem, FolderKanban, LayoutGrid, Search } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useProducts } from "@/contexts/ProductContext";
import { useFeatureAccess } from "@/lib/features";
import { TOOLS, ADMIN_EXTRA_TOOLS } from "@/lib/tools";
import { track } from "@/lib/analytics";

/**
 * Buscador de arriba (⌘K / Ctrl+K; en el teléfono, el botón "Buscar" del menú inferior).
 * Busca en 3 grupos, máximo 5 resultados cada uno, y es gratis (no cobra créditos):
 * 1. Herramientas: lista fija del cliente (src/lib/tools.ts), con sinónimos.
 * 2. Ofertas: la misma consulta del catálogo de Ofertas (tabla offers, ~7.500 filas, nunca
 *    winning_ads), sin contar filas, solo 5 y con pocas columnas.
 * 3. Lo suyo: sus productos y lo que guardó en el producto activo.
 */
interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onNavigate: (page: string) => void;
  onOpenOffer: (id: string) => void;
}

type OfferHit = { id: string; product_name: string | null; page_name: string | null; niche: string | null; days_active: number | null };
type AssetHit = { id: string; name: string };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function GlobalSearch({ open, onOpenChange, onNavigate, onOpenOffer }: Props) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [offers, setOffers] = useState<OfferHit[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [assets, setAssets] = useState<AssetHit[]>([]);
  const { products, activeId, setActive } = useProducts();
  const { canSee } = useFeatureAccess();

  // Atajo de teclado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); onOpenChange(!open); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => { if (!open) { setQ(""); setDebounced(""); setOffers([]); } }, [open]);
  useEffect(() => { const id = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(id); }, [q]);

  // Lo guardado en el producto activo: una lectura pequeña al abrir (solo id y nombre).
  useEffect(() => {
    if (!open || !activeId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("product_assets").select("id,name").eq("product_id", activeId)
      .order("updated_at", { ascending: false }).limit(50)
      .then(({ data }: { data: AssetHit[] | null }) => setAssets(data ?? []));
  }, [open, activeId]);

  // Ofertas: misma regla que el catálogo (nada excluido ni sin enriquecer, una por anunciante).
  useEffect(() => {
    if (debounced.length < 2) { setOffers([]); setOffersLoading(false); return; }
    let alive = true;
    setOffersLoading(true);
    const k = debounced.replace(/[,()%*]/g, " ").trim();
    supabase.from("offers").select("id,product_name,page_name,niche,days_active")
      .eq("enrich_failed", false).is("excluded_reason", null).eq("is_primary", true)
      .or(`product_name.ilike.%${k}%,page_name.ilike.%${k}%,niche.ilike.%${k}%`)
      .order("winner_score", { ascending: false }).limit(5)
      .then(({ data }) => {
        if (!alive) return;
        setOffers((data ?? []) as OfferHit[]);
        setOffersLoading(false);
      });
    return () => { alive = false; };
  }, [debounced]);

  const term = norm(q.trim());
  const tools = useMemo(() => {
    const all = [...TOOLS, ...ADMIN_EXTRA_TOOLS].filter(t => canSee(t.key));
    if (!term) return all.filter(t => t.featured || t.group === "crear").slice(0, 5);
    const words = term.split(/\s+/);
    return all.filter(t => {
      const hay = norm(`${t.title} ${t.nav} ${t.desc} ${t.keywords}`);
      return words.every(w => hay.includes(w));
    }).slice(0, 5);
  }, [term, canSee]);

  const mineProducts = useMemo(() => term.length < 2 ? [] :
    products.filter(p => p.status === "activo" && norm(`${p.name} ${p.product ?? ""}`).includes(term)).slice(0, 5), [products, term]);
  const mineAssets = useMemo(() => term.length < 2 ? [] :
    assets.filter(a => norm(a.name ?? "").includes(term)).slice(0, 5), [assets, term]);

  const done = (grupo: string, eligio: string) => {
    track("search_used", { grupo, eligio, letras: q.trim().length });
    onOpenChange(false);
  };

  const nothing = term.length >= 2 && !offersLoading && !tools.length && !offers.length && !mineProducts.length && !mineAssets.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 max-w-[600px] top-[12%] translate-y-0 sm:top-[15%]">
        <DialogTitle className="sr-only">Buscar en SUPERNOVA</DialogTitle>
        <Command shouldFilter={false} className="bg-card [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.16em] [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2.5 [&_[cmdk-item]]:rounded-lg">
          <CommandInput value={q} onValueChange={setQ} placeholder="Busca una herramienta, una oferta o algo tuyo…" className="h-12 text-[14px]" />
          <CommandList className="max-h-[min(60vh,440px)]">
            {nothing && <CommandEmpty>No encontramos nada con "{q.trim()}". Prueba con otra palabra.</CommandEmpty>}

            {tools.length > 0 && (
              <CommandGroup heading={term ? "Herramientas" : "Lo más útil para empezar"}>
                {tools.map(t => {
                  const Icon = t.icon;
                  return (
                    <CommandItem key={t.key} value={`tool-${t.key}`} onSelect={() => { done("herramienta", t.key); onNavigate(t.key); }}>
                      <Icon className="w-4 h-4 mr-3 text-muted-foreground shrink-0" strokeWidth={1.7} />
                      <span className="min-w-0">
                        <span className="block text-[13px] text-foreground truncate">{t.title}</span>
                        <span className="block text-[11px] text-muted-foreground truncate">{t.desc}</span>
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {term.length >= 2 && (offers.length > 0 || offersLoading) && (
              <CommandGroup heading="Ofertas">
                {offersLoading && !offers.length && <p className="px-3 py-2 text-[12px] text-muted-foreground">Buscando ofertas…</p>}
                {offers.map(o => (
                  <CommandItem key={o.id} value={`offer-${o.id}`} onSelect={() => { done("oferta", o.id); onOpenOffer(o.id); }}>
                    <Gem className="w-4 h-4 mr-3 text-muted-foreground shrink-0" strokeWidth={1.7} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] text-foreground truncate">{o.product_name || o.page_name || "Oferta"}</span>
                      <span className="block text-[11px] text-muted-foreground truncate">
                        {[o.niche, o.days_active ? `${o.days_active.toLocaleString("es")} días anunciando` : null].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {(mineProducts.length > 0 || mineAssets.length > 0) && (
              <CommandGroup heading="Lo tuyo">
                {mineProducts.map(p => (
                  <CommandItem key={p.id} value={`product-${p.id}`} onSelect={async () => {
                    done("producto", "producto");
                    if (p.id !== activeId) await setActive(p.id);
                    onNavigate("Productos");
                  }}>
                    <LayoutGrid className="w-4 h-4 mr-3 text-muted-foreground shrink-0" strokeWidth={1.7} />
                    <span className="min-w-0">
                      <span className="block text-[13px] text-foreground truncate" data-ph-mask>{p.name}</span>
                      <span className="block text-[11px] text-muted-foreground">Producto</span>
                    </span>
                  </CommandItem>
                ))}
                {mineAssets.map(a => (
                  <CommandItem key={a.id} value={`asset-${a.id}`} onSelect={() => { done("proyecto", "proyecto"); onNavigate("Proyectos"); }}>
                    <FolderKanban className="w-4 h-4 mr-3 text-muted-foreground shrink-0" strokeWidth={1.7} />
                    <span className="min-w-0">
                      <span className="block text-[13px] text-foreground truncate" data-ph-mask>{a.name}</span>
                      <span className="block text-[11px] text-muted-foreground">Guardado en este producto</span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
          <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground hidden sm:flex items-center gap-1.5">
            <Search className="w-3 h-3" /> Buscar es gratis · <kbd className="font-sans">⌘K</kbd> para abrir
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
