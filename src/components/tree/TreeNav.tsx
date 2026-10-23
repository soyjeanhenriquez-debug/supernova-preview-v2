import { useState } from "react";
import { Sun, Coins, GraduationCap, BadgeDollarSign, Check, ChevronRight, Undo2 } from "lucide-react";
import { useJourney } from "@/contexts/JourneyContext";
import { useFeatureAccess } from "@/lib/features";
import {
  TREE, TREE_PAGE, branchDone, nextAction, openTreeTab, treeHash, treeSpot, currentTreeGenerator, useTreeMenu, useLocationHash,
  type TreeBranch, type TreeLeaf,
} from "@/lib/tree";

/**
 * Menú lateral en árbol (solo admin mientras se prueba): Hoy + las 4 ramas numeradas. La rama donde
 * estás (o la que te toca) se ve abierta con sus hojas; las demás se abren con un toque.
 */
export function BranchBadge({ n, state, size = 22 }: { n: number; state: "done" | "now" | "todo"; size?: number }) {
  const cls = state === "done" ? "bg-emerald-500/15 text-emerald-400" : state === "now" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground";
  return (
    <span className={`rounded-full grid place-items-center text-[11px] font-bold shrink-0 ${cls}`} style={{ width: size, height: size }} aria-hidden>
      {state === "done" ? <Check className="w-3 h-3" strokeWidth={3} /> : n}
    </span>
  );
}

export function useBranchStates() {
  const { done, loaded } = useJourney();
  const bd = branchDone(done);
  const nowN = nextAction(done).branch;
  const state = (b: TreeBranch): "done" | "now" | "todo" => (bd[b.n - 1] ? "done" : b.n === nowN ? "now" : "todo");
  return { state, loaded, nowN };
}

export function openLeaf(branch: TreeBranch, leaf: TreeLeaf, onNavigate: (page: string) => void) {
  if (leaf.doors) { window.location.hash = treeHash(branch.id, leaf.id); return; }
  openTreeTab(leaf.tabs[0], onNavigate);
}

export function TreeNav({ activePage, onNavigate, collapsed }: { activePage: string; onNavigate: (page: string) => void; collapsed: boolean }) {
  const { canSee } = useFeatureAccess();
  const { setTree } = useTreeMenu();
  const { state, nowN } = useBranchStates();
  const hash = useLocationHash();
  const spot = treeSpot(activePage, hash, activePage === "Generadores" ? currentTreeGenerator() : null);
  const onPaso = activePage === TREE_PAGE ? hash.split("/")[2] ?? "" : "";
  const currentBranch = spot?.branch.id ?? onPaso;
  const [open, setOpen] = useState<string | null>(null);
  const openId = open ?? (currentBranch || TREE.find(b => b.n === nowN)?.id || null);

  const row = (active: boolean) =>
    `flex items-center gap-3 w-full rounded-lg transition-colors text-left ${collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2"} ${active ? "sidebar-active" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"}`;

  return (
    <div className="space-y-px">
      <button onClick={() => onNavigate("Dashboard")} className={row(activePage === "Dashboard")} title="Tu norte: qué te toca hoy" aria-current={activePage === "Dashboard" ? "page" : undefined}>
        <Sun className="w-[15px] h-[15px] shrink-0" strokeWidth={1.6} />
        {!collapsed && <span className="text-[13px] font-medium tracking-tight">Hoy · tu norte</span>}
      </button>

      {!collapsed && <p className="px-3 pt-4 pb-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70 font-semibold">Tu negocio en 4 pasos</p>}
      {TREE.map(b => {
        const st = state(b);
        const expanded = !collapsed && openId === b.id;
        const branchActive = activePage === TREE_PAGE && onPaso === b.id && !hash.split("/")[3];
        return (
          <div key={b.id}>
            <button
              onClick={() => { setOpen(b.id); window.location.hash = treeHash(b.id); }}
              className={row(branchActive)} title={`${b.n}. ${b.name}: ${b.q}`} aria-expanded={collapsed ? undefined : expanded}
            >
              <BranchBadge n={b.n} state={st} />
              {!collapsed && <span className="text-[13px] font-medium tracking-tight truncate">{b.name}</span>}
              {!collapsed && (
                <span role="button" tabIndex={-1} aria-label={expanded ? "Plegar" : "Desplegar"}
                  onClick={e => { e.stopPropagation(); setOpen(expanded ? "" : b.id); }}
                  className="ml-auto p-0.5 text-muted-foreground/70 hover:text-foreground">
                  <ChevronRight className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} strokeWidth={1.8} />
                </span>
              )}
            </button>
            {expanded && (
              <div className="pb-1">
                {b.leaves.filter(l => l.tabs.some(t => canSee(t.page))).map(l => {
                  const active = spot?.leaf.id === l.id || (activePage === TREE_PAGE && hash.split("/")[3] === l.id);
                  return (
                    <button key={l.id} onClick={() => openLeaf(b, l, onNavigate)} aria-current={active ? "page" : undefined}
                      className={`block w-full text-left rounded-lg pl-[46px] pr-3 py-1.5 text-[12.5px] transition-colors ${active ? "text-foreground bg-secondary/70" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"}`}>
                      {l.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div className={collapsed ? "pt-2 mt-2 border-t border-border/50" : "pt-3 mt-2 border-t border-border/50"}>
        <button onClick={() => onNavigate("Créditos")} className={row(activePage === "Créditos")} title="Créditos">
          <Coins className="w-[15px] h-[15px] shrink-0" strokeWidth={1.6} />{!collapsed && <span className="text-[13px] font-medium">Créditos</span>}
        </button>
        <button onClick={() => onNavigate("Aprende")} className={row(activePage === "Aprende")} title="Ayuda y guías">
          <GraduationCap className="w-[15px] h-[15px] shrink-0" strokeWidth={1.6} />{!collapsed && <span className="text-[13px] font-medium">Ayuda y guías</span>}
        </button>
        {canSee("Recompensas") && (
          <button onClick={() => onNavigate("Recompensas")} className={row(activePage === "Recompensas")} title="Gana con tu contenido">
            <BadgeDollarSign className="w-[15px] h-[15px] shrink-0" strokeWidth={1.6} />{!collapsed && <span className="text-[13px] font-medium">Gana con tu contenido</span>}
          </button>
        )}
        {!collapsed && (
          <button onClick={() => setTree(false)} className="flex items-center gap-2 w-full px-3 py-2 text-[11.5px] text-muted-foreground/80 hover:text-foreground" title="Solo lo ves tú (admin)">
            <Undo2 className="w-3.5 h-3.5" strokeWidth={1.7} /> Ver menú anterior (admin)
          </button>
        )}
      </div>
    </div>
  );
}
