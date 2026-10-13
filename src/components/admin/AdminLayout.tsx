import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, KeyRound, Bot, MessageSquare,
  Coins, BarChart3, Settings, ArrowLeft, Shield, Lock,
  ScrollText, Wifi, HeartPulse, Store, TrendingUp, GraduationCap, Gift, Lightbulb, Target } from "lucide-react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useAuth } from "@/contexts/AuthContext";
import { AdminPrivacyProvider, useAdminPrivacy } from "@/lib/adminPrivacy";
import { Eye, EyeOff } from "lucide-react";

/** "Mostrar / Ocultar" nombres y correos en todo el admin (por defecto: mostrar). */
function PeopleToggle() {
  const { hide, setHide } = useAdminPrivacy();
  return (
    <div className="inline-flex rounded-xl border border-border p-1 gap-1 bg-card" role="group" aria-label="Nombres y correos">
      {([[false, "Mostrar", Eye], [true, "Ocultar", EyeOff]] as const).map(([v, label, Icon]) => (
        <button key={label} onClick={() => setHide(v)} aria-pressed={hide === v}
          className={`h-7 px-3 rounded-lg text-[12px] font-medium inline-flex items-center gap-1.5 ${hide === v ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          <Icon className="w-3.5 h-3.5" /> {label}
        </button>
      ))}
    </div>
  );
}
import { HAS_PRUEBA_9_DE_10, PRUEBA_9_DE_10_PATH } from "@/components/admin/pulseMath";

// En español (manual: todo en español para Jean). Primero lo del negocio; después lo técnico.
const items: { to: string; label: string; icon: typeof Users; end?: boolean }[] = [
  { to: "/admin", label: "Resumen", icon: LayoutDashboard, end: true },
  { to: "/admin/negocio", label: "Negocio", icon: TrendingUp },
  // La crea R2-10: el enlace aparece solo cuando su archivo existe.
  ...(HAS_PRUEBA_9_DE_10 ? [{ to: PRUEBA_9_DE_10_PATH, label: "Prueba 9 de 10", icon: Target }] : []),
  { to: "/admin/accesos", label: "Accesos", icon: Lock },
  { to: "/admin/usuarios", label: "Usuarios", icon: Users },
  { to: "/admin/sesiones", label: "Sesiones", icon: Wifi },
  { to: "/admin/audit", label: "Registro de cambios", icon: ScrollText },
  { to: "/admin/salud", label: "Salud del sistema", icon: HeartPulse },
  { to: "/admin/mercado", label: "Mercado", icon: Store },
  { to: "/admin/keywords", label: "Palabras clave y fuentes", icon: KeyRound },
  { to: "/admin/agente", label: "Agente IA", icon: Bot },
  { to: "/admin/mensajes", label: "Mensajes", icon: MessageSquare },
  { to: "/admin/ensenanzas", label: "Enseñanzas", icon: GraduationCap },
  { to: "/admin/aprendizaje", label: "Aprendizaje", icon: Lightbulb },
  { to: "/admin/misiones", label: "Misiones", icon: Gift },
  { to: "/admin/modelos", label: "Modelos y precios", icon: Coins },
  { to: "/admin/analytics", label: "Analítica", icon: BarChart3 },
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
    <AdminPrivacyProvider>
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      {/* Celular: menú en una fila que se desliza (la barra lateral de 240 px no cabe). */}
      <nav className="md:hidden sticky top-0 z-20 flex gap-1 overflow-x-auto px-3 py-2 border-b border-border bg-sidebar">
        <button onClick={() => navigate("/")} aria-label="Volver a la app"
          className="shrink-0 h-8 w-8 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
        </button>
        {items.map(({ to, label, end }) => (
          <NavLink key={to} to={to} end={end}
            className={({ isActive }) => `shrink-0 h-8 px-3 rounded-lg text-[12px] font-medium flex items-center ${isActive ? "sidebar-active" : "text-muted-foreground"}`}>
            {label}
          </NavLink>
        ))}
      </nav>

      <aside className="hidden md:flex flex-col w-[240px] shrink-0 min-h-screen border-r border-border bg-sidebar">
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

      <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto min-w-0">
        <div className="flex items-center justify-end gap-2 mb-4">
          <span className="text-[11px] text-muted-foreground">Nombres y correos</span>
          <PeopleToggle />
        </div>
        <Outlet />
      </main>
    </div>
    </AdminPrivacyProvider>
  );
}
