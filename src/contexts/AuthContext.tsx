import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

/**
 * ¿Es el mismo usuario con los mismos datos? supabase-js avisa "SIGNED_IN" cada vez que la pestaña
 * vuelve a verse (y "TOKEN_REFRESHED" cada hora) con un objeto `user` NUEVO aunque nada cambió.
 * Como casi todas las pantallas cargan sus datos con `[user]`, cada vuelta a la pestaña recargaba
 * todo: productos, acceso, créditos, la ficha… (12-oct-2026: has_access 430 veces/día contra 60
 * aperturas reales). Si el contenido es igual se conserva el mismo objeto y nada se recarga; si
 * cambia algo de verdad (otro usuario, correo, metadatos tras updateUser) sí se reemplaza.
 */
export function sameUser(a: User | null, b: User | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.id !== b.id) return false;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

const signOut = async () => {
  await supabase.auth.signOut();
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let resolved = false;
    const apply = (session: Session | null) => {
      resolved = true;
      // Mismo token: no se toca el estado (evita volver a pintar toda la app al volver a la pestaña).
      setSession(prev => (prev?.access_token === session?.access_token && prev?.user?.id === session?.user?.id ? prev : session));
      setUser(prev => (sameUser(prev, session?.user ?? null) ? prev : session?.user ?? null));
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

  const value = useMemo(() => ({ user, session, loading, signOut }), [user, session, loading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
