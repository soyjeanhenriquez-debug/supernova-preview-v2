import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  cleanDna, dnaErrors, EMPTY_DNA, type BrandDna, type DnaKey,
} from "../../supabase/functions/_shared/brandDna";

/**
 * ADN de marca 2.0 (19-oct-2026). Las preguntas, los topes, los modos y las reglas de la oferta viven en
 * supabase/functions/_shared/brandDna.ts: la app y el servidor usan la MISMA definición.
 * Aquí: leer y guardar el ADN (tabla brand_dna) y las preferencias editoriales (editorial_prefs).
 */
export * from "../../supabase/functions/_shared/brandDna";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabase as any;
export type SaveState = "idle" | "saving" | "saved" | "error";
const DRAFT_KEY = (uid: string) => `supernova.adn.borrador.${uid}`;

function readDraft(uid: string): Partial<BrandDna> {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY(uid)) ?? "{}") as Partial<BrandDna>; } catch { return {}; }
}
function writeDraft(uid: string, d: Partial<BrandDna>) {
  try {
    if (Object.keys(d).length) localStorage.setItem(DRAFT_KEY(uid), JSON.stringify(d));
    else localStorage.removeItem(DRAFT_KEY(uid));
  } catch { /* sin almacenamiento: igual se guarda en la base */ }
}

/**
 * El ADN de la persona con autoguardado: 600 ms después de dejar de escribir, al salir del campo y al
 * cerrar la pestaña. Lo que todavía no llegó a la base queda como borrador en este navegador y se
 * vuelve a enviar al abrir (así no se pierde al recargar ni al cambiar de sección). Un texto que pasa
 * su tope NO se guarda ni se recorta: se marca para que la persona lo acorte.
 */
export function useBrandDna() {
  const { user } = useAuth();
  const [dna, setDna] = useState<BrandDna>(EMPTY_DNA);
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<SaveState>("idle");
  const pending = useRef<Partial<BrandDna>>({});
  const timer = useRef<number | null>(null);
  const uid = user?.id ?? null;

  const flush = useCallback(async () => {
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
    if (!uid) return true;
    const patch = { ...pending.current };
    // Lo que pasa su tope se queda pendiente (no se manda: la base lo rechazaría y no se recorta).
    const errs = dnaErrors(patch);
    for (const k of Object.keys(errs) as DnaKey[]) delete patch[k];
    if (!Object.keys(patch).length) return true;
    setState("saving");
    const { error } = await db().from("brand_dna").upsert({ user_id: uid, ...patch }, { onConflict: "user_id" });
    if (error) { setState("error"); return false; }
    for (const k of Object.keys(patch) as (keyof BrandDna)[]) {
      if (pending.current[k] === patch[k]) delete pending.current[k];
    }
    writeDraft(uid, pending.current);
    setState("saved");
    return true;
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    setLoaded(false);
    void (async () => {
      const { data, error } = await db().from("brand_dna").select("*").eq("user_id", uid).maybeSingle();
      if (!alive) return;
      if (error) setState("error");
      const draft = readDraft(uid);
      pending.current = { ...draft };
      setDna({ ...cleanDna(data ?? {}), ...draft });
      setLoaded(true);
      if (Object.keys(draft).length) void flush();
    })();
    return () => { alive = false; };
  }, [uid, flush]);

  useEffect(() => {
    const out = () => { void flush(); };
    window.addEventListener("pagehide", out);
    window.addEventListener("beforeunload", out);
    return () => { window.removeEventListener("pagehide", out); window.removeEventListener("beforeunload", out); void flush(); };
  }, [flush]);

  /** Cambia un campo (o el permiso de P8) y lo guarda solo. */
  const set = useCallback(<K extends keyof BrandDna>(k: K, v: BrandDna[K], now = false) => {
    setDna(d => ({ ...d, [k]: v }));
    pending.current = { ...pending.current, [k]: v };
    if (uid) writeDraft(uid, pending.current);
    if (timer.current) window.clearTimeout(timer.current);
    if (now) void flush();
    else timer.current = window.setTimeout(() => { void flush(); }, 600);
  }, [uid, flush]);

  return { dna, loaded, state, set, flush };
}

export type EditorialPref = { id: string; text: string; created_at: string };

/** Preferencias editoriales: solo con el botón "Guardar como preferencia"; se ven, editan y borran. */
export function useEditorialPrefs() {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [prefs, setPrefs] = useState<EditorialPref[]>([]);
  const load = useCallback(async () => {
    if (!uid) return;
    const { data } = await db().from("editorial_prefs").select("id, text, created_at").order("created_at", { ascending: false }).limit(30);
    setPrefs((data ?? []) as EditorialPref[]);
  }, [uid]);
  useEffect(() => { void load(); }, [load]);
  const add = useCallback(async (text: string) => {
    if (!uid) return "Inicia sesión.";
    const { error } = await db().from("editorial_prefs").insert({ user_id: uid, text: text.trim() });
    if (error) return /30 preferencias/.test(error.message) ? "Llegaste a 30 preferencias. Borra alguna para guardar otra." : "No se guardó, revisa tu conexión.";
    await load();
    return null;
  }, [uid, load]);
  const update = useCallback(async (id: string, text: string) => {
    const { error } = await db().from("editorial_prefs").update({ text: text.trim() }).eq("id", id);
    if (!error) await load();
    return error ? "No se guardó, revisa tu conexión." : null;
  }, [load]);
  const remove = useCallback(async (id: string) => {
    const { error } = await db().from("editorial_prefs").delete().eq("id", id);
    if (!error) setPrefs(p => p.filter(x => x.id !== id));
    return error ? "No se borró, revisa tu conexión." : null;
  }, []);
  return { prefs, add, update, remove, reload: load };
}
