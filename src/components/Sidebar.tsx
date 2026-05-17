import { LayoutDashboard, Trophy, Bot, MessageSquare, FileText, FolderKanban, Coins, Shield, LogOut, Zap, Brain, Sparkles, Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useProjects } from "@/hooks/useProjects";

interface SidebarProps {
  activePage: string;
  onNavigate: (page: string) => void;
}

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", emoji: "⚡" },
  { icon: Trophy, label: "Anuncios Ganadores", emoji: "🏆" },
  { icon: Bot, label: "Agentes DR", emoji: "🤖" },
  { icon: MessageSquare, label: "Chat IA", emoji: "💬" },
  { icon: FileText, label: "Generadores", emoji: "📋" },
  { icon: FolderKanban, label: "Proyectos", emoji: "🗂️" },
  { icon: Coins, label: "Créditos", emoji: "💰" },
];

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const { user, signOut } = useAuth();
  const { projects } = useProjects();

  const handleSignOut = async () => { await signOut(); toast.success("Sesión cerrada"); };
  const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Usuario";
  const initials = displayName.charAt(0).toUpperCase();
  const isAdmin = user?.email === "demo@supernova.test" || user?.user_metadata?.role === "admin";

  const sofisticarCount = projects.filter((p) => p.mode === "sofisticar").length;
  const crearCount = projects.filter((p) => p.mode === "crear").length;

  return (
    <aside className="flex flex-col w-[260px] min-h-screen border-r border-border bg-sidebar">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="relative flex items-center justify-center w-10 h-10">
          <img src="/supernova-icon.png" alt="SUPERNOVA" className="w-10 h-10" />
        </div>
        <div>
          <span className="font-display font-extrabold text-foreground text-[16px] tracking-tight">SUPERNOVA</span>
          <div className="text-[10px] text-primary tracking-[0.15em] uppercase font-bold">DR Intelligence</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = activePage === item.label;
          return (
            <button
              key={item.label}
              onClick={() => onNavigate(item.label)}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-all text-left ${
                isActive ? "sidebar-active font-semibold" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <span className="text-base w-5 text-center">{item.emoji}</span>
              <span className="text-[13px] font-medium">{item.label}</span>
            </button>
          );
        })}

        {isAdmin && (
          <button
            onClick={() => onNavigate("Admin")}
            className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-all text-left mt-2 ${
              activePage === "Admin" ? "sidebar-active font-semibold" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-[13px] font-medium">Admin</span>
          </button>
        )}

        {/* SUPERNOVA BRAIN block */}
        <div className="mt-4 mx-1 rounded-xl border border-primary/20 bg-gradient-to-b from-primary/10 to-transparent p-3">
          <button
            onClick={() => onNavigate("Proyectos")}
            className="w-full text-left"
          >
            <div className="flex items-center gap-2 mb-1">
              <Brain className="w-4 h-4 text-primary" />
              <span className="font-display font-bold text-[12px] text-foreground tracking-wide">SUPERNOVA BRAIN</span>
              {projects.length > 0 && <span className="activity-dot ml-auto" title="Proyectos activos" />}
            </div>
            <div className="text-[10px] text-primary/80 mb-2 tracking-widest">— 6 PILARES —</div>
            <div className="text-[10px] text-muted-foreground mb-3">Motor de inteligencia DR</div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-primary" /> Sofisticar
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-primary/20 text-primary font-bold text-[10px]">{sofisticarCount}</span>
              </div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Plus className="w-3 h-3 text-primary" /> Crear
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-primary/20 text-primary font-bold text-[10px]">{crearCount}</span>
              </div>
            </div>
          </button>
        </div>
      </nav>

      {/* User section */}
      <div className="px-3 pb-4 pt-2 border-t border-border/50 mt-2">
        <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-secondary/50">
          <div className="w-8 h-8 rounded-full btn-primary-nova flex items-center justify-center text-sm font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-foreground truncate">{displayName}</div>
            <div className="text-[11px] text-muted-foreground truncate">{user?.email}</div>
          </div>
          <button onClick={handleSignOut} className="text-muted-foreground hover:text-destructive transition-colors p-1" title="Cerrar sesión">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
