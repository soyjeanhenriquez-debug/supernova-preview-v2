import { LayoutDashboard, FolderKanban, Coins, Shield, LogOut, PanelLeftClose, PanelLeftOpen, X, KeyRound, Briefcase, LayoutGrid, GraduationCap, Lock, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { openSetPassword } from "@/lib/setPassword";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useNavigate } from "react-router-dom";
import { useFeatureAccess } from "@/lib/features";
import { ProductSwitcher } from "@/components/ProductSwitcher";
import { STUDIO_TOOLS, FIND_TOOLS, ADMIN_EXTRA_TOOLS, openTool, useBusinessModel, type Tool } from "@/lib/tools";
import { TUTORIALS } from "@/lib/tutorials";
import { useVitrina } from "@/contexts/VitrinaContext";

interface SidebarProps {
  activePage: string;
  onNavigate: (page: string) => void;
  /** When true, render in mobile drawer mode (overlay), ignoring collapse state */
  mobile?: boolean;
  onCloseMobile?: () => void;
}

const COLLAPSE_KEY = "supernova:sidebar-collapsed";

export function Sidebar({ activePage, onNavigate, mobile = false, onCloseMobile }: SidebarProps) {
  const { user, signOut } = useAuth();
  const { isAdmin } = useIsAdmin();
  const { canSee } = useFeatureAccess();
  const { locked, openPlans } = useVitrina();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Menú por intención (decisión de Jean, 03-oct-2026): los mismos grupos que el Inicio
  // (src/lib/tools.ts), más Biblioteca y Cuenta. Las secciones en pausa (src/lib/features.ts) solo
  // las ve un admin. Las claves y los data-tour="nav-<key>" no cambian (los usan el tour y la ayuda).
  type NavItem = { icon: LucideIcon; key: string; label: string; hint: string; tool?: Tool; id?: string };
  const fromTool = (tl: Tool): NavItem => ({ icon: tl.icon, key: tl.key, label: tl.nav, hint: tl.desc, tool: tl, id: tl.id });
  const { current: modelInfo } = useBusinessModel();
  const visible = (list: Tool[]) => list.filter(tl => canSee(tl.key)).map(fromTool);
  const groups: { title: string; items: NavItem[] }[] = [
    { title: "", items: [
      { icon: LayoutDashboard, key: "Dashboard", label: t("nav.dashboard"), hint: "¿Qué quieres hacer hoy? Todas las herramientas y lo último que creaste." },
    ] },
    { title: "Estudio IA", items: visible(STUDIO_TOOLS) },
    { title: `Tu negocio · ${modelInfo.short}`, items: visible(modelInfo.tools) },
    { title: "Encontrar", items: visible(FIND_TOOLS) },
    { title: "Biblioteca", items: [
      // Aprende aparece cuando hay al menos un video (nada de secciones vacías).
      ...(TUTORIALS.length ? [{ icon: GraduationCap, key: "Aprende", label: "Aprende", hint: "Un video corto por herramienta para verla en acción." }] : []),
      { icon: LayoutGrid, key: "Productos", label: "Mis productos", hint: "Todos tus productos y cuánto avanzó cada uno." },
      { icon: FolderKanban, key: "Proyectos", label: t("nav.projects"), hint: t("nav.hint.projects") },
    ] },
    { title: "Cuenta", items: [
      { icon: Briefcase, key: "Mi negocio", label: "Mi ficha", hint: "Qué vendes, para quién y qué logra este producto. Lo usan todas las herramientas." },
      { icon: Coins, key: "Créditos", label: t("nav.credits"), hint: t("nav.hint.credits") },
    ] },
    { title: "Solo admin (en pausa)", items: visible(ADMIN_EXTRA_TOOLS) },
  ];

  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem(COLLAPSE_KEY) === "1");

  useEffect(() => { localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0"); }, [collapsed]);

  // In mobile mode, never collapsed
  const isCollapsed = mobile ? false : collapsed;

  const handleSignOut = async () => { await signOut(); toast.success(t("common.logout")); };
  const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Usuario";
  const initials = displayName.charAt(0).toUpperCase();

  const handleNav = (key: string) => {
    onNavigate(key);
    if (mobile && onCloseMobile) onCloseMobile();
  };

  return (
    <aside
      className={`relative flex flex-col h-screen supports-[height:100dvh]:h-[100dvh] border-r border-border bg-sidebar transition-[width] duration-200 ease-out ${isCollapsed ? "w-[68px]" : "w-[260px]"}`}
    >
      {/* Toggle (desktop only) */}
      {!mobile && (
        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Mostrar el menú" : "Ocultar el menú"}
          aria-label={collapsed ? "Mostrar el menú" : "Ocultar el menú"}
          className="hidden lg:flex absolute -right-3 top-7 z-20 w-6 h-6 rounded-full bg-card border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 items-center justify-center shadow-sm transition-colors"
        >
          {collapsed ? <PanelLeftOpen className="w-3 h-3" strokeWidth={1.8} /> : <PanelLeftClose className="w-3 h-3" strokeWidth={1.8} />}
        </button>
      )}
      {mobile && (
        <button
          onClick={onCloseMobile}
          aria-label="Cerrar"
          className="absolute right-3 top-5 z-20 w-7 h-7 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 flex items-center justify-center"
        >
          <X className="w-3.5 h-3.5" strokeWidth={1.8} />
        </button>
      )}

      {/* Wordmark — Apple-style */}
      <div className={`pt-7 pb-6 ${isCollapsed ? "px-0 flex justify-center" : "px-6"}`}>
        {isCollapsed ? (
          <img src="/supernova-icon.png" alt="SUPERNOVA" className="w-7 h-7" />
        ) : (
          <div className="leading-none">
            <div className="font-display font-semibold text-foreground text-[28px] tracking-[-0.045em]">
              supern<span className="text-primary">o</span>va
            </div>
            <div className="text-[9px] text-muted-foreground tracking-[0.24em] uppercase font-medium mt-2">Qué vender y cómo anunciarlo</div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className={`flex-1 min-h-0 py-1 space-y-px overflow-y-auto overflow-x-hidden ${isCollapsed ? "px-2" : "px-3"}`}>
        {/* Producto activo: todo el menú de abajo trabaja sobre él. */}
        {locked ? (
          !isCollapsed && (
            <div className="pb-3 px-1">
              <button onClick={() => openPlans()} className="btn-primary-nova w-full rounded-xl px-3 py-2.5 text-[13px] font-semibold">Empieza tus 3 días gratis</button>
              <p className="mt-1.5 px-1 text-[11px] text-muted-foreground leading-snug">Estás viendo SUPERNOVA sin plan. Lo que tiene candado se abre con PRO.</p>
            </div>
          )
        ) : <div className="pb-3"><ProductSwitcher collapsed={isCollapsed} onNavigate={handleNav} /></div>}
        {groups.filter(g => g.items.length).map((g, gi) => (
          <div key={g.title || gi} className={gi ? (isCollapsed ? "pt-2 mt-2 border-t border-border/50" : "pt-3") : ""}>
            {g.title && !isCollapsed && (
              <p className="px-3 pb-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70 font-semibold">{g.title}</p>
            )}
            {g.items.map((item) => {
          // Varias entradas abren Generadores (un generador cada una): solo "Robot de copy" se marca activa.
          const isActive = activePage === item.key && (!item.tool?.generator);
          const Icon = item.icon;
          return (
            <button
              key={item.id ?? item.key}
              data-tour={`nav-${item.id ?? item.key}`}
              onClick={() => (item.tool ? openTool(item.tool, handleNav) : handleNav(item.key))}
              title={isCollapsed ? `${item.label}: ${item.hint}` : item.hint}
              className={`flex items-center gap-3 w-full rounded-lg transition-colors text-left ${isCollapsed ? "justify-center px-2 py-2.5" : "px-3 py-2"} ${
                isActive
                  ? "sidebar-active"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              }`}
            >
              <Icon className={`w-[15px] h-[15px] flex-shrink-0 ${isActive ? "text-foreground" : ""}`} strokeWidth={1.6} />
              {!isCollapsed && <span className="text-[13px] font-medium tracking-tight truncate">{item.label}</span>}
              {!isCollapsed && locked && item.key !== "Dashboard" && item.key !== "Aprende" && <Lock className="ml-auto w-3 h-3 text-muted-foreground/60 shrink-0" strokeWidth={1.8} />}
            </button>
          );
        })}
          </div>
        ))}

        {isAdmin && (
          <button
            onClick={() => { navigate("/admin"); if (mobile && onCloseMobile) onCloseMobile(); }}
            title={isCollapsed ? t("common.admin") : undefined}
            className={`flex items-center gap-3 w-full rounded-lg transition-colors text-left mt-1 text-muted-foreground hover:bg-secondary/60 hover:text-foreground ${isCollapsed ? "justify-center px-2 py-2.5" : "px-3 py-2"}`}
          >
            <Shield className="w-[15px] h-[15px] text-primary flex-shrink-0" strokeWidth={1.6} />
            {!isCollapsed && <span className="text-[13px] font-medium tracking-tight">{t("common.admin")}</span>}
          </button>
        )}

      </nav>

      {/* User section */}
      <div className={`pb-4 pt-3 border-t border-border/60 ${isCollapsed ? "px-2" : "px-3"}`}>
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div title={user?.email ?? displayName} className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center text-[12px] font-semibold text-foreground">
              {initials}
            </div>
            <button onClick={openSetPassword} title="Cambiar contraseña" aria-label="Cambiar contraseña" className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-secondary/60">
              <KeyRound className="w-[14px] h-[14px]" strokeWidth={1.6} />
            </button>
            <button onClick={handleSignOut} title={t("common.logout")} className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-secondary/60">
              <LogOut className="w-[14px] h-[14px]" strokeWidth={1.6} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center text-[12px] font-semibold flex-shrink-0 text-foreground">
              {initials}
            </div>
            <div className="flex-1 min-w-0" data-ph-mask>
              <div className="text-[12px] font-medium text-foreground truncate leading-tight">{displayName}</div>
              <div className="text-[10px] text-muted-foreground truncate leading-tight">{user?.email}</div>
            </div>
            <button onClick={openSetPassword} className="text-muted-foreground hover:text-foreground transition-colors p-1" title="Cambiar contraseña" aria-label="Cambiar contraseña">
              <KeyRound className="w-[14px] h-[14px]" strokeWidth={1.6} />
            </button>
            <button onClick={handleSignOut} className="text-muted-foreground hover:text-foreground transition-colors p-1" title={t("common.logout")}>
              <LogOut className="w-[14px] h-[14px]" strokeWidth={1.6} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
