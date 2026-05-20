import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, KeyRound, Bot, MessageSquare,
  Coins, BarChart3, Settings, ArrowLeft, Shield, Lock,
} from "lucide-react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useAuth } from "@/contexts/AuthContext";

const items = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/admin/accesos", label: "Accesos", icon: Lock },
  { to: "/admin/usuarios", label: "Usuarios", icon: Users },
  { to: "/admin/keywords", label: "Keywords & Fuentes", icon: KeyRound },
  { to: "/admin/agente", label: "Agente IA Admin", icon: Bot },
  { to: "/admin/mensajes", label: "Mensajes", icon: MessageSquare },
  { to: "/admin/creditos", label: "Créditos & Planes", icon: Coins },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/admin/config", label: "Configuración", icon: Settings },
];

export function AdminLayout() {
  const { isAdmin, loading } = useIsAdmin();
  const { user } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Verificando permisos…</div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <Shield className="w-10 h-10 mx-auto text-muted-foreground" strokeWidth={1.4} />
          <h1 className="font-display text-xl">Acceso restringido</h1>
          <p className="text-sm text-muted-foreground">Esta zona solo está disponible para administradores.</p>
          <button onClick={() => navigate("/")} className="text-sm text-primary hover:underline">Volver al inicio</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex flex-col w-[240px] min-h-screen border-r border-border bg-sidebar">
        <div className="px-6 py-7">
          <div className="flex items-center gap-2 text-foreground">
            <Shield className="w-4 h-4 text-primary" strokeWidth={1.8} />
            <div className="font-display font-semibold text-[13px] tracking-tight">ADMIN</div>
          </div>
          <div className="text-[9px] text-muted-foreground tracking-[0.18em] uppercase font-medium mt-1">SUPERNOVA Control</div>
        </div>

        <nav className="flex-1 px-3 space-y-px">
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 w-full px-3 py-2 rounded-lg transition-colors text-left text-[13px] font-medium tracking-tight ${
                  isActive ? "sidebar-active" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                }`
              }
            >
              <Icon className="w-[15px] h-[15px]" strokeWidth={1.6} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <button
          onClick={() => navigate("/")}
          className="m-3 px-3 py-2 rounded-lg border border-border text-[12px] text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors flex items-center gap-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Volver a la app
        </button>
      </aside>

      <main className="flex-1 p-6 lg:p-8 overflow-auto min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
