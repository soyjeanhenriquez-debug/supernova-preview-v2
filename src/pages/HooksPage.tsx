import { useEffect, useMemo, useState } from "react";
import { Quote, Copy, Check, Star, Video, Sparkles, Search, Flame, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureAccess } from "@/lib/features";

/**
 * Bóveda de Hooks: ganchos extraídos de anuncios ganadores REALES del radar.
 * La prueba no son views (viralidad de una vez): es que el anunciante siguió
 * PAGANDO por correr ese gancho — days_active × duplicate_count.
 *
 * Navegar es GRATIS a propósito (imán de visita diaria, como el radar). Las
 * acciones desde un hook cobran los créditos de siempre en su destino
 * (video → Media Credits, copies → créditos de texto).
 */

interface VaultHook {
  id: string;
  hook_text: string;
  hook_template: string;
  category: string;
  language: string | null;
  market: string | null;
  days_active: number | null;
  duplicate_count: number | null;
  winner_score: number | null;
  source_page_name: string | null;
  created_at: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  dolor: "Dolor", curiosidad: "Curiosidad", prueba_social: "Prueba social",
  autoridad: "Autoridad", urgencia: "Urgencia", contrarian: "Llevar la contraria",
  historia: "Historia", caso_estudio: "Caso de estudio", lista: "Lista",
};

const CATEGORY_CLASS: Record<string, string> = {
  dolor: "bg-red-500/15 text-red-400",
  curiosidad: "bg-purple-500/15 text-purple-400",
  prueba_social: "bg-blue-500/15 text-blue-400",
  autoridad: "bg-amber-500/15 text-amber-400",
  urgencia: "bg-orange-500/15 text-orange-400",
  contrarian: "bg-pink-500/15 text-pink-400",
  historia: "bg-teal-500/15 text-teal-400",
  caso_estudio: "bg-cyan-500/15 text-cyan-400",
  lista: "bg-lime-500/15 text-lime-400",
};

const MARKET_FLAG: Record<string, string> = {
  US: "🇺🇸", BR: "🇧🇷", MX: "🇲🇽", ES: "🇪🇸", CO: "🇨🇴", AR: "🇦🇷", PE: "🇵🇪",
  CL: "🇨🇱", PT: "🇵🇹", FR: "🇫🇷", DE: "🇩🇪", IT: "🇮🇹", GB: "🇬🇧", RU: "🇷🇺", ALL: "🌍",
};

const MEDIA_HOOK_KEY = "supernova_media_hook";

