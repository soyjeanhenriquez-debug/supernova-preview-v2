import { useEffect, useMemo, useState } from "react";
import { Search, House, Clock, ChevronRight, Lock, Coins, GraduationCap, BadgeDollarSign } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureAccess } from "@/lib/features";
import { useVitrina } from "@/contexts/VitrinaContext";
import { isGenjutsuOwner } from "@/lib/genjutsuOwner";
import { useLocationHash } from "@/lib/tree";
import {
  MENU, MENU_ITEMS, menuItemFor, openMenuItem, pushRecent, readFolded, readRecent, saveFolded, type MenuItem,
} from "@/lib/menu";

/**
 * Menú lateral estilo Apple (29-oct-2026): buscador arriba, Inicio, tus 3 recientes y cuatro secciones que se pliegan
 * (se recuerda), cada herramienta a un toque. Lo seleccionado se marca en gris, sin ámbar (manual: el ámbar es solo
 * para acciones principales). La lista vive en src/lib/menu.ts.
 */
export function MainNav({ activePage, onNavigate, collapsed }: { activePage: string; onNavigate: (page: string) => void; collapsed: boolean }) {
  const { user } = useAuth();
  const { canSee } = useFeatureAccess();
  const { locked } = useVitrina();
  const hash = useLocationHash();
  const jean = isGenjutsuOwner(user?.id);
  const visible = (i: MenuItem) => canSee(i.page) && (!i.owner || jean);

  const current = menuItemFor(activePage, hash);
  const [recent, setRecent] = useState<string[]>(readRecent);
  useEffect(() => { if (current) setRecent(pushRecent(current.id)); }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [folded, setFolded] = useState<Record<string, boolean>>(() => {
    const saved = readFolded();
    return Object.fromEntries(MENU.map(s => [s.id, saved[s.id] ?? !!s.folded]));
  });
  const toggle = (id: string) => setFolded(f => { const n = { ...f, [id]: !f[id] }; saveFolded(n); return n; });

  const recentItems = useMemo(
    () => recent.map(id => MENU_ITEMS.find(i => i.id === id)).filter((i): i is MenuItem => !!i && visible(i)),
    [recent, canSee, jean], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // El buscador de arriba (GlobalSearch) escucha ⌘K en la ventana.
  const openSearch = () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true }));

  const row = (active: boolean) =>
    `group flex items-center gap-2.5 w-full rounded-md transition-colors text-left ${collapsed ? "justify-center px-2 h-9" : "px-2.5 h-8"} ${
      active ? "bg-secondary text-foreground" : "text-foreground/75 hover:bg-secondary/60 hover:text-foreground"}`;

  const item = (i: MenuItem, keyPrefix = "") => {
    const active = current?.id === i.id;
    const Icon = i.icon;
    return (
      <button key={keyPrefix + i.id} data-tour={`nav-${i.id}`} onClick={() => openMenuItem(i, onNavigate)} title={collapsed ? i.label : undefined}
        aria-current={active ? "page" : undefined} className={row(active)}>
        <Icon className={`w-4 h-4 shrink-0 ${active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"}`} strokeWidth={1.7} />
        {!collapsed && <span className="text-[13px] tracking-tight truncate">{i.label}</span>}
        {!collapsed && locked && !i.free && <Lock className="ml-auto w-3 h-3 text-muted-foreground/60 shrink-0" strokeWidth={1.8} />}
      </button>
    );
  };

  const header = (title: string, id?: string) => collapsed
    ? <div className="mx-2 my-2 border-t border-border/50" />
    : id ? (
      <button onClick={() => toggle(id)} aria-expanded={!folded[id]}
        className="group flex items-center w-full px-2.5 pt-4 pb-1 text-[11px] font-semibold text-muted-foreground/80 hover:text-foreground">
        <span>{title}</span>
        <ChevronRight className={`ml-auto w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-all ${folded[id] ? "" : "rotate-90"}`} strokeWidth={2} />
      </button>
    ) : <p className="px-2.5 pt-4 pb-1 text-[11px] font-semibold text-muted-foreground/80">{title}</p>;

  return (
    <div className="space-y-px">
      <button onClick={openSearch} title="Buscar (⌘K)"
        className={`flex items-center gap-2.5 w-full rounded-md border border-border bg-secondary/40 text-muted-foreground hover:text-foreground hover:border-foreground/25 transition-colors ${collapsed ? "justify-center h-9" : "px-2.5 h-8 mb-2"}`}>
        <Search className="w-4 h-4 shrink-0" strokeWidth={1.7} />
        {!collapsed && <><span className="text-[13px]">Buscar</span><kbd className="ml-auto text-[10.5px] font-sans text-muted-foreground/70">⌘K</kbd></>}
      </button>

      <button onClick={() => onNavigate("Dashboard")} title={collapsed ? "Inicio" : undefined} aria-current={activePage === "Dashboard" ? "page" : undefined}
        className={row(activePage === "Dashboard")}>
        <House className="w-4 h-4 shrink-0" strokeWidth={1.7} />
        {!collapsed && <span className="text-[13px] tracking-tight">Inicio</span>}
      </button>

      {recentItems.length > 0 && !collapsed && (
        <>
          <p className="flex items-center gap-1.5 px-2.5 pt-4 pb-1 text-[11px] font-semibold text-muted-foreground/80"><Clock className="w-3 h-3" strokeWidth={2} /> Recientes</p>
          {recentItems.map(i => item(i, "r-"))}
        </>
      )}

      {MENU.map(s => {
        const items = s.items.filter(visible);
        if (!items.length) return null;
        // Si estás en una herramienta de una sección plegada, se ve igual (para no perderte).
        const open = collapsed || !folded[s.id] || items.some(i => i.id === current?.id);
        return (
          <div key={s.id}>
            {header(s.title, s.id)}
            {open && items.map(i => item(i))}
          </div>
        );
      })}

      {header("Tu cuenta")}
      <button onClick={() => onNavigate("Créditos")} title={collapsed ? "Créditos" : undefined} className={row(activePage === "Créditos")}>
        <Coins className="w-4 h-4 shrink-0 text-muted-foreground" strokeWidth={1.7} />{!collapsed && <span className="text-[13px] tracking-tight">Créditos</span>}
      </button>
      <button onClick={() => onNavigate("Aprende")} title={collapsed ? "Ayuda y guías" : undefined} className={row(activePage === "Aprende")}>
        <GraduationCap className="w-4 h-4 shrink-0 text-muted-foreground" strokeWidth={1.7} />{!collapsed && <span className="text-[13px] tracking-tight">Ayuda y guías</span>}
      </button>
      {canSee("Recompensas") && (
        <button onClick={() => onNavigate("Recompensas")} title={collapsed ? "Gana con tu contenido" : undefined} className={row(activePage === "Recompensas")}>
          <BadgeDollarSign className="w-4 h-4 shrink-0 text-muted-foreground" strokeWidth={1.7} />{!collapsed && <span className="text-[13px] tracking-tight">Gana con tu contenido</span>}
        </button>
      )}
    </div>
  );
}
