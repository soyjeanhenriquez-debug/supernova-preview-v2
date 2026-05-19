import { LayoutDashboard, Trophy, Telescope, Bot, MessageSquare, FileText, FolderKanban, Coins, Shield, LogOut, Brain } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useProjects } from "@/hooks/useProjects";

interface SidebarProps {
  activePage: string;
  onNavigate: (page: string) => void;
}

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: Trophy, label: "Buscar Ofertas Winner" },
  { icon: Telescope, label: "Oráculo" },
  { icon: Bot, label: "Agentes DR" },
  { icon: MessageSquare, label: "Chat IA" },
  { icon: FileText, label: "Generadores" },
  { icon: FolderKanban, label: "Proyectos" },
  { icon: Coins, label: "Créditos" },
];

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const { user, signOut } = useAuth();
  const { projects } = useProjects();

  const handleSignOut = async () => { await signOut(); toast.success("Sesión cerrada"); };
  const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Usuario";
  const initials = displayName.charAt(0).toUpperCase();
  const isAdmin = user?.email === "demo@supernova.test" || user?.user_metadata?.role === "admin";

  return (
    <aside className="flex flex-col w-[240px] min-h-screen border-r border-border bg-sidebar">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-7">
        <img src="/supernova-icon.png" alt="SUPERNOVA" className="w-7 h-7" />
        <div className="leading-tight">
          <div className="font-display font-semibold text-foreground text-[13px] tracking-tight">SUPERNOVA</div>
          <div className="text-[9px] text-muted-foreground tracking-[0.18em] uppercase font-medium mt-0.5">DR Intelligence</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-1 space-y-px overflow-y-auto">
        {navItems.map((item) => {
          const isActive = activePage === item.label;
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              onClick={() => onNavigate(item.label)}
              className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg transition-colors text-left ${
                isActive
                  ? "sidebar-active"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              }`}
            >
              <Icon className={`w-[15px] h-[15px] ${isActive ? "text-foreground" : ""}`} strokeWidth={1.6} />
              <span className="text-[13px] font-medium tracking-tight">{item.label}</span>
            </button>
          );
        })}

        {isAdmin && (
          <button
            onClick={() => onNavigate("Admin")}
            className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg transition-colors text-left mt-1 ${
              activePage === "Admin" ? "sidebar-active" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            }`}
          >
            <Shield className="w-[15px] h-[15px]" strokeWidth={1.6} />
            <span className="text-[13px] font-medium tracking-tight">Admin</span>
          </button>
        )}

        {/* SUPERNOVA BRAIN — hairline minimal */}
        <button
          onClick={() => onNavigate("Proyectos")}
          className="w-full mt-6 mx-0 px-3 py-3 rounded-lg border border-border hover:border-foreground/20 hover:bg-secondary/40 transition-colors text-left group"
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Brain className="w-[14px] h-[14px] text-muted-foreground group-hover:text-primary transition-colors" strokeWidth={1.6} />
              <span className="font-display font-semibold text-[11px] text-foreground tracking-tight">SUPERNOVA BRAIN</span>
            </div>
            {projects.length > 0 && <span className="text-[10px] tabular-nums text-muted-foreground">{projects.length}</span>}
          </div>
          <div className="text-[10px] text-muted-foreground/80 tracking-tight">6 pilares · motor DR</div>
        </button>
      </nav>

      {/* User section */}
      <div className="px-3 pb-4 pt-3 border-t border-border/60">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center text-[12px] font-semibold flex-shrink-0 text-foreground">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-foreground truncate leading-tight">{displayName}</div>
            <div className="text-[10px] text-muted-foreground truncate leading-tight">{user?.email}</div>
          </div>
          <button onClick={handleSignOut} className="text-muted-foreground hover:text-foreground transition-colors p-1" title="Cerrar sesión">
            <LogOut className="w-[14px] h-[14px]" strokeWidth={1.6} />
          </button>
        </div>
      </div>
    </aside>
  );
}
