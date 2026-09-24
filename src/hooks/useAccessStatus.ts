import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type Status = "loading" | "allowed" | "pending";

/**
 * Verifica si el usuario actual tiene acceso aprobado.
 * Admins siempre pasan. Resto debe estar en approved_emails con is_active = true.
 */
export function useAccessStatus(): Status {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let cancelled = false;
    if (!user) { setStatus("loading"); return; }

    (async () => {
      // ¿Acceso vigente? Una sola llamada: has_access() ya deja pasar a los admin, mira el correo
      // de la SESIÓN (no uno que mande el cliente) y respeta las suspensiones. Antes se consultaba
      // primero el rol y después el acceso, uno tras otro, antes de pintar nada.
      const { data: approved } = await supabase.rpc("has_access");
      if (cancelled) return;
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
  }, [user]);

  return status;
}
