import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useSubRoute } from "@/lib/useSubRoute";
import { useFeatureAccess } from "@/lib/features";
import { useAuth } from "@/contexts/AuthContext";
import { isGenjutsuOwner } from "@/lib/genjutsuOwner";
import { TREE, TREE_SLUG, branchById, leafById, openTreeTab, treeHash, type TreeBranch, type TreeLeaf } from "@/lib/tree";
import { BranchBadge, openLeaf, useBranchStates } from "@/components/tree/TreeNav";

const DOOR_KEY = "supernova:tree-video-door";

/** Migas del árbol: Hoy › Paso N › Hoja. */
export function TreeCrumbs({ branch, leaf, onNavigate }: { branch: TreeBranch; leaf?: TreeLeaf; onNavigate: (page: string) => void }) {
  return (
    <nav aria-label="Dónde estás" className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground">
      <button onClick={() => onNavigate("Dashboard")} className="hover:text-foreground">Hoy</button>
      <ChevronRight className="w-3 h-3" />
      {leaf ? <button onClick={() => { window.location.hash = treeHash(branch.id); }} className="hover:text-foreground">Paso {branch.n} · {branch.name}</button>
        : <span className="text-foreground">Paso {branch.n} · {branch.name}</span>}
      {leaf && <><ChevronRight className="w-3 h-3" /><span className="text-foreground">{leaf.name}</span></>}
    </nav>
  );
}

/** Pantalla de una rama (#/paso/<rama>) o de una hoja con puertas (#/paso/crear/video). */
export function TreePage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { segs } = useSubRoute(TREE_SLUG);
  const { canSee } = useFeatureAccess();
  const { user } = useAuth();
  const jean = isGenjutsuOwner(user?.id);
  const { state } = useBranchStates();
  const branch = branchById(segs[0] ?? "") ?? TREE[0];
  const found = segs[1] ? leafById(segs[1]) : null;
  const leaf = found && found.branch.id === branch.id ? found.leaf : null;
  const [door, setDoor] = useState<string>(() => { try { return localStorage.getItem(DOOR_KEY) ?? ""; } catch { return ""; } });

  if (leaf?.doors) {
    const current = leaf.doors.find(d => d.id === door) ?? leaf.doors[0];
    const pick = (id: string) => { setDoor(id); try { localStorage.setItem(DOOR_KEY, id); } catch { /* sin almacenamiento */ } };
    return (
      <div className="max-w-5xl mx-auto space-y-5">
        <TreeCrumbs branch={branch} leaf={leaf} onNavigate={onNavigate} />
        <header>
          <h1 className="font-display font-bold text-[24px] md:text-[28px] text-foreground tracking-[-0.02em]">{leaf.name}</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">{leaf.desc}</p>
        </header>
        <div role="tablist" aria-label="Tipo de video" className="flex gap-1 rounded-xl bg-secondary/60 p-1 w-full sm:w-fit overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {leaf.doors.map(d => (
            <button key={d.id} role="tab" aria-selected={d.id === current.id} onClick={() => pick(d.id)}
              className={`flex-1 sm:flex-none whitespace-nowrap rounded-lg px-4 py-2 text-[13px] font-semibold ${d.id === current.id ? "bg-card text-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}>
              {d.name}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {current.tabs.filter(t => canSee(t.page) && (!t.owner || jean)).map(t => (
            <button key={t.label} onClick={() => openTreeTab(t, onNavigate)} disabled={t.soon} aria-disabled={t.soon}
              className={`group text-left rounded-2xl border border-border bg-card/40 p-5 transition-colors ${t.soon ? "opacity-55 cursor-default" : "hover:border-primary/50"}`}>
              <span className="flex items-center gap-2 font-display font-semibold text-[16px] text-foreground">
                {t.label}
                {t.owner && <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-sans font-medium">solo tú</span>}
                {t.soon
                  ? <span className="ml-auto rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-sans font-medium">Pronto</span>
                  : <ChevronRight className="ml-auto w-4 h-4 text-muted-foreground group-hover:text-foreground" />}
              </span>
              {t.desc && <span className="mt-1.5 block text-[13px] text-muted-foreground">{t.desc}</span>}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const st = state(branch);
  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <TreeCrumbs branch={branch} onNavigate={onNavigate} />
      <header className="flex items-start gap-3">
        <BranchBadge n={branch.n} state={st} size={32} />
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-muted-foreground">Paso {branch.n} de 4</p>
          <h1 className="font-display font-bold text-[24px] md:text-[28px] text-foreground tracking-[-0.02em] leading-tight">{branch.name}</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">{branch.q}</p>
        </div>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        {branch.leaves.map(l => {
          const tabs = l.tabs.filter(t => canSee(t.page));
          if (!tabs.length) return null;
          const inside = l.doors ? l.doors.map(d => d.name) : tabs.map(t => t.label);
          return (
            <button key={l.id} onClick={() => openLeaf(branch, l, onNavigate)}
              className="group text-left rounded-2xl border border-border bg-card/40 p-5 hover:border-primary/50 transition-colors flex flex-col gap-2">
              <span className="flex items-center gap-2">
                <span className="font-display font-semibold text-[16.5px] text-foreground">{l.name}</span>
                {l.free && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">Gratis</span>}
                <ChevronRight className="ml-auto w-4 h-4 text-muted-foreground group-hover:text-foreground" />
              </span>
              <span className="text-[13px] text-muted-foreground">{l.desc}</span>
              {inside.length > 1 && <span className="text-[12px] text-muted-foreground/80">Adentro: {inside.join(" · ")}</span>}
            </button>
          );
        })}
      </div>
      {branch.n < 4 && (
        <button onClick={() => { window.location.hash = treeHash(TREE[branch.n].id); }} className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
          Siguiente: Paso {branch.n + 1} · {TREE[branch.n].name} <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
