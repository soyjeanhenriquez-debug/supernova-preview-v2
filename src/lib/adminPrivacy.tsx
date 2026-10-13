import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Admin (12-oct-2026, pedido de Jean): el panel muestra nombres y correos completos. Un selector
 * arriba ("Mostrar / Ocultar") los tapa solo cuando Jean lo pide (para grabar pantalla o mostrarlo).
 * La elección se recuerda en este navegador.
 */
const KEY = "supernova:admin-hide-people";
type Ctx = { hide: boolean; setHide: (v: boolean) => void };
const AdminPrivacyContext = createContext<Ctx>({ hide: false, setHide: () => {} });

export function AdminPrivacyProvider({ children }: { children: ReactNode }) {
  const [hide, setHideState] = useState<boolean>(() => {
    try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
  });
  const setHide = useCallback((v: boolean) => {
    setHideState(v);
    try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* sin almacenamiento */ }
  }, []);
  const value = useMemo(() => ({ hide, setHide }), [hide, setHide]);
  return <AdminPrivacyContext.Provider value={value}>{children}</AdminPrivacyContext.Provider>;
}

/** Tapa un correo o un nombre: "yorba19h@gmail.com" → "y•••@•••", "Yorbana" → "Y•••". */
export const maskPerson = (s: string | null | undefined) => {
  if (!s) return "•••";
  const at = s.indexOf("@");
  return at > 0 ? `${s[0]}•••@•••` : `${s[0]}•••`;
};

export function useAdminPrivacy() {
  const { hide, setHide } = useContext(AdminPrivacyContext);
  const who = useCallback((s: string | null | undefined) => (hide ? maskPerson(s) : (s ?? "")), [hide]);
  return { hide, setHide, who };
}

type Person = { email: string; name: string };
const cache = new Map<string, Person>();

/** Nombre y correo de cada id (admin_user_names, solo admin). Devuelve un mapa id → persona. */
export function useAdminNames(ids: string[]) {
  const [, setTick] = useState(0);
  const key = [...new Set(ids.filter(Boolean))].sort().join(",");
  useEffect(() => {
    const missing = key ? key.split(",").filter((id) => !cache.has(id)) : [];
    if (!missing.length) return;
    let alive = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc("admin_user_names", { p_ids: missing }).then(({ data }: { data: { user_id: string; email: string; name: string }[] | null }) => {
      for (const r of data ?? []) cache.set(r.user_id, { email: r.email, name: r.name });
      if (alive) setTick((t) => t + 1);
    });
    return () => { alive = false; };
  }, [key]);
  return useCallback((id: string | null | undefined): Person | null => (id ? cache.get(id) ?? null : null), []);
}