export function HooksPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { user } = useAuth();
  const { canSee } = useFeatureAccess();
  const [hooks, setHooks] = useState<VaultHook[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("todos");
  const [view, setView] = useState<"todos" | "favoritos" | "nuevos">("todos");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("hook_vault")
        .select("id, hook_text, hook_template, category, language, market, days_active, duplicate_count, winner_score, source_page_name, created_at")
        .order("winner_score", { ascending: false })
        .order("days_active", { ascending: false })
        .limit(500);
      setHooks((data as VaultHook[]) ?? []);

      if (user?.id) {
        const { data: favs } = await supabase
          .from("hook_favorites").select("hook_id").eq("user_id", user.id);
        setFavorites(new Set((favs ?? []).map((f) => f.hook_id)));
      }
      setLoading(false);
    })();
  }, [user?.id]);

  const toggleFavorite = async (hookId: string) => {
    if (!user?.id) return;
    const next = new Set(favorites);
    if (next.has(hookId)) {
      next.delete(hookId);
      setFavorites(next);
      await supabase.from("hook_favorites").delete().eq("user_id", user.id).eq("hook_id", hookId);
    } else {
      next.add(hookId);
      setFavorites(next);
      await supabase.from("hook_favorites").insert({ user_id: user.id, hook_id: hookId });
    }
  };

  const copyHook = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Gancho copiado. Pégalo donde quieras.");
  };

  const videoFromHook = (h: VaultHook) => {
    // El gancho es de OTRO anuncio (otro producto, a veces otro idioma): Media Studio lo usa
    // como estructura y la IA escribe el guion con el negocio del usuario y en su idioma.
    try { localStorage.setItem(MEDIA_HOOK_KEY, h.hook_text); } catch { /* sin almacenamiento */ }
    onNavigate?.("Media Studio");
    toast.success("Gancho enviado a Media Studio", { description: "Allí la IA lo adapta a tu producto y a tu idioma." });
  };

  const copiesFromHook = (h: VaultHook) => {
    navigator.clipboard.writeText(h.hook_template);
    onNavigate?.("Generadores");
    toast.success("Plantilla copiada. Pégala en el generador de textos que elijas.");
  };

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return hooks.filter((h) => {
      if (view === "favoritos" && !favorites.has(h.id)) return false;
      if (view === "nuevos" && new Date(h.created_at) < today) return false;
      if (category !== "todos" && h.category !== category) return false;
      if (q && !`${h.hook_text} ${h.hook_template} ${h.source_page_name ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hooks, favorites, search, category, view]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wider text-primary font-semibold">Mi negocio · Etapa 5 · Vender</p>
        <h2 className="page-heading font-display text-2xl text-foreground flex items-center gap-2 mt-1">
          <Quote className="w-6 h-6 text-primary" /> BÓVEDA DE GANCHOS
        </h2>
        <p className="text-sm text-muted-foreground mt-3 max-w-2xl">
          La primera frase de tu anuncio decide si te leen. Elige un gancho y cópialo con los datos de tu producto.
        </p>
        <details className="group mt-2 max-w-2xl">
          <summary className="inline-flex items-center gap-1 cursor-pointer list-none [&::-webkit-details-marker]:hidden select-none text-[12.5px] font-medium text-muted-foreground hover:text-foreground">
            ¿Cómo funciona? <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <ul className="mt-2 space-y-1 pl-4 list-disc marker:text-primary text-[12.5px] text-muted-foreground">
            <li>Cada gancho sale de un anuncio real que su dueño sigue pagando por mostrar.</li>
            <li>Viene como plantilla: cambia lo que va entre corchetes por lo tuyo.</li>
            <li>Mirar y copiar es gratis. "Hacer video" y "Escribir textos" gastan créditos en su herramienta.</li>
          </ul>
        </details>
      </div>

      {/* Buscador + vistas */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Busca una palabra o un tema (ej: dinero, piel, inglés)…"
            className="w-full bg-secondary border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        {([
          { key: "todos", label: "Todos los ganchos" },
          { key: "favoritos", label: "⭐ Mis guardados" },
          { key: "nuevos", label: "🆕 Añadidos hoy" },
        ] as const).map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
              view === v.key ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Chips de categoría */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setCategory("todos")}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
            category === "todos" ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          Todos los tipos
        </button>
        {Object.entries(CATEGORY_LABEL).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setCategory(category === key ? "todos" : key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              category === key ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="card-surface rounded-xl py-16 text-center text-sm text-muted-foreground">Cargando los ganchos…</div>
      ) : filtered.length === 0 ? (
        <div className="card-surface rounded-xl py-16 text-center">
          <div className="empty-icon mb-4"><Quote className="w-9 h-9" /></div>
          <div className="text-sm text-muted-foreground">
            {view === "favoritos" ? "Aún no guardaste ningún gancho. Toca la estrella de los que te gusten y aparecerán aquí." : "Ningún gancho coincide. Prueba con otra palabra o quita el filtro de tipo."}
          </div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map((h) => (
            <HookCard
              key={h.id}
              hook={h}
              isFavorite={favorites.has(h.id)}
              onToggleFavorite={() => toggleFavorite(h.id)}
              onCopy={() => copyHook(h.hook_template)}
              onVideo={canSee("Media Studio") ? () => videoFromHook(h) : undefined}
              onCopies={() => copiesFromHook(h)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HookCard({ hook: h, isFavorite, onToggleFavorite, onCopy, onVideo, onCopies }: {
  hook: VaultHook;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onCopy: () => void;
  onVideo?: () => void;
  onCopies: () => void;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  const [copied, setCopied] = useState(false);
  const flag = MARKET_FLAG[h.market ?? ""] ?? "🌍";

  return (
    <div className="card-surface rounded-xl p-5 flex flex-col gap-3 ad-card-hover">
      <div className="flex items-start justify-between gap-2">
        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${CATEGORY_CLASS[h.category] ?? "bg-secondary text-muted-foreground"}`}>
          {CATEGORY_LABEL[h.category] ?? h.category}
        </span>
        <button
          onClick={onToggleFavorite}
          className={isFavorite ? "text-primary" : "text-muted-foreground hover:text-primary"}
          title={isFavorite ? "Quitar de mis guardados" : "Guardar este gancho"}
        >
          <Star className="w-4 h-4" fill={isFavorite ? "currentColor" : "none"} />
        </button>
      </div>

      <p className="font-display font-semibold text-[15px] leading-snug text-foreground flex-1">
        {h.hook_template}
      </p>

      <button onClick={() => setShowOriginal(!showOriginal)} className="text-[11px] text-muted-foreground hover:text-primary text-left">
        {showOriginal ? "− Ocultar el original" : "+ Ver la frase original del anuncio"}
      </button>
      {showOriginal && (
        <p className="text-[13px] text-muted-foreground italic border-l-2 border-primary/40 pl-3">
          "{h.hook_text}"
          {h.source_page_name && <span className="not-italic block mt-1 text-[11px]">— {h.source_page_name}</span>}
        </p>
      )}

      {/* La prueba con dinero real */}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1 text-primary font-semibold">
          <Flame className="w-3 h-3" /> {h.days_active ?? "?"} días en el aire
        </span>
        <span>· {h.duplicate_count ?? 1} anuncios activos</span>
        <span title="Qué tan fuerte es la señal de que funciona, de 0 a 100">· puntaje {h.winner_score ?? "—"}/100</span>
        <span title="País donde se muestra el anuncio">· se anuncia en {flag}</span>
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <button
          onClick={() => { onCopy(); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="flex-1 py-2 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-secondary flex items-center justify-center gap-1.5"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />} Copiar plantilla
        </button>
        {onVideo && <button
          onClick={onVideo}
          title="Crea un video corto con este gancho, narrado por un avatar hecho con IA (gasta créditos)"
          className="flex-1 py-2 rounded-lg bg-primary/15 text-primary text-xs font-semibold hover:bg-primary/25 flex items-center justify-center gap-1.5"
        >
          <Video className="w-3.5 h-3.5" /> Hacer video
        </button>}
        <button
          onClick={onCopies}
          title="Usa este gancho para escribir textos de anuncio con la IA (gasta créditos)"
          className="flex-1 py-2 rounded-lg bg-primary/15 text-primary text-xs font-semibold hover:bg-primary/25 flex items-center justify-center gap-1.5"
        >
          <Sparkles className="w-3.5 h-3.5" /> Escribir textos
        </button>
      </div>
    </div>
  );
}
