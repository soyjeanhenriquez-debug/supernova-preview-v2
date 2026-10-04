import { useState } from "react";
import { Home, Search, Plus, UserRound, Briefcase, LayoutGrid, FolderKanban, Coins, KeyRound, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureAccess } from "@/lib/features";
import { openSetPassword } from "@/lib/setPassword";
import { STUDIO_TOOLS, openTool } from "@/lib/tools";

/**
 * Menú inferior del teléfono y la tableta (debajo de lg, donde no hay menú lateral fijo):
 * Inicio · Buscar · Crear · Cuenta. "Crear" y "Cuenta" abren una hoja desde abajo; el menú completo
 * sigue en el botón de menú de la barra superior.
 */
interface Props {
  activePage: string;
  onNavigate: (page: string) => void;
  onSearch: () => void;
}

const ACCOUNT_PAGES = new Set(["Mi negocio", "Productos", "Proyectos", "Créditos"]);

export function MobileBottomNav({ activePage, onNavigate, onSearch }: Props) {
  const [sheet, setSheet] = useState<null | "crear" | "cuenta">(null);
  const { canSee } = useFeatureAccess();
  const { user, signOut } = useAuth();
  const createTools = STUDIO_TOOLS.filter(t => canSee(t.key));
  const createActive = createTools.some(t => t.key === activePage && !t.generator);

  const go = (page: string) => { setSheet(null); onNavigate(page); };

  const Btn = ({ icon: Icon, label, active, onClick }: { icon: typeof Home; label: string; active?: boolean; onClick: () => void }) => (
    <button onClick={onClick} aria-label={label}
      className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>
      <Icon className={`w-[19px] h-[19px] ${active ? "text-primary" : ""}`} strokeWidth={1.7} />
      {label}
    </button>
  );

  return (
    <>
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
        <div className="flex h-[60px]">
          <Btn icon={Home} label="Inicio" active={activePage === "Dashboard"} onClick={() => go("Dashboard")} />
          <Btn icon={Search} label="Buscar" onClick={onSearch} />
          <Btn icon={Plus} label="Crear" active={createActive || sheet === "crear"} onClick={() => setSheet("crear")} />
          <Btn icon={UserRound} label="Cuenta" active={ACCOUNT_PAGES.has(activePage) || sheet === "cuenta"} onClick={() => setSheet("cuenta")} />
        </div>
      </nav>

      <Sheet open={sheet !== null} onOpenChange={(o) => { if (!o) setSheet(null); }}>
        <SheetContent side="bottom" className="rounded-t-2xl border-border bg-card px-4 pt-5 pb-[calc(20px+env(safe-area-inset-bottom))] max-h-[85dvh] overflow-y-auto">
          {sheet === "crear" && (
            <>
              <SheetTitle className="font-display text-[17px] mb-1">¿Qué quieres crear?</SheetTitle>
              <p className="text-[12px] text-muted-foreground mb-4">Elige y entras directo.</p>
              <div className="grid grid-cols-2 gap-2.5">
                {createTools.map(t => {
                  const Icon = t.icon;
                  return (
                    <button key={t.id} onClick={() => { setSheet(null); openTool(t, onNavigate); }} className="text-left rounded-xl border border-border bg-background/40 p-3 flex flex-col gap-2 hover:border-foreground/30">
                      <Icon className="w-[17px] h-[17px] text-foreground" strokeWidth={1.7} />
                      <span className="text-[13px] font-medium leading-snug text-foreground">{t.title}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {sheet === "cuenta" && (
            <>
              <SheetTitle className="font-display text-[17px] mb-1">Cuenta</SheetTitle>
              <p className="text-[12px] text-muted-foreground mb-4 truncate" data-ph-mask>{user?.email}</p>
              <div className="space-y-1">
                {[
                  { icon: Briefcase, label: "Mi ficha", page: "Mi negocio" },
                  { icon: LayoutGrid, label: "Mis productos", page: "Productos" },
                  { icon: FolderKanban, label: "Lo que creaste", page: "Proyectos" },
                  { icon: Coins, label: "Mis créditos", page: "Créditos" },
                ].map(i => (
                  <button key={i.page} onClick={() => go(i.page)} className="w-full flex items-center gap-3 rounded-lg px-3 py-3 text-[14px] text-foreground hover:bg-secondary/60">
                    <i.icon className="w-4 h-4 text-muted-foreground" strokeWidth={1.7} /> {i.label}
                  </button>
                ))}
                <button onClick={() => { setSheet(null); openSetPassword(); }} className="w-full flex items-center gap-3 rounded-lg px-3 py-3 text-[14px] text-foreground hover:bg-secondary/60">
                  <KeyRound className="w-4 h-4 text-muted-foreground" strokeWidth={1.7} /> Cambiar contraseña
                </button>
                <button onClick={async () => { setSheet(null); await signOut(); toast.success("Sesión cerrada"); }} className="w-full flex items-center gap-3 rounded-lg px-3 py-3 text-[14px] text-muted-foreground hover:bg-secondary/60">
                  <LogOut className="w-4 h-4" strokeWidth={1.7} /> Cerrar sesión
                </button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
