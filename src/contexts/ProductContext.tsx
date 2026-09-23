import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Varios productos por usuario (tabla products). Toda la app trabaja sobre el PRODUCTO ACTIVO:
 * la ficha, la matriz, el precio, el plan, los anuncios, el calendario, la recuperación, su plan
 * semanal y lo guardado con "Hacer mi versión" son de ese producto. Cambiar de producto cambia la
 * app entera (las pantallas se vuelven a montar con `productKey`).
 * Límite de productos activos: product_limit() (3 en PRO; más en Comunidad; admin sin límite).
 */
export type ProductSummary = {
  id: string; name: string; status: "activo" | "archivado"; created_at: string;
  product: string | null; who: string | null; business_type: string | null;
  // Estado de sus herramientas, para el panel "Mis productos".
  validation: { completed_at?: string | null; score?: number | null } | null;
  pricing: { chosen?: string | null } | null;
  launch_plan: { tasks?: { done: boolean }[] } | null;
  recovery: { messages?: unknown[] } | null;
};

type Ctx = {
  products: ProductSummary[];
  activeId: string | null;
  active: ProductSummary | null;
  limit: number;
  activeCount: number;
  loaded: boolean;
  /** Cambia en cada cambio de producto: úsalo como `key` para volver a montar pantallas. */
  productKey: string;
  setActive: (id: string) => Promise<void>;
  createProduct: (name: string) => Promise<string>;
  rename: (id: string, name: string) => Promise<void>;
  setStatus: (id: string, status: "activo" | "archivado") => Promise<void>;
  refresh: () => Promise<void>;
};

const ProductContext = createContext<Ctx | null>(null);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabase as any;
const COLS = "id,name,status,created_at,product,who,business_type,validation,pricing,launch_plan,recovery";

/** Mensaje claro cuando se pasa del límite de productos (lo lanza el trigger products_enforce_limit). */
export function productLimitMessage(e: unknown, limit: number) {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  return /LIMITE_PRODUCTOS/.test(msg)
    ? `Tu plan permite ${limit} productos activos. Archiva uno que ya no uses o pásate a Comunidad para tener más.`
    : "No se pudo guardar. Intenta de nuevo.";
}

export function ProductProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [limit, setLimit] = useState(3);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) { setProducts([]); setActiveId(null); setLoaded(false); return; }
    const [{ data: list }, { data: bp }, { data: lim }] = await Promise.all([
      db().from("products").select(COLS).eq("user_id", user.id).order("created_at"),
      db().from("business_profile").select("active_product_id").eq("user_id", user.id).maybeSingle(),
      db().rpc("product_limit", { p_user: user.id }),
    ]);
    let rows = (list ?? []) as ProductSummary[];
    // Primera vez: se crea su primer producto para que toda la app tenga dónde guardar.
    if (rows.length === 0) {
      const { data: created } = await db().from("products").insert({ user_id: user.id, name: "Mi primer producto" }).select(COLS).single();
      if (created) rows = [created as ProductSummary];
    }
    const wanted = bp?.active_product_id as string | undefined;
    const pick = rows.find(p => p.id === wanted && p.status === "activo")
      ?? rows.find(p => p.status === "activo") ?? rows[0] ?? null;
    if (pick && pick.id !== wanted) {
      await db().from("business_profile").upsert({ user_id: user.id, active_product_id: pick.id, updated_at: new Date().toISOString() });
    }
    setProducts(rows);
    setActiveId(pick?.id ?? null);
    if (typeof lim === "number") setLimit(lim);
    setLoaded(true);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const setActive = useCallback(async (id: string) => {
    if (!user) return;
    setActiveId(id);
    await db().from("business_profile").upsert({ user_id: user.id, active_product_id: id, updated_at: new Date().toISOString() });
  }, [user]);

  const createProduct = useCallback(async (name: string) => {
    if (!user) throw new Error("Sin sesión");
    const { data, error } = await db().from("products").insert({ user_id: user.id, name: name.trim().slice(0, 120) || "Nuevo producto" }).select(COLS).single();
    if (error) throw new Error(productLimitMessage(error, limit));
    setProducts(prev => [...prev, data as ProductSummary]);
    await setActive((data as ProductSummary).id);
    return (data as ProductSummary).id;
  }, [user, limit, setActive]);

  const rename = useCallback(async (id: string, name: string) => {
    const clean = name.trim().slice(0, 120);
    if (!clean) return;
    setProducts(prev => prev.map(p => (p.id === id ? { ...p, name: clean } : p)));
    await db().from("products").update({ name: clean }).eq("id", id);
  }, []);

  const setStatus = useCallback(async (id: string, status: "activo" | "archivado") => {
    const { error } = await db().from("products").update({ status }).eq("id", id);
    if (error) throw new Error(productLimitMessage(error, limit));
    setProducts(prev => prev.map(p => (p.id === id ? { ...p, status } : p)));
    // Si se archiva el abierto, se abre otro activo.
    if (status === "archivado" && id === activeId) {
      const other = products.find(p => p.id !== id && p.status === "activo");
      if (other) await setActive(other.id);
    }
  }, [limit, activeId, products, setActive]);

  const value = useMemo<Ctx>(() => ({
    products, activeId, active: products.find(p => p.id === activeId) ?? null,
    limit, activeCount: products.filter(p => p.status === "activo").length, loaded,
    productKey: activeId ?? "none",
    setActive, createProduct, rename, setStatus, refresh: load,
  }), [products, activeId, limit, loaded, setActive, createProduct, rename, setStatus, load]);

  return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
}

export function useProducts() {
  const ctx = useContext(ProductContext);
  if (!ctx) throw new Error("useProducts debe usarse dentro de ProductProvider");
  return ctx;
}
