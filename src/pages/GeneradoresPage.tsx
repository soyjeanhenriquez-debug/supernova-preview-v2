import { useState } from "react";
import {
  Sparkles, Heart, Star, Globe, FileText, ShoppingBag, DollarSign,
  Youtube, Instagram, Mail, MessageSquare, BarChart2, Layers, Copy, Loader2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCredits, generatorCost } from "@/hooks/useCredits";

const categories = [
  { icon: Sparkles, label: "Todos", id: "all" },
  { icon: Heart, label: "Recomendados", id: "recommended" },
  { icon: Star, label: "Favoritos", id: "favorites" },
  { divider: true },
  { icon: Globe, label: "Redes Sociales", id: "social" },
  { icon: FileText, label: "Copywriting", id: "copywriting" },
  { icon: ShoppingBag, label: "Producto", id: "product" },
  { icon: DollarSign, label: "Ventas", id: "sales" },
  { icon: Youtube, label: "YouTube", id: "youtube" },
  { icon: Instagram, label: "Instagram", id: "instagram" },
  { icon: Mail, label: "E-mails", id: "emails" },
  { icon: MessageSquare, label: "Mensajes", id: "messages" },
  { icon: BarChart2, label: "Estrategia", id: "strategy" },
];

const generators = [
  {
    id: "vsl-downsell",
    title: "VSL Downsell (5–7 minutos)",
    description: "Genera una VSL de downsell corta y de alta conversión.",
    category: "copywriting",
    recommended: true,
  },
  {
    id: "vsl-upsell-2",
    title: "VSL Segundo Upsell (5–7 minutos)",
    description: "Genera una VSL de segundo upsell corta y de alta conversión.",
    category: "copywriting",
    recommended: true,
  },
  {
    id: "vsl-upsell-1",
    title: "VSL Primer Upsell (5–7 minutos)",
    description: "Genera una VSL de upsell corta y de alta conversión.",
    category: "copywriting",
  },
  {
    id: "landing-copy",
    title: "Copywriting para Páginas de Venta",
    description: "Genera todo el texto para tus páginas de venta con alta conversión.",
    category: "copywriting",
  },
  {
    id: "email-sequence",
    title: "Secuencia de Emails (5-7 emails)",
    description: "Crea una secuencia completa de emails de venta automatizada.",
    category: "emails",
    recommended: true,
  },
  {
    id: "email-launch",
    title: "Emails de Lanzamiento",
    description: "Genera emails persuasivos para lanzamientos de productos digitales.",
    category: "emails",
  },
  {
    id: "hooks-meta",
    title: "Hooks para Meta Ads",
    description: "Genera 10+ hooks de alta conversión para tus anuncios de Facebook e Instagram.",
    category: "social",
    recommended: true,
  },
  {
    id: "hooks-tiktok",
    title: "Hooks para TikTok Ads",
    description: "Crea hooks virales optimizados para TikTok y contenido vertical.",
    category: "social",
  },
  {
    id: "captions-ig",
    title: "Captions para Instagram",
    description: "Genera captions atractivos y optimizados para engagement en Instagram.",
    category: "instagram",
  },
  {
    id: "reels-script",
    title: "Guiones para Reels/Shorts",
    description: "Crea guiones virales para Reels, Shorts y TikToks con estructura probada.",
    category: "instagram",
  },
  {
    id: "yt-script",
    title: "Guión para YouTube",
    description: "Genera guiones completos optimizados para retención y conversión.",
    category: "youtube",
  },
  {
    id: "yt-titles",
    title: "Títulos y Thumbnails YouTube",
    description: "Crea títulos clickbait éticos y conceptos de thumbnails que generan clicks.",
    category: "youtube",
  },
  {
    id: "product-desc",
    title: "Descripción de Producto",
    description: "Genera descripciones persuasivas para productos físicos o digitales.",
    category: "product",
  },
  {
    id: "offer-stack",
    title: "Stack de Oferta Irresistible",
    description: "Diseña una oferta irresistible con bonos, garantía y urgencia.",
    category: "sales",
    recommended: true,
  },
  {
    id: "dm-script",
    title: "Script de Cierre por DM",
    description: "Genera scripts de cierre de venta por mensajes directos.",
    category: "messages",
  },
  {
    id: "funnel-strategy",
    title: "Estrategia de Funnel Completo",
    description: "Diseña un embudo de ventas optimizado de principio a fin.",
    category: "strategy",
    recommended: true,
  },
  {
    id: "audience-research",
    title: "Investigación de Audiencia",
    description: "Genera un perfil detallado de tu avatar ideal con dolores y deseos.",
    category: "strategy",
  },
  {
    id: "whatsapp-sequence",
    title: "Secuencia de WhatsApp",
    description: "Crea una secuencia de mensajes de WhatsApp para nurturing y cierre.",
    category: "messages",
  },
];

