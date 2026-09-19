import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type State = "working" | "done" | "invalid";

/**
 * Baja del correo diario, a un clic y sin iniciar sesión: el enlace del correo
 * trae un token aleatorio por usuario (notification_prefs.unsub_token).
 */
export default function UnsubscribePage() {
  const [state, setState] = useState<State>("working");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("t") ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) { setState("invalid"); return; }
    supabase.rpc("unsubscribe_digest", { p_token: token })
      .then(({ data, error }) => setState(!error && data === true ? "done" : "invalid"));
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 text-center">
      <div className="max-w-md space-y-4">
        <p className="text-xs uppercase tracking-[0.3em] text-primary font-semibold">Supernova</p>
        {state === "working" && <p className="text-sm text-muted-foreground">Procesando tu baja…</p>}
        {state === "done" && (
          <>
            <h1 className="font-display text-2xl font-bold">Listo, ya no recibirás estos correos</h1>
            <p className="text-sm text-muted-foreground">
              Desactivamos el ganador del día y los recordatorios de racha. Tu cuenta y tus créditos siguen igual.
            </p>
          </>
        )}
        {state === "invalid" && (
          <>
            <h1 className="font-display text-2xl font-bold">Este enlace ya no es válido</h1>
            <p className="text-sm text-muted-foreground">
              Abre el enlace desde el correo más reciente. Si sigues recibiendo mensajes, escríbenos y te damos de baja a mano.
            </p>
          </>
        )}
        <a href="/" className="inline-block text-sm text-primary hover:underline">Ir a SUPERNOVA</a>
      </div>
    </div>
  );
}
