import { useState } from "react";
import { Sun, Search, Plus, Gem, LayoutGrid, Briefcase, Fingerprint, FolderKanban, Coins, KeyRound, LogOut, BadgeDollarSign, GraduationCap, Menu, ChevronRight, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureAccess } from "@/lib/features";
import { openSetPassword } from "@/lib/setPassword";
import { GRID_TOOLS, VIAS, openTool, useVia } from "@/lib/tools";

/**
 * Menú inferior del teléfono y la tableta (debajo de lg, donde no hay menú lateral fijo).
 * Una sola puerta (decisión de Jean, 12-oct-2026): Hoy · Ofertas (o Ideas, en la vía Creador) · Crear ·
 * Mis versiones · Más. "Crear" muestra lo de su vía (las 2 vías, 12-oct-2026).
 * "Crear" y "Más" abren una hoja desde abajo. En "Más" están el Radar, el buscador, los créditos, la
 * ayuda, la cuenta y, plegadas, todas las demás herramientas: nada se borró.
 */
interface Props {
  activePage: string;
  onNavigate: (page: string) => void;
  onSearch: () => void;
}

const MORE_PAGES = new Set(["Buscar Ofertas Winner", "Mi negocio", "Tu ADN", "Proyectos", "Créditos", "Recompensas", "Aprende"]);

