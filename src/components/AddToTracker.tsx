import { useState } from "react";
import { Check, ListChecks, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useOptionalProducts } from "@/contexts/ProductContext";
import { KINDS, addToTracker, type Kind } from "@/lib/contentTracker";

/**
 * "Agregar a mi tracker": lleva lo que se acaba de crear a Contenido, con sus redes listas para
 * marcar al publicar y su palabra clave. Es el puente de la creación a la ejecución. Gratis.
 */
export function AddToTracker({ kind, title, keyword, source, className = "" }: { kind: Kind; title: string; keyword?: string; source: string; className?: string }) {
  const { user } = useAuth();
  const activeId = useOptionalProducts()?.activeId ?? null;
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");

  const add = async () => {
    if (state !== "idle") return;
    if (!user || !activeId) { toast("Elige tu producto primero para guardar tus publicaciones."); return; }
    setState("busy");
    const ok = await addToTracker({ uid: user.id, productId: activeId, kind, title, keyword, source });
    setState(ok ? "done" : "idle");
    if (ok) toast.success("En tu tracker de publicaciones", {
      description: `Márcalo en ${KINDS[kind].line} cuando lo publiques.`,
      action: { label: "Ver", onClick: () => { window.location.hash = "#/contenido"; } },
    });
    else toast.error("No se pudo agregar. Intenta de nuevo.");
  };

  return (
    <button type="button" onClick={() => void add()} disabled={state !== "idle"}
      className={`min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 text-[13px] text-foreground hover:border-foreground/40 disabled:opacity-70 ${className}`}>
      {state === "busy" ? <Loader2 className="w-4 h-4 animate-spin" /> : state === "done" ? <Check className="w-4 h-4 text-emerald-400" /> : <ListChecks className="w-4 h-4" />}
      {state === "done" ? "En tu tracker" : "Agregar a mi tracker"}
    </button>
  );
}
