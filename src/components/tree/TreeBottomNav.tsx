import { Sun } from "lucide-react";
import { TREE, TREE_PAGE, treeHash, treeSpot, currentTreeGenerator, useLocationHash } from "@/lib/tree";
import { BranchBadge, useBranchStates } from "@/components/tree/TreeNav";

/**
 * Menú del teléfono en árbol (solo admin mientras se prueba): Hoy + las 4 ramas. Cada rama abre su
 * pantalla con sus hojas; la cuenta, los créditos y la ayuda siguen en el menú de arriba (☰).
 */
export function TreeBottomNav({ activePage, onNavigate }: { activePage: string; onNavigate: (page: string) => void }) {
  const hash = useLocationHash();
  const { state } = useBranchStates();
  const spot = treeSpot(activePage, hash, activePage === "Generadores" ? currentTreeGenerator() : null);
  const current = activePage === TREE_PAGE ? hash.split("/")[2] ?? "" : spot?.branch.id ?? "";

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-background/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]" aria-label="Menú principal">
      <div className="flex h-[62px]">
        <button onClick={() => onNavigate("Dashboard")} aria-current={activePage === "Dashboard" ? "page" : undefined}
          className={`flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium ${activePage === "Dashboard" ? "text-foreground" : "text-muted-foreground"}`}>
          <Sun className={`w-[19px] h-[19px] ${activePage === "Dashboard" ? "text-primary" : ""}`} strokeWidth={1.7} />
          Hoy
        </button>
        {TREE.map(b => {
          const on = current === b.id;
          return (
            <button key={b.id} onClick={() => { window.location.hash = treeHash(b.id); }} aria-current={on ? "page" : undefined} aria-label={`Paso ${b.n}: ${b.name}`}
              className={`flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium ${on ? "text-foreground" : "text-muted-foreground"}`}>
              <BranchBadge n={b.n} state={state(b)} size={20} />
              {b.short}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
