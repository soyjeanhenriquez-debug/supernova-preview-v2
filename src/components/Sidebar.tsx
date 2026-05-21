import { LayoutDashboard, Trophy, Telescope, FileText, FolderKanban, Coins, Shield, LogOut, Brain, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useProjects } from "@/hooks/useProjects";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useNavigate } from "react-router-dom";

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
  const { projects } = useProjects();
  const { isAdmin } = useIsAdmin();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const navItems = [
    { icon: LayoutDashboard, key: "Dashboard", label: t("nav.dashboard") },
    { icon: Trophy, key: "Buscar Ofertas Winner", label: t("nav.winners") },
    { icon: Telescope, key: "Oráculo", label: t("nav.oracle") },
    { icon: FileText, key: "Generadores", label: t("nav.generators") },
    { icon: FolderKanban, key: "Proyectos", label: t("nav.projects") },
    { icon: Coins, key: "Créditos", label: t("nav.credits") },
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
      className={`relative flex flex-col min-h-screen border-r border-border bg-sidebar transition-[width] duration-200 ease-out ${isCollapsed ? "w-[68px]" : "w-[260px]"}`}
    >
      {/* Toggle (desktop only) */}
      {!mobile && (
        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expandir" : "Colapsar"}
          aria-label={collapsed ? "Expandir" : "Colapsar"}
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
            <div className="text-[9px] text-muted-foreground tracking-[0.24em] uppercase font-medium mt-2">DR Intelligence</div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className={`flex-1 py-1 space-y-px overflow-y-auto overflow-x-hidden ${isCollapsed ? "px-2" : "px-3"}`}>
        {navItems.map((item) => {
          const isActive = activePage === item.key;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              data-tour={`nav-${item.key}`}
              onClick={() => handleNav(item.key)}
              title={isCollapsed ? item.label : undefined}
              className={`flex items-center gap-3 w-full rounded-lg transition-colors text-left ${isCollapsed ? "justify-center px-2 py-2.5" : "px-3 py-2"} ${
                isActive
                  ? "sidebar-active"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              }`}
            >
              <Icon className={`w-[15px] h-[15px] flex-shrink-0 ${isActive ? "text-foreground" : ""}`} strokeWidth={1.6} />
              {!isCollapsed && <span className="text-[13px] font-medium tracking-tight truncate">{item.label}</span>}
            </button>
          );
        })}

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

        {/* SUPERNOVA BRAIN */}
        {!isCollapsed ? (
          <button
            onClick={() => handleNav("Proyectos")}
            data-tour="nav-brain"
            className="w-full mt-6 mx-0 px-3 py-3 rounded-lg border border-border hover:border-foreground/20 hover:bg-secondary/40 transition-colors text-left group"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Brain className="w-[14px] h-[14px] text-muted-foreground group-hover:text-primary transition-colors" strokeWidth={1.6} />
                <span className="font-display font-semibold text-[11px] text-foreground tracking-tight">{t("nav.brain")}</span>
              </div>
              {projects.length > 0 && <span className="text-[10px] tabular-nums text-muted-foreground">{projects.length}</span>}
            </div>
            <div className="text-[10px] text-muted-foreground/80 tracking-tight">{t("nav.brainSub")}</div>
          </button>
        ) : (
          <button
            onClick={() => handleNav("Proyectos")}
            title={t("nav.brain")}
            className="w-full mt-4 flex items-center justify-center py-2.5 rounded-lg border border-border hover:border-foreground/20 hover:bg-secondary/40 transition-colors"
          >
            <Brain className="w-[15px] h-[15px] text-muted-foreground" strokeWidth={1.6} />
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
            <button onClick={handleSignOut} title={t("common.logout")} className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-secondary/60">
              <LogOut className="w-[14px] h-[14px]" strokeWidth={1.6} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center text-[12px] font-semibold flex-shrink-0 text-foreground">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-medium text-foreground truncate leading-tight">{displayName}</div>
              <div className="text-[10px] text-muted-foreground truncate leading-tight">{user?.email}</div>
            </div>
            <button onClick={handleSignOut} className="text-muted-foreground hover:text-foreground transition-colors p-1" title={t("common.logout")}>
              <LogOut className="w-[14px] h-[14px]" strokeWidth={1.6} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
