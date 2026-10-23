import { ArrowRight, Coins } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useProducts } from "@/contexts/ProductContext";
import { useJourney } from "@/contexts/JourneyContext";
import { useCredits } from "@/hooks/useCredits";
import { useFeatureAccess } from "@/lib/features";
import { TREE, branchDone, nextAction, treeHash } from "@/lib/tree";
import { BranchBadge, openLeaf, useBranchStates } from "@/components/tree/TreeNav";
import { track } from "@/lib/analytics";

const STATE_LABEL = { done: "Hecho", now: "Vas aquí", todo: "Después" } as const;

/**
 * Tu norte: qué te toca hoy, en una sola acción. Sale del avance real del producto activo (las
 * mismas reglas que "Tu camino", src/lib/journey.ts): sin cifras inventadas.
 */
export function TuNorte({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { done, loaded } = useJourney();
  const { balance, limit } = useCredits();
  const { isAdmin } = useFeatureAccess();
  const { active } = useProducts();
  const next = nextAction(done);
  const bd = branchDone(done);
  const branch = TREE[next.branch - 1];
  const allDone = bd.every(Boolean);

  return (
    <section className="rounded-2xl border border-border bg-card/40 p-5 space-y-4" aria-label="Tu norte">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-muted-foreground">Tu norte</p>
        <h2 className="mt-1 font-display font-semibold text-[16px] text-foreground leading-snug">
          {allDone ? "Completaste los 4 pasos" : `Paso ${branch.n} de 4 · ${branch.name}`}
        </h2>
        {active?.name && <p className="mt-0.5 text-[12px] text-muted-foreground truncate" data-ph-mask>Para: {active.name}</p>}
      </div>
      <div className="flex gap-1.5" aria-hidden>
        {TREE.map(b => (
          <span key={b.id} className={`h-1 flex-1 rounded-full ${bd[b.n - 1] ? "bg-emerald-500" : b.n === next.branch && !allDone ? "bg-primary" : "bg-secondary"}`} />
        ))}
      </div>
      <div className="rounded-xl bg-secondary/60 px-3.5 py-3">
        <p className="text-[11.5px] text-muted-foreground">Hoy te toca</p>
        <p className="mt-0.5 text-[14px] font-semibold text-foreground leading-snug">{loaded ? next.title : "…"}</p>
        <p className="mt-1 text-[12.5px] text-muted-foreground leading-snug">{next.line}</p>
      </div>
      <button
        onClick={() => { track("home_card_click", { card: `norte:${next.page}`, pestana: "arbol", paso: next.branch }); onNavigate(next.page); }}
        className="btn-primary-nova w-full h-10 rounded-xl text-[13px] font-semibold inline-flex items-center justify-center gap-2"
      >
        {next.cta} <ArrowRight className="w-4 h-4" strokeWidth={2} />
      </button>
      <button onClick={() => onNavigate("Créditos")} className="w-full flex items-center justify-between text-[12px] text-muted-foreground hover:text-foreground">
        <span className="inline-flex items-center gap-1.5"><Coins className="w-3.5 h-3.5" strokeWidth={1.8} /> Créditos</span>
        <span className="tabular-nums">{isAdmin ? "Ilimitado" : `${balance.toLocaleString("de-DE")} de ${limit.toLocaleString("de-DE")}`}</span>
      </button>
    </section>
  );
}

/** Inicio en árbol: las 4 ramas con su estado y sus hojas, y Tu norte al lado (arriba en el teléfono). */
export function TreeHome({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { user } = useAuth();
  const { state } = useBranchStates();
  const { canSee } = useFeatureAccess();
  const firstName = (user?.user_metadata?.display_name || user?.email?.split("@")[0] || "")
    .toString().split(/[\s.@]/)[0].replace(/^./, (c: string) => c.toUpperCase());

  return (
    <div className="max-w-[1400px] mx-auto py-4">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          <header className="max-w-[760px]">
            {firstName && <p className="text-sm text-muted-foreground mb-1" data-ph-mask>Hola, {firstName}</p>}
            <h1 className="font-display font-bold text-[24px] md:text-[30px] leading-[1.15] tracking-[-0.02em] text-foreground">Tu negocio en 4 pasos</h1>
            <p className="mt-2 text-[13px] md:text-[14px] text-muted-foreground">Todo SUPERNOVA en 4 ramas, en el orden en que lo vas a usar. Toca una rama para ver lo que tiene adentro.</p>
          </header>

          <div className="xl:hidden"><TuNorte onNavigate={onNavigate} /></div>

          <div className="grid gap-3 md:grid-cols-2">
            {TREE.map(b => {
              const st = state(b);
              const Icon = b.icon;
              return (
                <div key={b.id} className={`rounded-2xl border bg-card/40 p-5 flex flex-col gap-4 transition-colors ${st === "now" ? "border-primary/50" : "border-border hover:border-foreground/20"}`}>
                  <button onClick={() => { window.location.hash = treeHash(b.id); }} className="flex items-start gap-3 text-left">
                    <BranchBadge n={b.n} state={st} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 font-display font-semibold text-[16.5px] text-foreground leading-tight">
                        {b.name} <Icon className="w-4 h-4 text-muted-foreground" strokeWidth={1.7} />
                      </span>
                      <span className="block mt-0.5 text-[12.5px] text-muted-foreground">{b.q}</span>
                    </span>
                    <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full ${st === "done" ? "bg-emerald-500/15 text-emerald-400" : st === "now" ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
                      {STATE_LABEL[st]}
                    </span>
                  </button>
                  <div className="flex flex-wrap gap-1.5">
                    {b.leaves.filter(l => l.tabs.some(t => canSee(t.page))).map(l => (
                      <button key={l.id} onClick={() => openLeaf(b, l, onNavigate)}
                        className="rounded-full border border-border px-3 py-1.5 text-[12.5px] text-foreground/90 hover:border-foreground/30 hover:text-foreground">
                        {l.name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="hidden xl:block xl:sticky xl:top-4 self-start">
          <TuNorte onNavigate={onNavigate} />
        </aside>
      </div>
    </div>
  );
}
