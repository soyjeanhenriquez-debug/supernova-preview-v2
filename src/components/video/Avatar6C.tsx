import { useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useCredits, generatorCost } from "@/hooks/useCredits";
import { track } from "@/lib/analytics";
import { AVATAR_6C_EMPTY, AVATAR_6C_GENERATOR, AVATAR_6C_SYSTEM, avatar6cRequest, parse6c, type Avatar6C } from "@/lib/avatarStudio";
import { streamGenerator } from "@/components/video/videoApi";

/**
 * "Crea tu avatar" con el método 6C (24-oct-2026, plantilla "UGC sin producto"). La persona describe en español
 * cómo es su avatar con pocos datos y la IA (generador avatar-6c, lo cobra el servidor) escribe el prompt en inglés
 * listo para la imagen. El prompt queda a la vista y se puede editar antes de crear la foto.
 */
const FIELDS: { k: keyof Omit<Avatar6C, "estilo">; label: string; ph: string }[] = [
  { k: "persona", label: "Cómo es", ph: "Ej.: mujer de unos 25 años, piel morena clara, pelo rizado oscuro en coleta alta" },
  { k: "ropa", label: "Qué lleva", ph: "Ej.: chaqueta de cuero marrón oversize, top blanco, jeans" },
  { k: "lugar", label: "Dónde está", ph: "Ej.: frente a una pared industrial gris oscuro, calle de ciudad" },
  { k: "luz", label: "Luz", ph: "Ej.: luz de día suave con un poco de flash del celular" },
  { k: "accion", label: "Qué hace", ph: "Ej.: habla a cámara con un micrófono inalámbrico pequeño" },
];

export function Avatar6CForm({ onPrompt, disabled }: { onPrompt: (prompt: string) => void; disabled?: boolean }) {
  const { applyServerCharge, balance } = useCredits();
  const [d, setD] = useState<Avatar6C>(AVATAR_6C_EMPTY);
  const [busy, setBusy] = useState(false);
  const cost = generatorCost(AVATAR_6C_GENERATOR);
  const ready = d.persona.trim().length >= 5;

  const write = async () => {
    if (busy || !ready) return;
    if (balance < cost.cost) { toast.error(`Te faltan créditos: escribir el prompt cuesta ${cost.cost}.`); return; }
    setBusy(true);
    try {
      const { text, billing } = await streamGenerator(AVATAR_6C_GENERATOR, "Avatar 6C · prompt", AVATAR_6C_SYSTEM, avatar6cRequest(d));
      applyServerCharge(cost.action, billing, "Avatar 6C · prompt");
      const prompt = parse6c(text);
      if (!prompt) { toast.error("La IA no devolvió un prompt que sirva. Prueba otra vez con más detalle."); return; }
      onPrompt(prompt);
      track("avatar_6c_prompt", { estilo: d.estilo });
      toast.success("Prompt listo. Revísalo y crea tu avatar.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo escribir el prompt."); }
    finally { setBusy(false); }
  };

  const chip = (on: boolean) => `h-9 px-3 rounded-full border text-[12px] transition-colors ${on ? "border-foreground/40 text-foreground bg-card" : "border-border text-muted-foreground hover:text-foreground"}`;
  const field = "w-full h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:border-primary/60";
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setD(x => ({ ...x, estilo: "creador" }))} disabled={disabled || busy} className={chip(d.estilo === "creador")}>Creador real (UGC)</button>
        <button type="button" onClick={() => setD(x => ({ ...x, estilo: "influencer" }))} disabled={disabled || busy} className={chip(d.estilo === "influencer")}>Influencer</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {FIELDS.map(f => (
          <label key={f.k} className={`block space-y-1 ${f.k === "persona" ? "sm:col-span-2" : ""}`}>
            <span className="text-[11px] text-muted-foreground">{f.label}</span>
            <input value={d[f.k]} onChange={e => setD(x => ({ ...x, [f.k]: e.target.value.slice(0, 240) }))} placeholder={f.ph} disabled={disabled || busy} className={field} />
          </label>
        ))}
      </div>
      <button type="button" onClick={() => void write()} disabled={disabled || busy || !ready}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-border text-[12px] text-foreground hover:border-foreground/30 disabled:opacity-50">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />} Escribir el prompt con IA · {cost.cost} créditos
      </button>
      <p className="text-[11px] text-muted-foreground">La persona es nueva, creada con IA: nunca se parece a alguien famoso o real.</p>
    </div>
  );
}
