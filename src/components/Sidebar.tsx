import { Check, ChevronRight, LayoutDashboard, Trophy, Telescope, FileText, FolderKanban, Coins, Shield, LogOut, PanelLeftClose, PanelLeftOpen, X, KeyRound, UserRound, Video, Quote, Gem, Boxes, Orbit, Store, Briefcase, ClipboardCheck, Calculator, ListTodo, CalendarDays, BarChart3, MessageCircle, Lightbulb, LayoutGrid, BookOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { openSetPassword } from "@/components/SetPasswordDialog";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useNavigate } from "react-router-dom";
import { useFeatureAccess } from "@/lib/features";
import { ProductSwitcher } from "@/components/ProductSwitcher";
import { useJourney } from "@/contexts/JourneyContext";
import { PAGE_STAGE } from "@/lib/journey";

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
  const navigate = useNavigate();
  const { t } = useTranslation();

  // El menú ES el recorrido "Mi negocio": cada herramienta vive en una sola etapa, en orden, para
  // que nadie se pierda ni haga lo mismo en dos sitios. Las secciones en pausa (src/lib/features.ts)
  // solo las ve un admin, al final.
  type NavItem = { icon: typeof Gem; key: string; label: string; hint: string };
  const groups: { title: string; stage?: number; items: NavItem[] }[] = [
    { title: "Mi negocio", items: [
      { icon: LayoutDashboard, key: "Dashboard", label: t("nav.dashboard"), hint: "Tu recorrido de 6 etapas, tu siguiente paso y tus tareas de la semana." },
      { icon: LayoutGrid, key: "Productos", label: "Mis productos", hint: "Todos tus productos y cuánto avanzó cada uno." },
      { icon: Briefcase, key: "Mi negocio", label: "Mi ficha", hint: "Qué vendes, para quién y qué logra este producto. Lo usan todas las herramientas." },
    ] },
    { title: "1 · Elegir", stage: 1, items: [
      { icon: Gem, key: "Ofertas", label: t("nav.offers"), hint: t("nav.hint.offers") },
      { icon: Trophy, key: "Buscar Ofertas Winner", label: t("nav.winners"), hint: t("nav.hint.winners") },
      { icon: Boxes, key: "Mini Apps", label: t("nav.kits"), hint: t("nav.hint.kits") },
    ] },
    { title: "2 · Validar", stage: 2, items: [
      { icon: ClipboardCheck, key: "Validar", label: "Matriz de validación", hint: "Preguntas de sí o no para saber si tu producto y tu mercado tienen lo que hace falta para vender." },
    ] },
    { title: "3 · Precio", stage: 3, items: [
      { icon: Calculator, key: "Precio", label: "Precio y ganancia", hint: "Cuánto te queda de cada venta y cuánto puedes pagar en anuncios sin perder." },
    ] },
    { title: "4 · Construir", stage: 4, items: [
      { icon: BookOpen, key: "Crear producto", label: "Crear producto", hint: "Ebook, curso o reto" },
      { icon: ListTodo, key: "Plan", label: "Plan de lanzamiento", hint: "Tus tareas con fecha para construir y lanzar tu producto en unos 14 días." },
      { icon: FolderKanban, key: "Proyectos", label: t("nav.projects"), hint: t("nav.hint.projects") },
    ].filter(item => canSee(item.key)) }, // "Crear producto" está en piloto (solo admin)
    { title: "5 · Vender", stage: 5, items: [
      { icon: Orbit, key: "Mándala", label: t("nav.mandala"), hint: t("nav.hint.mandala") },
      { icon: UserRound, key: "Sin mostrar tu cara", label: "Vende sin mostrar tu cara", hint: "Un personaje creado con IA cuenta tu oferta en Reels y TikTok. Tú publicas; él da la cara." },
      { icon: Quote, key: "Hooks", label: t("nav.hooks"), hint: t("nav.hint.hooks") },
      { icon: CalendarDays, key: "Contenido", label: "Calendario de contenido", hint: "Ideas con demanda real para publicar sin pagar anuncios, con fecha y estado." },
      { icon: FileText, key: "Generadores", label: t("nav.generators"), hint: t("nav.hint.generators") },
    ] },
    { title: "6 · Medir y recuperar", stage: 6, items: [
      { icon: BarChart3, key: "Resultados", label: "Resultados de anuncios", hint: "Anota gasto, clics y ventas: la app te dice qué apagar y qué escalar." },
      { icon: MessageCircle, key: "Recuperar", label: "Recuperar ventas", hint: "Mensajes de WhatsApp para quien casi compra, listos para enviar día a día." },
    ] },
    { title: "", items: [
      { icon: Coins, key: "Créditos", label: t("nav.credits"), hint: t("nav.hint.credits") },
    ] },
    { title: "Solo admin (en pausa)", items: [
      { icon: Store, key: "Mercado", label: t("nav.mercado"), hint: t("nav.hint.mercado") },
      { icon: Telescope, key: "Oráculo", label: t("nav.oracle"), hint: t("nav.hint.oracle") },
      { icon: Video, key: "Media Studio", label: t("nav.mediaStudio"), hint: t("nav.hint.mediaStudio") },
      { icon: Lightbulb, key: "Crear", label: "Modo Crear", hint: "Buscar problemas que la gente quiere resolver." },
    ].filter(item => canSee(item.key)) },
  ];

  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem(COLLAPSE_KEY) === "1");

  // Menú como camino: etapas hechas con ✓, abiertas la de la pantalla actual y la que toca; las
  // demás plegadas (un clic las abre: nada se esconde). Hasta terminar el tour de bienvenida va todo
  // abierto, porque el tour señala botones de varias etapas.
  const journey = useJourney();
  const [toggled, setToggled] = useState<Record<number, boolean>>({});
  useEffect(() => { setToggled({}); }, [activePage]); // al navegar vuelve a abrir solo lo relevante
  let tourDone = true;
  try { tourDone = localStorage.getItem("supernova:onboarding-v2-done") === "1"; } catch { /* sin almacenamiento: todo abierto */ }
  const isOpen = (stage?: number) => {
    if (!stage || !tourDone || !journey.loaded) return true;
    if (stage in toggled) return toggled[stage];
    return stage === PAGE_STAGE[activePage] || stage === journey.next;
  };
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
        <div className="pb-3"><ProductSwitcher collapsed={isCollapsed} onNavigate={handleNav} /></div>
        {groups.filter(g => g.items.length).map((g, gi) => (
          <div key={g.title || gi} className={gi ? (isCollapsed ? "pt-2 mt-2 border-t border-border/50" : "pt-3") : ""}>
            {g.title && !isCollapsed && (g.stage ? (() => {
              const done = journey.loaded && journey.done[g.stage - 1];
              const now = journey.loaded && journey.next === g.stage;
              const open = isOpen(g.stage);
              return (
                <button onClick={() => setToggled(t => ({ ...t, [g.stage!]: !open }))} aria-expanded={open}
                  className={`w-full px-3 pb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] font-semibold text-left ${now ? "text-primary" : done ? "text-emerald-400/90" : "text-muted-foreground/70"} hover:text-foreground`}>
                  {done ? <Check className="w-3 h-3 shrink-0" /> : <ChevronRight className={`w-3 h-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />}
                  <span className="truncate">{g.title}</span>
                  {now && <span className="ml-auto normal-case tracking-normal text-[10px] font-semibold">ahora</span>}
                </button>
              );
            })() : (
              <p className="px-3 pb-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70 font-semibold">{g.title}</p>
            ))}
            {(isCollapsed || isOpen(g.stage)) && g.items.map((item) => {
          const isActive = activePage === item.key;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              data-tour={`nav-${item.key}`}
              onClick={() => handleNav(item.key)}
              title={isCollapsed ? `${item.label}: ${item.hint}` : item.hint}
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
