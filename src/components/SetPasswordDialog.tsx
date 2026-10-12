import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { clearNewPasswordOffer } from "@/lib/setPassword";
import { authErrorMessage } from "@/lib/authErrors";

const MIN = 8;

/**
 * "Crea tu contraseña nueva": se abre sola después de entrar con un código por correo (el camino
 * de "¿la olvidaste?") y desde el menú (llave junto a "Salir"). La cambia el propio usuario con su
 * sesión (supabase.auth.updateUser); nadie más ve la contraseña.
 */
/** Se monta ya abierta (la carga SetPasswordGate en App.tsx solo cuando hace falta). */
export default function SetPasswordDialog({ onClose }: { onClose: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const close = () => { clearNewPasswordOffer(); onClose(); };
  // Tocar fuera (o Esc) cierra solo si no ha escrito nada: antes un toque de más en el celular
  // borraba lo escrito y ya no se volvía a ofrecer.
  const dirty = pw.length > 0 || pw2.length > 0;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saving]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < MIN) { setErr(`Usa al menos ${MIN} caracteres.`); return; }
    if (pw !== pw2) { setErr("Las dos contraseñas no son iguales. Escríbelas de nuevo."); return; }
    setSaving(true); setErr("");
    const { error } = await supabase.auth.updateUser({ password: pw });
    setSaving(false);
    if (error) { setErr(authErrorMessage(error, "password")); return; }
    toast.success("Contraseña guardada. La próxima vez entra con tu correo y esta contraseña.");
    close();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => { if (!dirty && !saving) close(); }}>
      <form onSubmit={save} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="setpw-title"
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 space-y-4 animate-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-3">
          <span className="w-10 h-10 rounded-xl bg-primary/15 text-primary grid place-items-center"><KeyRound className="w-5 h-5" /></span>
          <button type="button" onClick={close} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div>
          <h2 id="setpw-title" className="font-display text-xl font-semibold text-foreground">Crea tu contraseña nueva</h2>
          <p className="text-sm text-muted-foreground mt-1">Así la próxima vez entras con tu correo y esta contraseña, sin esperar un código por correo. Usa al menos {MIN} caracteres.</p>
        </div>
        <div className="space-y-2.5">
          <div className="relative">
            <input type={show ? "text" : "password"} autoComplete="new-password" aria-label="Contraseña nueva" placeholder={`Contraseña nueva (mínimo ${MIN})`} value={pw} autoFocus
              onChange={e => { setPw(e.target.value); setErr(""); }}
              className="w-full bg-secondary border border-border rounded-lg px-4 pr-10 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
            <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <input type={show ? "text" : "password"} autoComplete="new-password" aria-label="Repite la contraseña" placeholder="Repítela" value={pw2}
            onChange={e => { setPw2(e.target.value); setErr(""); }}
            className="w-full bg-secondary border border-border rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
          {err && <p className="text-[13px] text-destructive" role="alert">{err}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <button type="submit" disabled={saving} className="h-11 rounded-xl btn-primary-nova text-sm inline-flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Guardar contraseña
          </button>
          <button type="button" onClick={close} className="h-9 text-[13px] text-muted-foreground hover:text-foreground">Ahora no (puedes crearla luego desde la llave del menú)</button>
        </div>
      </form>
    </div>
  );
}
