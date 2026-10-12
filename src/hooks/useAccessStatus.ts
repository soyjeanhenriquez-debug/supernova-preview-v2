import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type Status = "loading" | "allowed" | "pending";

/** Cada cuánto, como mínimo, se vuelve a preguntar al volver a la pestaña sin plan. */
export const RECHECK_MIN_MS = 15_000;

/**
 * Verifica si el usuario actual tiene acceso aprobado.
 * Admins siempre pasan. Resto debe estar en approved_emails con is_active = true.
 * El acceso lo dan SOLO los webhooks de pago de Whop; aquí solo se pregunta al servidor.
 */
export function useAccessStatus(): Status {
  const { user } = useAuth();
  const uid = user?.id;
  const [status, setStatus] = useState<Status>("loading");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!uid) { setStatus("loading"); return; }

    (async () => {
      // ¿Acceso vigente? Una sola llamada: has_access() ya deja pasar a los admin, mira el correo
      // de la SESIÓN (no uno que mande el cliente) y respeta las suspensiones.
      // Si la llamada FALLA (red caída un instante, base reiniciándose) se reintenta hasta 3 veces
      // (1 s, 2 s, 4 s) antes de decidir: un fallo de red no es "sin plan" (11-oct-2026).
      let approved: unknown = null;
      for (let intento = 0; intento < 4; intento++) {
        const { data, error } = await supabase.rpc("has_access");
        if (cancelled) return;
        if (!error) { approved = data; break; }
        if (intento === 3) break;
        await new Promise((r) => setTimeout(r, 1000 * 2 ** intento));
        if (cancelled) return;
      }
      if (approved === true) {
        setStatus("allowed");
        // Marca el último acceso. Va por RPC: el usuario ya no puede escribir su
        // fila de approved_emails (con ese permiso se reactivaba tras cancelar).
        supabase.rpc("touch_last_access").then(() => {});
      } else {
        setStatus("pending");
      }
    })();

    return () => { cancelled = true; };
    // Depende del id, no del objeto: cada renovación de la sesión (cada hora) trae un objeto nuevo
    // y antes repetía la consulta sin motivo.
  }, [uid, nonce]);

  // R2-19 (12-oct-2026): quien está en la vitrina y activa su prueba en Whop vuelve a esta pestaña
  // y seguía viendo candados hasta recargar. Al volver a la pestaña se pregunta otra vez al servidor
  // (como mucho cada 15 s). Solo mientras está sin plan; nunca da acceso por sí mismo.
  useEffect(() => {
    if (status !== "pending" || !uid) return;
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last < RECHECK_MIN_MS) return;
      last = Date.now();
      setNonce((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [status, uid]);

  return status;
}
