import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Una sola consulta por usuario y sesión: antes la hacían por separado unas 7 pantallas y
// componentes al arrancar (barra lateral, barra superior, ayuda, acceso…). El rol no cambia
// mientras la app está abierta; si cambia, basta con recargar.
const cache = new Map<string, Promise<boolean>>();

export function fetchIsAdmin(userId: string): Promise<boolean> {
  let p = cache.get(userId);
  if (!p) {
    p = Promise.resolve(
      supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
    ).then(({ data, error }) => {
      if (error) cache.delete(userId); // un fallo de red no se queda guardado
      return !error && !!data;
    });
    cache.set(userId, p);
  }
  return p;
}

export function useIsAdmin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user) { setIsAdmin(false); return; }
    fetchIsAdmin(user.id).then((v) => { if (!cancelled) setIsAdmin(v); });
    return () => { cancelled = true; };
  }, [user]);

  return { isAdmin, loading: isAdmin === null };
}
