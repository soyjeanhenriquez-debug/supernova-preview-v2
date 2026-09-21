import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type State = "working" | "done" | "invalid";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Baja a un clic y sin iniciar sesión. Dos orígenes, cada uno con su token y su RPC:
 * ?t=  → correo diario del ganador del día (notification_prefs.unsub_token)
 * ?tl= → correo del popup de salida de /fundador/ (landing_leads.unsub_token)
 */
export default function UnsubscribePage() {
  const [state, setState] = useState<State>("working");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const digestToken = params.get("t") ?? "";
    const leadToken = params.get("tl") ?? "";
    const [token, rpc] = leadToken ? [leadToken, "unsubscribe_lead"] : [digestToken, "unsubscribe_digest"];
    if (!UUID_RE.test(token)) { setState("invalid"); return; }
    supabase.rpc(rpc, { p_token: token })
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
