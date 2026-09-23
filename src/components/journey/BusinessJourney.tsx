import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Circle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProjects } from "@/hooks/useProjects";
import { useBusinessProfile, profileReady, type BusinessProfile } from "@/lib/businessProfile";

/**
 * Recorrido "Mi negocio": el Método Negocio Gemelo en 6 etapas, con el producto del usuario en el
 * centro (inspirado en el método de Ladeira: un solo camino, cada paso deja algo concreto).
 * Cada etapa se marca sola cuando hay datos (ficha, precio elegido, mini app guardada, anuncios de
 * la Mándala, números anotados); las que aún no tienen herramienta propia se marcan a mano
 * (business_profile.journey). Siempre muestra UN siguiente paso.
 */
type Action = { label: string; page: string; primary?: boolean };
type Stage = { n: number; key: string; title: string; why: string; done: boolean; progress?: string; manual?: boolean; actions: Action[] };

export function BusinessJourney({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { user } = useAuth();
  const { profile, setProfile, save, loaded } = useBusinessProfile();
  const { projects } = useProjects();
  const [ads, setAds] = useState<{ count: number; measured: boolean } | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("mandala_ads").select("spend,sales,status").limit(300).then(({ data }: { data: { spend: number | null; sales: number | null; status: string }[] | null }) => {
      const list = data ?? [];
      setAds({ count: list.length, measured: list.some(a => a.spend != null || a.sales != null || a.status === "ganador") });
    });
  }, [user]);

  const manual = (k: string) => !!profile.journey?.done?.[k];
  const toggleManual = (k: string) => {
    const done = { ...(profile.journey?.done ?? {}), [k]: !manual(k) };
    const next: BusinessProfile = { ...profile, journey: { ...(profile.journey ?? {}), done } };
    setProfile(next);
    save(next).then(ok => { if (!ok) toast.error("No se pudo guardar"); });
  };

  const hasMiniApp = projects.some(p => {
    const ctx = p.context as { miniapp?: unknown } | undefined;
    return !!ctx?.miniapp;
  });

  const stages: Stage[] = useMemo(() => [
    {
      n: 1, key: "1", title: "Elige qué vas a vender",
      why: "Parte de algo que ya se vende: una de las 300 ofertas ganadoras o una mini app. Después cuéntalo en Mi negocio.",
      done: profileReady(profile),
      actions: [
        { label: "Ver las ofertas ganadoras", page: "Ofertas", primary: true },
        { label: "Ya sé qué vender: contarlo", page: "Mándala" },
      ],
    },
    {
      n: 2, key: "2", title: "Comprueba que se vende",
      why: "Antes de invertir, mira la nota de venta de la oferta y en el Radar si alguien lleva semanas pagando anuncios por algo parecido.",
      done: manual("2"), manual: true,
      actions: [
        { label: "Ver el veredicto de la oferta", page: "Ofertas", primary: true },
        { label: "Buscar en el Radar", page: "Buscar Ofertas Winner" },
      ],
    },
    {
      n: 3, key: "3", title: "Ponle precio y haz los números",
      why: "Cuánto te queda de cada venta y cuánto puedes pagar en anuncios sin perder. Sin esto, cualquier anuncio es una apuesta.",
      done: !!profile.pricing?.chosen,
      actions: [{ label: "Abrir la calculadora", page: "Precio", primary: true }],
    },
    {
      n: 4, key: "4", title: "Crea tu propio producto",
      why: "Hacer mi versión te da el plan, las instrucciones para construir tu mini app con IA sin programar, el guion de venta y tus primeros anuncios.",
      done: hasMiniApp || manual("4"), manual: !hasMiniApp,
      actions: [
        { label: "Hacer mi versión (Mini Apps)", page: "Mini Apps", primary: true },
        { label: "Ver mis proyectos", page: "Proyectos" },
      ],
    },
    {
      n: 5, key: "5", title: "Crea tus primeros 5 anuncios",
      why: "La Mándala te los escribe uno por uno, en el orden que conviene si tienes poco presupuesto.",
      done: (ads?.count ?? 0) >= 5,
      progress: ads ? `${Math.min(ads.count, 5)} de 5` : undefined,
      actions: [{ label: "Ir a la Mándala", page: "Mándala", primary: true }, { label: "Buscar ganchos", page: "Hooks" }],
    },
    {
      n: 6, key: "6", title: "Publica, mide y decide",
      why: "A los 3 días anota gasto, clics y ventas de cada anuncio: la app te dice cuál apagar y cuál subir.",
      done: !!ads?.measured,
      actions: [{ label: "Anotar mis resultados", page: "Mándala", primary: true }],
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [profile, ads, hasMiniApp]);

  if (!loaded) return null;
  const doneCount = stages.filter(s => s.done).length;
  const next = stages.find(s => !s.done);
  const shown = open != null ? stages[open - 1] : next;

  return (
    <section className="card-surface rounded-2xl p-5 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-primary font-semibold">Mi negocio · Método Negocio Gemelo</p>
          <h2 className="font-display font-semibold text-xl text-foreground">
            {profileReady(profile) ? profile.product : "Tu negocio, paso a paso"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {doneCount === 6 ? "Completaste las 6 etapas. Ahora repite con variaciones del anuncio que gana." : `${doneCount} de 6 etapas hechas. Sigue en orden: cada paso usa lo que hiciste en el anterior.`}
          </p>
        </div>
        <div className="h-1.5 w-full sm:w-48 rounded-full bg-secondary overflow-hidden" aria-hidden>
          <div className="h-full gradient-brand transition-all" style={{ width: `${(doneCount / 6) * 100}%` }} />
        </div>
      </div>

      <ol className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {stages.map(s => {
          const isShown = shown?.n === s.n;
          return (
            <li key={s.n}>
              <button onClick={() => setOpen(isShown && open != null ? null : s.n)}
                className={`w-full h-full rounded-xl border p-2.5 text-left transition-colors ${isShown ? "border-primary bg-primary/10" : "border-border hover:border-foreground/20"}`}>
                <span className={`flex items-center gap-1.5 text-[11px] font-semibold ${s.done ? "text-emerald-400" : isShown ? "text-primary" : "text-muted-foreground"}`}>
                  {s.done ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3 h-3" />} Etapa {s.n}
                </span>
                <span className="block text-xs text-foreground mt-1 leading-snug">{s.title}</span>
                {s.progress && !s.done && <span className="block text-[11px] text-muted-foreground mt-0.5">{s.progress}</span>}
              </button>
            </li>
          );
        })}
      </ol>

      {shown && (
        <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{shown === next ? "Tu siguiente paso" : `Etapa ${shown.n}`}{shown.done ? " · hecha ✓" : ""}</p>
            <p className="font-display font-semibold text-foreground text-lg">{shown.title}</p>
            <p className="text-sm text-muted-foreground mt-1">{shown.why}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {shown.actions.map(a => (
              <button key={a.label} onClick={() => onNavigate(a.page)}
                className={a.primary
                  ? "inline-flex items-center gap-2 rounded-lg gradient-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground"
                  : "inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-foreground hover:border-primary/60"}>
                {a.label} {a.primary && <ArrowRight className="w-4 h-4" />}
              </button>
            ))}
            {shown.manual && (
              <button onClick={() => toggleManual(shown.key)} className="text-xs text-muted-foreground hover:text-foreground underline px-1">
                {manual(shown.key) ? "Marcar como pendiente" : "Ya hice esta etapa"}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
