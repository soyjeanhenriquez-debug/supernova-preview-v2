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
      // Check admin first
      const { data: role } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (cancelled) return;
      if (role) { setStatus("allowed"); return; }

      // Check approved_emails via RPC (security definer; works without admin)
      const email = (user.email || "").toLowerCase().trim();
      const { data: approved } = await supabase.rpc("is_email_approved", { p_email: email });
      if (cancelled) return;
      if (approved === true) {
        setStatus("allowed");
        // touch last_access (policy allows self update by email match)
        supabase
          .from("approved_emails")
          .update({ last_access: new Date().toISOString() })
          .eq("email", email)
          .then(() => {});
      } else {
        setStatus("pending");
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  return status;
}
