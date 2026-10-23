import { ChevronRight } from "lucide-react";
import { useFeatureAccess } from "@/lib/features";
import { openTreeTab, treeHash, treeSpot, currentTreeGenerator, useLocationHash } from "@/lib/tree";

/**
 * Encima de cada pantalla que vive en el árbol: dónde estás (Hoy › Paso › Hoja) y las otras pestañas
 * de esa hoja (p. ej. en Ofertas: Ofertas · Mini Apps). Así la persona nunca se pierde y lo que antes
 * eran herramientas sueltas se ve junto, sin tocar sus pantallas.
 */
export function TreeTabsBar({ page, onNavigate }: { page: string; onNavigate: (page: string) => void }) {
  const hash = useLocationHash();
  const { canSee } = useFeatureAccess();
  const generator = page === "Generadores" ? currentTreeGenerator() : null;
  const spot = treeSpot(page, hash, generator);
  if (!spot) return null;
  const { branch, leaf, door } = spot;
  const tabs = (door ? door.tabs : leaf.tabs).filter(t => canSee(t.page));

  return (
    <div className="max-w-[1280px] mx-auto mb-5 space-y-2.5">
      <nav aria-label="Dónde estás" className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground">
        <button onClick={() => onNavigate("Dashboard")} className="hover:text-foreground">Hoy</button>
        <ChevronRight className="w-3 h-3" />
        <button onClick={() => { window.location.hash = treeHash(branch.id); }} className="hover:text-foreground">Paso {branch.n} · {branch.name}</button>
        <ChevronRight className="w-3 h-3" />
        {leaf.doors
          ? <button onClick={() => { window.location.hash = treeHash(branch.id, leaf.id); }} className="hover:text-foreground">{leaf.name}{door ? ` · ${door.name}` : ""}</button>
          : <span className="text-foreground">{leaf.name}</span>}
      </nav>
      {tabs.length > 1 && (
        <div role="tablist" aria-label={leaf.name} className="flex gap-1 rounded-xl bg-secondary/60 p-1 w-full sm:w-fit max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map(t => {
            const on = t === spot.tab;
            return (
              <button key={t.label} role="tab" aria-selected={on} onClick={() => !on && openTreeTab(t, onNavigate)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] font-semibold ${on ? "bg-card text-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}>
                {t.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