export function GeneradoresPage() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [activeGenerator, setActiveGenerator] = useState<string | null>(null);
  const [generatorInput, setGeneratorInput] = useState("");
  const [generatorOutput, setGeneratorOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const { consume, canAfford } = useCredits();

  const filteredGenerators = generators.filter((g) => {
    if (activeCategory === "all") return true;
    if (activeCategory === "recommended") return g.recommended;
    if (activeCategory === "favorites") return favorites.includes(g.id);
    return g.category === activeCategory;
  });

  const toggleFavorite = (id: string) => {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  const runGenerator = async (generator: typeof generators[0]) => {
    if (!generatorInput.trim()) {
      toast.error("Escribe los detalles de tu producto/servicio");
      return;
    }
    // Costo interno por tipo de generador (silencioso, sin mostrar en UI)
    const { action } = generatorCost(generator.id);
    if (!canAfford(action)) {
      toast.error("Sin créditos suficientes para generar", {
        description: "Recarga tu saldo o espera al próximo ciclo mensual.",
      });
      return;
    }
    // Descontar con label específico para que aparezca en el historial
    // como "Generador: <título> · -Nc"
    const ok = consume(action, generator.title);
    if (!ok) return;

    setLoading(true);
    setGeneratorOutput("");

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: [
              {
                role: "user",
                content: `Actúa como un experto en ${generator.category}. Tu tarea: ${generator.description}\n\nDetalles del producto/servicio del usuario:\n${generatorInput}\n\nGenera el contenido completo, listo para usar. Sé específico, persuasivo y orientado a conversiones.`,
              },
            ],
          }),
        }
      );

      if (!resp.ok || !resp.body) throw new Error("Error al generar");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let fullOutput = "";

      let streamDone = false;
      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullOutput += content;
              setGeneratorOutput(fullOutput);
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
      toast.success("¡Contenido generado!");
    } catch (err: any) {
      toast.error(err.message || "Error al generar contenido");
    } finally {
      setLoading(false);
    }
  };

  const selectedGen = generators.find((g) => g.id === activeGenerator);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0 -m-6 lg:-m-8">
      {/* Category sidebar */}
      <div className="w-56 flex-shrink-0 border-r border-border bg-card/50 p-4 overflow-auto">
        <h3 className="font-display font-bold text-foreground text-base mb-4 px-2">Generadores</h3>
        <nav className="space-y-0.5">
          {categories.map((cat, i) => {
            if ('divider' in cat && cat.divider) {
              return <div key={`div-${i}`} className="my-3 border-t border-border" />;
            }
            const Icon = cat.icon!;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => { setActiveCategory(cat.id!); setActiveGenerator(null); }}
                className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-all ${
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {cat.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto p-6 lg:p-8">
        {!activeGenerator ? (
          <>
            {/* Hero banner */}
            <div className="relative rounded-2xl overflow-hidden mb-8 bg-gradient-to-r from-card via-secondary to-card border border-border">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-primary/10 to-accent/5" />
              <div className="relative px-8 py-10 text-center">
                <h2 className="font-display font-bold text-2xl text-foreground mb-2">
                  Generadores de Contenido con IA
                </h2>
                <p className="text-sm text-muted-foreground max-w-lg mx-auto">
                  Genera copy, guiones, emails y estrategias con IA entrenada en marketing de alto rendimiento
                </p>
              </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredGenerators.map((gen) => (
                <button
                  key={gen.id}
                  onClick={() => { setActiveGenerator(gen.id); setGeneratorOutput(""); setGeneratorInput(""); }}
                  className="card-surface rounded-xl p-5 text-left hover:border-primary/30 transition-all group relative"
                >
                  {/* Favorite */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(gen.id); }}
                    className="absolute top-4 right-4 text-muted-foreground hover:text-warning transition-colors"
                  >
                    <Star className={`w-4 h-4 ${favorites.includes(gen.id) ? "fill-warning text-warning" : ""}`} />
                  </button>

                  {/* Icon */}
                  <div className="w-11 h-11 rounded-xl bg-secondary border border-border flex items-center justify-center mb-4 group-hover:border-primary/30 transition-colors">
                    <Layers className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>

                  <h4 className="text-sm font-semibold text-foreground mb-1.5 pr-6">{gen.title}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-4">{gen.description}</p>

                  <span className="text-xs px-2.5 py-1 rounded-md bg-secondary border border-border text-muted-foreground capitalize">
                    {gen.category === "copywriting" ? "Copywriting" : 
                     gen.category === "emails" ? "E-mails" :
                     gen.category === "social" ? "Redes Sociales" :
                     gen.category === "instagram" ? "Instagram" :
                     gen.category === "youtube" ? "YouTube" :
                     gen.category === "product" ? "Producto" :
                     gen.category === "sales" ? "Ventas" :
                     gen.category === "messages" ? "Mensajes" :
                     gen.category === "strategy" ? "Estrategia" : gen.category}
                  </span>
                </button>
              ))}

              {filteredGenerators.length === 0 && (
                <div className="col-span-full py-16 text-center">
                  <div className="text-4xl mb-3">
                    {activeCategory === "favorites" ? "⭐" : "🔍"}
                  </div>
                  <div className="font-display font-semibold text-foreground mb-1">
                    {activeCategory === "favorites" ? "Sin favoritos aún" : "Sin generadores"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {activeCategory === "favorites"
                      ? "Marca generadores como favoritos haciendo clic en la estrella"
                      : "No hay generadores en esta categoría"}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          /* Generator detail view */
          selectedGen && (
            <div className="max-w-3xl mx-auto space-y-6">
              <button
                onClick={() => setActiveGenerator(null)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Volver a generadores
              </button>

              <div>
                <h2 className="font-display font-bold text-xl text-foreground">{selectedGen.title}</h2>
                <p className="text-sm text-muted-foreground mt-1">{selectedGen.description}</p>
              </div>

              <div className="card-surface rounded-xl p-5 space-y-4">
                <label className="text-sm font-semibold text-foreground">
                  Describe tu producto o servicio
                </label>
                <textarea
                  value={generatorInput}
                  onChange={(e) => setGeneratorInput(e.target.value)}
                  placeholder="ej: Curso online de marketing digital para emprendedores que quieren escalar sus ventas con Meta Ads. Precio: $497. Público: emprendedores hispanos de 25-45 años..."
                  rows={5}
                  className="w-full bg-secondary border border-border rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all resize-none"
                />
                <button
                  onClick={() => runGenerator(selectedGen)}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-3 gradient-brand text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 glow-primary"
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Generando...</>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> Generar</>
                  )}
                </button>
              </div>

              {(generatorOutput || loading) && (
                <div className="card-surface rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-foreground">Resultado</span>
                    {generatorOutput && !loading && (
                      <button
                        onClick={() => { navigator.clipboard.writeText(generatorOutput); toast.success("Copiado"); }}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" /> Copiar
                      </button>
                    )}
                  </div>
                  <div className="bg-secondary rounded-lg p-4 text-sm text-foreground leading-relaxed whitespace-pre-wrap min-h-[100px]">
                    {generatorOutput || (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" /> Generando contenido...
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
