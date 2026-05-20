import { useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAccessStatus } from "@/hooks/useAccessStatus";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import PendingAccessPage from "@/pages/PendingAccessPage";
import { ShieldAlert, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props { children: ReactNode }

export function RequireAccess({ children }: Props) {
  const { user } = useAuth();
  const access = useAccessStatus();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const [maintenance, setMaintenance] = useState<boolean | null>(null);
  const [suspended, setSuspended] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user) return;

    // Chequear maintenance_mode
    supabase.from("system_config")
      .select("value")
      .eq("key", "maintenance_mode")
      .maybeSingle()
      .then(({ data }) => { if (!cancelled) setMaintenance(data?.value === "true"); });

    // Chequear suspended via RPC
    supabase.rpc("is_suspended").then(({ data }) => {
      if (!cancelled) setSuspended(!!data);
    });

    // Upsert active_sessions (background, best-effort)
    supabase.from("active_sessions").upsert({
      user_id: user.id,
      user_email: user.email,
      user_agent: navigator.userAgent.slice(0, 200),
      last_seen: new Date().toISOString(),
    }, { onConflict: "user_id" }).then(() => {});

    const iv = window.setInterval(() => {
      supabase.from("active_sessions").upsert({
        user_id: user.id,
        user_email: user.email,
        last_seen: new Date().toISOString(),
      }, { onConflict: "user_id" }).then(() => {});
    }, 60_000);

    return () => { cancelled = true; window.clearInterval(iv); };
  }, [user]);

  if (access === "loading" || adminLoading || maintenance === null || suspended === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (suspended) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <ShieldAlert className="w-12 h-12 mx-auto text-destructive" strokeWidth={1.4} />
          <h1 className="font-display text-2xl">Cuenta suspendida</h1>
          <p className="text-sm text-muted-foreground">
            Tu cuenta ha sido suspendida por un administrador. Si crees que es un error, contacta a soporte.
          </p>
          <Button variant="outline" onClick={() => supabase.auth.signOut()}>Cerrar sesión</Button>
        </div>
      </div>
    );
  }

  if (maintenance && !isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <Wrench className="w-12 h-12 mx-auto text-primary" strokeWidth={1.4} />
          <h1 className="font-display text-2xl">Mantenimiento</h1>
          <p className="text-sm text-muted-foreground">
            SUPERNOVA está en mantenimiento. Volvemos pronto.
          </p>
        </div>
      </div>
    );
  }

  if (access === "pending" && !isAdmin) return <PendingAccessPage />;

  return <>{children}</>;
}
