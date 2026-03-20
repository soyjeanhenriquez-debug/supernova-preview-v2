import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { BookOpen, Trash2, Loader2, Star, Copy, Search, Eye, X } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const categories = [
  { id: "all", label: "Todos" },
  { id: "favorites", label: "Favoritos" },
  { id: "copywriting", label: "Copywriting" },
  { id: "social", label: "Redes Sociales" },
  { id: "emails", label: "Emails" },
  { id: "sales", label: "Ventas" },
  { id: "strategy", label: "Estrategia" },
];

export function LibraryPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCat, setSelectedCat] = useState("all");
  const [search, setSearch] = useState("");
  const [viewItem, setViewItem] = useState<any>(null);

  const fetchItems = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("library_items")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, [user]);

  const deleteItem = async (id: string) => {
    if (!confirm("¿Eliminar este contenido?")) return;
    await supabase.from("library_items").delete().eq("id", id);
    toast.success("Eliminado"); fetchItems();
    if (viewItem?.id === id) setViewItem(null);
  };

  const toggleFav = async (item: any) => {
    await supabase.from("library_items").update({ is_favorite: !item.is_favorite }).eq("id", item.id);
    fetchItems();
  };

  const copyContent = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado al portapapeles");
  };

  const filtered = items.filter((item) => {
    if (selectedCat === "favorites") return item.is_favorite;
    if (selectedCat !== "all" && item.category !== selectedCat) return false;
    if (search && !item.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)]">
      {/* Category sidebar */}
      <div className="w-48 flex-shrink-0 space-y-1">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCat(cat.id)}
            className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all ${
              selectedCat === cat.id ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar en biblioteca"
              className="w-full bg-secondary border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="text-sm text-muted-foreground">{filtered.length} archivos</div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="card-surface rounded-xl py-20 text-center">
            <div className="text-5xl mb-4">📚</div>
            <div className="font-display font-semibold text-foreground mb-2">
              {items.length === 0 ? "Biblioteca vacía" : "Sin resultados"}
            </div>
            <div className="text-sm text-muted-foreground max-w-md mx-auto">
              {items.length === 0
                ? "El contenido que generes con los Generadores se guardará aquí automáticamente"
                : "Prueba otra búsqueda o categoría"}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((item) => (
              <div key={item.id} className="card-surface rounded-xl p-5 hover:border-primary/30 transition-all group cursor-pointer" onClick={() => setViewItem(item)}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display font-semibold text-foreground text-sm truncate">{item.title}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      {item.generator_type && <span className="text-xs text-primary/60">{item.generator_type}</span>}
                      <span className="text-xs text-muted-foreground capitalize">{item.category}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => toggleFav(item)} className={`p-1.5 rounded transition-colors ${item.is_favorite ? "text-warning" : "text-muted-foreground hover:text-warning"}`}>
                      <Star className={`w-3.5 h-3.5 ${item.is_favorite ? "fill-warning" : ""}`} />
                    </button>
                    <button onClick={() => copyContent(item.content)} className="p-1.5 rounded text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-all">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteItem(item.id)} className="p-1.5 rounded text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-3 mb-2">{item.content.slice(0, 200)}</p>
                <div className="text-xs text-muted-foreground/50">
                  {format(new Date(item.created_at), "dd MMM yyyy HH:mm", { locale: es })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail view modal */}
      {viewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={() => setViewItem(null)}>
          <div className="card-surface rounded-2xl p-6 w-full max-w-2xl mx-4 max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display font-semibold text-foreground">{viewItem.title}</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  {viewItem.generator_type && <span className="text-xs text-primary/60">{viewItem.generator_type}</span>}
                  <span className="text-xs text-muted-foreground">{format(new Date(viewItem.created_at), "dd MMM yyyy HH:mm", { locale: es })}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => copyContent(viewItem.content)} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-primary transition-colors">
                  <Copy className="w-4 h-4" />
                </button>
                <button onClick={() => setViewItem(null)} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="bg-secondary rounded-xl p-4 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              {viewItem.content}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
