import { LayoutDashboard, Megaphone, Users, ImageIcon, BarChart2, Settings, Zap, ChevronDown, Bell, Trophy, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: Megaphone, label: "Campañas" },
  { icon: Trophy, label: "Anuncios Ganadores", badge: "IA" },
  { icon: Users, label: "Audiencias" },
  { icon: ImageIcon, label: "Creatividades" },
  { icon: BarChart2, label: "Reportes" },
  { icon: Settings, label: "Configuración" },
];

interface SidebarProps {
  activePage: string;
  onNavigate: (page: string) => void;
}

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    toast.success("Sesión cerrada");
  };

  const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Usuario";
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <aside className="flex flex-col w-64 min-h-screen border-r border-sidebar-border bg-sidebar animate-slide-in-left" style={{ background: "var(--gradient-sidebar)" }}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
        <div className="relative flex items-center justify-center w-9 h-9 rounded-lg gradient-brand">
          <Zap className="w-5 h-5 text-primary-foreground" fill="currentColor" />
          <div className="absolute inset-0 rounded-lg animate-pulse-glow opacity-60" />
        </div>
        <div>
          <span className="font-display font-bold text-foreground text-base tracking-tight">META 10X</span>
          <div className="text-xs text-muted-foreground">Workflow Tool</div>
        </div>
      </div>

      {/* Workspace selector */}
      <div className="px-4 py-3 border-b border-sidebar-border">
        <button className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-sidebar-accent transition-colors group">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded gradient-brand flex items-center justify-center text-xs font-bold text-primary-foreground">{initials}</div>
            <span className="text-sm font-medium text-sidebar-foreground group-hover:text-foreground transition-colors truncate max-w-[130px]">{displayName}</span>
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        <div className="px-3 pb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Principal</span>
        </div>
        {navItems.map((item, i) => {
          const isActive = activePage === item.label;
          return (
            <button
              key={item.label}
              onClick={() => onNavigate(item.label)}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-all group text-left ${
                isActive
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground border border-transparent"
              }`}
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <item.icon
                className={`w-4 h-4 flex-shrink-0 transition-colors ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`}
              />
              <span className="text-sm font-medium flex-1">{item.label}</span>
              {item.badge && (
                <span className="text-xs px-1.5 py-0.5 rounded-full gradient-brand text-primary-foreground font-semibold">
                  {item.badge}
                </span>
              )}
              {isActive && <div className="w-1 h-1 rounded-full bg-primary" />}
            </button>
          );
        })}
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full gradient-brand flex items-center justify-center text-sm font-bold text-primary-foreground flex-shrink-0">{initials}</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-foreground truncate">{displayName}</div>
            <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
          </div>
          <button
            onClick={handleSignOut}
            className="text-muted-foreground hover:text-destructive transition-colors"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