export function MobileBottomNav({ activePage, onNavigate, onSearch }: Props) {
  const [sheet, setSheet] = useState<null | "crear" | "mas">(null);
  const [allOpen, setAllOpen] = useState(false);
  const { canSee } = useFeatureAccess();
  const { user, signOut } = useAuth();
  // Las 2 vías (12-oct-2026): "Crear" muestra lo de su vía; "Más", todo lo demás.
  const { via, setVia, current: viaInfo } = useVia();
  const createTools = viaInfo.create.filter(t => canSee(t.key));
  const moreTools = GRID_TOOLS.filter(t => canSee(t.key) && !viaInfo.create.includes(t));
  // Segundo botón: lo primero que mira su vía (Ofertas o Nichos de YouTube).
  const second = via === "creador" ? { page: "Nichos YouTube", label: "Ideas" } : { page: "Ofertas", label: "Ofertas" };
  const createActive = createTools.some(t => t.key === activePage && !t.generator);
  const moreActive = MORE_PAGES.has(activePage) || moreTools.some(t => t.key === activePage);

  const go = (page: string) => { setSheet(null); onNavigate(page); };

  const Btn = ({ icon: Icon, label, active, onClick }: { icon: typeof Sun; label: string; active?: boolean; onClick: () => void }) => (
    <button onClick={onClick} aria-label={label} aria-current={active ? "page" : undefined}
      className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>
      <Icon className={`w-[19px] h-[19px] ${active ? "text-primary" : ""}`} strokeWidth={1.7} />
      {label}
    </button>
  );

  const Row = ({ icon: Icon, label, onClick, muted }: { icon: typeof Sun; label: string; onClick: () => void; muted?: boolean }) => (
    <button onClick={onClick} className={`w-full flex items-center gap-3 rounded-lg px-3 py-3 text-[14px] hover:bg-secondary/60 ${muted ? "text-muted-foreground" : "text-foreground"}`}>
      <Icon className="w-4 h-4 text-muted-foreground" strokeWidth={1.7} /> {label}
    </button>
  );

  return (
    <>
      {/* z-30: por debajo del menú lateral (z-40 en Index.tsx) y de las hojas, para que al abrirlos
          el menú inferior quede tapado por el velo y no flote encima. */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-background/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]" aria-label="Menú principal">
        <div className="flex h-[60px]">
          <Btn icon={Sun} label="Hoy" active={activePage === "Dashboard"} onClick={() => go("Dashboard")} />
          <Btn icon={Gem} label={second.label} active={activePage === second.page} onClick={() => go(second.page)} />
          <Btn icon={Plus} label="Crear" active={createActive || sheet === "crear"} onClick={() => setSheet("crear")} />
          <Btn icon={LayoutGrid} label="Mis versiones" active={activePage === "Productos"} onClick={() => go("Productos")} />
          <Btn icon={Menu} label="Más" active={moreActive || sheet === "mas"} onClick={() => setSheet("mas")} />
        </div>
      </nav>

      <Sheet open={sheet !== null} onOpenChange={(o) => { if (!o) { setSheet(null); setAllOpen(false); } }}>
        <SheetContent side="bottom" className="rounded-t-2xl border-border bg-card px-4 pt-5 pb-[calc(20px+env(safe-area-inset-bottom))] max-h-[85dvh] overflow-y-auto">
          {sheet === "crear" && (
            <>
              <SheetTitle className="font-display text-[17px] mb-1">¿Qué quieres crear?</SheetTitle>
              <p className="text-[12px] text-muted-foreground mb-4">Para tu versión. Elige y entras directo.</p>
              <div className="grid grid-cols-2 gap-2.5">
                {createTools.map(t => {
                  const Icon = t.icon;
                  return (
                    <button key={t.id} onClick={() => { setSheet(null); openTool(t, onNavigate); }} className="text-left rounded-xl border border-border bg-background/40 p-3 flex flex-col gap-2 hover:border-foreground/30">
                      <Icon className="w-[17px] h-[17px] text-foreground" strokeWidth={1.7} />
                      <span className="text-[13px] font-medium leading-snug text-foreground">{t.nav}</span>
                      {t.cost && <span className="text-[11px] text-muted-foreground tabular-nums">{t.cost}</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {sheet === "mas" && (
            <>
              <SheetTitle className="font-display text-[17px] mb-1">Más</SheetTitle>
              <p className="text-[12px] text-muted-foreground mb-4 truncate" data-ph-mask>{user?.email}</p>
              <div className="mb-4">
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5">Tu vía</p>
                <div className="grid grid-cols-2 gap-1 rounded-xl border border-border p-1" role="group" aria-label="Tu vía">
                  {VIAS.map(v => (
                    <button key={v.id} onClick={() => setVia(v.id)} aria-pressed={via === v.id}
                      className={`h-9 rounded-lg text-[13px] font-medium ${via === v.id ? "bg-secondary text-foreground" : "text-muted-foreground"}`}>{v.label}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Row icon={Trophy} label="Radar de anuncios" onClick={() => go("Buscar Ofertas Winner")} />
                <Row icon={Search} label="Buscar" onClick={() => { setSheet(null); onSearch(); }} />
                <Row icon={Coins} label="Mis créditos" onClick={() => go("Créditos")} />
                <Row icon={GraduationCap} label="Ayuda y guías" onClick={() => go("Aprende")} />
                {[
                  { icon: FolderKanban, label: "Lo que creaste", page: "Proyectos" },
                  { icon: Briefcase, label: "Mi ficha", page: "Mi negocio" },
                  { icon: Fingerprint, label: "Tu ADN", page: "Tu ADN" },
                  { icon: BadgeDollarSign, label: "Gana con tu contenido", page: "Recompensas" },
                ].filter(i => canSee(i.page)).map(i => <Row key={i.page} icon={i.icon} label={i.label} onClick={() => go(i.page)} />)}

                {/* Todo lo demás, plegado: sigue existiendo y el buscador lo encuentra. */}
                <button onClick={() => setAllOpen(o => !o)} aria-expanded={allOpen}
                  className="w-full flex items-center gap-3 rounded-lg px-3 py-3 text-[14px] text-foreground hover:bg-secondary/60">
                  <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${allOpen ? "rotate-90" : ""}`} strokeWidth={1.7} />
                  Más herramientas <span className="ml-auto text-[12px] text-muted-foreground tabular-nums">{moreTools.length}</span>
                </button>
                {allOpen && (
                  <div className="pl-3 space-y-0.5">
                    {moreTools.map(t => (
                      <Row key={t.id} icon={t.icon} label={t.nav} onClick={() => { setSheet(null); setAllOpen(false); openTool(t, onNavigate); }} />
                    ))}
                  </div>
                )}

                <div className="pt-2 mt-2 border-t border-border/60 space-y-1">
                  <Row icon={KeyRound} label="Cambiar contraseña" onClick={() => { setSheet(null); openSetPassword(); }} />
                  <Row icon={LogOut} label="Cerrar sesión" muted onClick={async () => { setSheet(null); await signOut(); toast.success("Sesión cerrada"); }} />
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
