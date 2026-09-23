import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * "✨ Rellenar con IA": ejemplos personalizados para los formularios (edge function form-assist),
 * sacados de la encuesta de registro y de la última oferta que describió el usuario.
 * El ejemplo se usa como placeholder en cuanto llega y, con el botón, rellena los campos.
 * Se guarda un día en este navegador para no pedir lo mismo cada vez que se abre la página.
 */
export type AssistForm = "mandala-brief" | "generator" | "media-script" | "whatsapp-visto" | "crear-keyword" | "launch-task";
export type Suggestion = Record<string, string | string[]>;

const TTL = 24 * 60 * 60 * 1000;

async function requestSuggestion(form: AssistForm, current: Record<string, unknown>, context: string, variant: number): Promise<Suggestion> {
  const { data, error } = await supabase.functions.invoke("form-assist", { body: { form, current, context, variant } });
  if (error) {
    // supabase-js esconde el cuerpo del error: se lee para mostrar el mensaje real (p. ej. el tope por hora).
    const ctx = (error as { context?: Response }).context;
    const msg = ctx ? await ctx.json().then((b: { error?: string }) => b?.error).catch(() => null) : null;
    throw new Error(msg || "No se pudo generar el ejemplo.");
  }
  if (!data?.suggestion) throw new Error(data?.error || "No se pudo generar el ejemplo.");
  return data.suggestion as Suggestion;
}

/** Una llamada suelta (sin caché), para pantallas con muchos campos distintos, como las tareas del plan. */
export const askAssist = (form: AssistForm, current: Record<string, unknown>, context: string) =>
  requestSuggestion(form, current, context, 0);

/**
 * @param form      qué formulario
 * @param context   datos que cambian el ejemplo (p. ej. el nombre del generador); forma parte de la caché
 * @param auto      pedir el ejemplo al abrir (para el placeholder); si es false solo se pide con el botón
 */
export function useFormAssist(form: AssistForm, context = "", auto = true) {
  const { user } = useAuth();
  const key = `sn_assist_${user?.id ?? "anon"}_${form}_${context.slice(0, 80)}`;
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const variant = useRef(0);

  const save = useCallback((s: Suggestion) => {
    try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), s })); } catch { /* sin almacenamiento */ }
  }, [key]);

  useEffect(() => {
    setSuggestion(null);
    variant.current = 0;
    if (!user) return;
    try {
      const cached = JSON.parse(localStorage.getItem(key) || "null");
      if (cached?.s && Date.now() - cached.at < TTL) { setSuggestion(cached.s); return; }
    } catch { /* sin almacenamiento */ }
    if (!auto) return;
    let alive = true;
    requestSuggestion(form, {}, context, 0)
      .then(s => { if (alive) { setSuggestion(s); save(s); } })
      .catch(() => { /* el placeholder de siempre sigue ahí */ });
    return () => { alive = false; };
  }, [key, user, form, context, auto, save]);

  /** Pide un ejemplo nuevo teniendo en cuenta lo que ya escribió. Devuelve null si falla (y el error viene en el throw). */
  const generate = useCallback(async (current: Record<string, unknown> = {}) => {
    setLoading(true);
    try {
      const s = await requestSuggestion(form, current, context, variant.current++);
      setSuggestion(s);
      save(s);
      return s;
    } finally {
      setLoading(false);
    }
  }, [form, context, save]);

  const text = (k = "text") => {
    const v = suggestion?.[k];
    return typeof v === "string" ? v : "";
  };

  return { suggestion, text, loading, generate };
}
