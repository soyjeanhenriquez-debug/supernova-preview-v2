import { LayoutDashboard, Megaphone, Zap, ChevronDown, Trophy, LogOut, Eye, MessageSquare, Sparkles, Bot, FileText, BookOpen } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: Megaphone, label: "Campañas" },
  { icon: Trophy, label: "Anuncios Ganadores" },
  { icon: Eye, label: "Espía" },
  { icon: Sparkles, label: "Generadores" },
  { icon: MessageSquare, label: "Chat IA" },
  { icon: Bot, label: "Agentes" },
  { icon: FileText, label: "Plantillas" },
  { icon: BookOpen, label: "Biblioteca" },
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
    <aside className="flex flex-col w-[260px] min-h-screen border-r border-border bg-card">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="relative flex items-center justify-center w-9 h-9 rounded-xl gradient-brand">
          <Zap className="w-5 h-5 text-primary-foreground" fill="currentColor" />
        </div>
        <div>
          <span className="font-display font-bold text-foreground text-[15px] tracking-tight">META 10X</span>
          <div className="text-[11px] text-muted-foreground tracking-wide">Workflow Tool</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive = activePage === item.label;
          return (
            <button
              key={item.label}
              onClick={() => onNavigate(item.label)}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-all text-left ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <item.icon
                className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? "text-primary" : ""}`}
              />
              <span className="text-[13px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* User section */}
      <div className="px-3 pb-4">
        <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-secondary/50">
          <div className="w-8 h-8 rounded-full gradient-brand flex items-center justify-center text-sm font-bold text-primary-foreground flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-foreground truncate">{displayName}</div>
            <div className="text-[11px] text-muted-foreground truncate">{user?.email}</div>
          </div>
          <button
            onClick={handleSignOut}
            className="text-muted-foreground hover:text-destructive transition-colors p-1"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
