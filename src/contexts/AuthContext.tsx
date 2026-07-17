import { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let resolved = false;
    const apply = (session: Session | null) => {
      resolved = true;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => apply(session));

    supabase.auth.getSession()
      .then(({ data: { session } }) => apply(session))
      .catch((e) => {
        // Si getSession falla (p. ej. una extensión bloquea la request),
        // no dejamos al usuario colgado: caemos al estado no autenticado.
        console.error("getSession falló:", e);
        setLoading(false);
      });

    // Failsafe: si en 8s nada resolvió (red bloqueada, token corrupto), salimos
    // del spinner infinito y mostramos landing/login en vez de "Cargando…".
    const failsafe = setTimeout(() => {
      if (!resolved) {
        console.warn("Auth: timeout de inicialización, mostrando estado no autenticado.");
        setLoading(false);
      }
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(failsafe);
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
