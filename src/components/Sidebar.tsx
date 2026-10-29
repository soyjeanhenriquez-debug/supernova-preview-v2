import { Shield, LogOut, PanelLeftClose, PanelLeftOpen, X, KeyRound, Lock, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { openSetPassword } from "@/lib/setPassword";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useNavigate } from "react-router-dom";
import { useFeatureAccess } from "@/lib/features";
import { ProductSwitcher } from "@/components/ProductSwitcher";
import { ADMIN_EXTRA_TOOLS, openTool, type Tool } from "@/lib/tools";
import { useVitrina } from "@/contexts/VitrinaContext";
import { MainNav } from "@/components/nav/MainNav";

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
  type NavItem = { icon: LucideIcon; key: string; label: string; hint: string; tool?: Tool; id?: string };
  const fromTool = (tl: Tool): NavItem => ({ icon: tl.icon, key: tl.key, label: tl.nav, hint: tl.desc, tool: tl, id: tl.id });
  const adminItems = ADMIN_EXTRA_TOOLS.filter(tl => canSee(tl.key)).map(fromTool);

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

  const renderItem = (item: NavItem) => {
    // Varias entradas abren Generadores (un generador cada una): solo "Textos que venden" se marca activa.
    const isActive = activePage === item.key && (!item.tool?.generator);
    const Icon = item.icon;
    return (
      <button
        key={item.id ?? item.key}
        data-tour={`nav-${item.id ?? item.key}`}
        onClick={() => (item.tool ? openTool(item.tool, handleNav) : handleNav(item.key))}
        title={isCollapsed ? `${item.label}: ${item.hint}` : item.hint}
        aria-current={isActive ? "page" : undefined}
        className={`flex items-center gap-3 w-full rounded-lg transition-colors text-left ${isCollapsed ? "justify-center px-2 py-2.5" : "px-3 py-2"} ${
          isActive
            ? "sidebar-active"
            : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
        }`}
      >
        <Icon className={`w-[15px] h-[15px] flex-shrink-0 ${isActive ? "text-foreground" : ""}`} strokeWidth={1.6} />
        {!isCollapsed && <span className="text-[13px] font-medium tracking-tight truncate">{item.label}</span>}
        {!isCollapsed && locked && item.key !== "Dashboard" && item.key !== "Aprende" && item.key !== "Recompensas" && <Lock className="ml-auto w-3 h-3 text-muted-foreground/60 shrink-0" strokeWidth={1.8} />}
      </button>
    );
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
        {/* Un solo menú para todos (29-oct-2026): src/lib/menu.ts. */}
        <MainNav activePage={activePage} onNavigate={handleNav} collapsed={isCollapsed} />

        {adminItems.length > 0 && (
          <div className={isCollapsed ? "pt-2 mt-2 border-t border-border/50" : "pt-3"}>
            {!isCollapsed && <p className="px-3 pb-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70 font-semibold">Solo admin (en pausa)</p>}
            {adminItems.map(renderItem)}
          </div>
        )}

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
