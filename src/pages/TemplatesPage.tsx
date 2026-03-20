import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Plus, FileText, Pencil, Trash2, Loader2, Star, X, Copy, Search } from "lucide-react";

const categories = [
  { id: "all", label: "Todos" },
  { id: "favorites", label: "Favoritos" },
  { id: "vsl", label: "VSL" },
  { id: "copywriting", label: "Copywriting" },
  { id: "emails", label: "Emails" },
  { id: "social", label: "Redes Sociales" },
  { id: "sales", label: "Ventas" },
  { id: "strategy", label: "Estrategia" },
];

export function TemplatesPage() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTemplate, setEditTemplate] = useState<any>(null);
  const [selectedCat, setSelectedCat] = useState("all");
  const [search, setSearch] = useState("");

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("copywriting");
  const [promptTemplate, setPromptTemplate] = useState("");

  const fetchTemplates = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("templates")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setTemplates(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchTemplates(); }, [user]);

  const resetForm = () => {
    setName(""); setDescription(""); setCategory("copywriting"); setPromptTemplate("");
    setEditTemplate(null); setShowForm(false);
  };

  const openEdit = (t: any) => {
    setName(t.name); setDescription(t.description || ""); setCategory(t.category); setPromptTemplate(t.prompt_template);
    setEditTemplate(t); setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name.trim() || !promptTemplate.trim()) return;

    if (editTemplate) {
      const { error } = await supabase.from("templates").update({ name, description, category, prompt_template: promptTemplate }).eq("id", editTemplate.id);
      if (error) toast.error("Error al actualizar"); else toast.success("Plantilla actualizada");
    } else {
      const { error } = await supabase.from("templates").insert({ user_id: user.id, name, description, category, prompt_template: promptTemplate });
      if (error) toast.error("Error al crear"); else toast.success("Plantilla creada");
    }
    resetForm(); fetchTemplates();
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm("¿Eliminar esta plantilla?")) return;
    await supabase.from("templates").delete().eq("id", id);
    toast.success("Plantilla eliminada"); fetchTemplates();
  };

  const toggleFav = async (t: any) => {
    await supabase.from("templates").update({ is_favorite: !t.is_favorite }).eq("id", t.id);
    fetchTemplates();
  };

  const copyPrompt = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Prompt copiado");
  };

  const filtered = templates.filter((t) => {
    if (selectedCat === "favorites") return t.is_favorite;
    if (selectedCat !== "all" && t.category !== selectedCat) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
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
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Encontrar una Plantilla"
              className="w-full bg-secondary border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2.5 gradient-brand text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity">
            <Plus className="w-4 h-4" /> Crear plantilla
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="card-surface rounded-xl py-20 text-center">
            <div className="text-5xl mb-4">📄</div>
            <div className="font-display font-semibold text-foreground mb-2">
              {templates.length === 0 ? "Sin plantillas todavía" : "Sin resultados"}
            </div>
            <div className="text-sm text-muted-foreground max-w-md mx-auto">
              {templates.length === 0
                ? "Crea plantillas de prompts reutilizables para tus generadores"
                : "Prueba con otra búsqueda o categoría"}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((t) => (
              <div key={t.id} className="card-surface rounded-xl p-5 hover:border-primary/30 transition-all group">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-display font-semibold text-foreground text-sm">{t.name}</h3>
                    <span className="text-xs text-primary/60 capitalize">{t.category}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => toggleFav(t)} className={`p-1.5 rounded transition-colors ${t.is_favorite ? "text-warning" : "text-muted-foreground hover:text-warning"}`}>
                      <Star className={`w-3.5 h-3.5 ${t.is_favorite ? "fill-warning" : ""}`} />
                    </button>
                    <button onClick={() => copyPrompt(t.prompt_template)} className="p-1.5 rounded text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-all">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => openEdit(t)} className="p-1.5 rounded text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-all">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteTemplate(t.id)} className="p-1.5 rounded text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {t.description && <p className="text-xs text-muted-foreground mb-2">{t.description}</p>}
                <div className="text-xs text-muted-foreground/50 line-clamp-2 italic bg-secondary/50 rounded-lg p-2">
                  {t.prompt_template.slice(0, 150)}...
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={resetForm}>
          <div className="card-surface rounded-2xl p-6 w-full max-w-lg mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-foreground">{editTemplate ? "Editar" : "Crear"} Plantilla</h3>
              <button onClick={resetForm} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nombre</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ej: VSL para Infoproductos"
                  className="w-full mt-1 bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Descripción</label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Breve descripción"
                  className="w-full mt-1 bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Categoría</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)}
                  className="w-full mt-1 bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                  {categories.filter((c) => c.id !== "all" && c.id !== "favorites").map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Prompt Template</label>
                <textarea value={promptTemplate} onChange={(e) => setPromptTemplate(e.target.value)} required rows={6}
                  placeholder="Genera un VSL de downsell para {producto} dirigido a {audiencia}..."
                  className="w-full mt-1 bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
                <p className="text-xs text-muted-foreground mt-1">Usa {"{variable}"} para campos dinámicos</p>
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={resetForm} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
                <button type="submit" className="px-5 py-2 gradient-brand text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90">
                  {editTemplate ? "Guardar" : "Crear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
