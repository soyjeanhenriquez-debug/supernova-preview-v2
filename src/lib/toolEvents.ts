import { supabase } from "@/integrations/supabase/client";

/**
 * Eventos de tarea por herramienta (Guardián del Creador, 24-oct-2026). Sirven para medir lo que antes
 * quedaba "sin medir": tareas completadas, tiempo hasta el primer resultado, reintentos y abandono.
 * Solo se manda la herramienta, el tipo de evento, la hora y un id de pestaña al azar: nada de lo que la
 * persona escribe. Los guarda el servidor (log_tool_events) con su propia compuerta y tope diario.
 *  abrir      la persona abrió la herramienta (lo pone ToolShell solo, con su toolId)
 *  empezar    pidió un resultado (generar, analizar, crear)
 *  resultado  recibió un resultado utilizable
 *  error      el intento falló
 *  descargar  se llevó el resultado
 */
export type ToolEvento = "abrir" | "empezar" | "resultado" | "error" | "descargar";
export type ToolEvent = { tool: string; evento: ToolEvento; at: number; sid: string };

const TOOL_RE = /^[a-z0-9-]{2,40}$/;
let sid = "";
let cola: ToolEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

/** Un id al azar por pestaña: une "abrir" con su "resultado" sin saber quién es. */
export function tabId(): string {
  if (sid) return sid;
  try { sid = sessionStorage.getItem("sn_tool_sid") ?? ""; } catch { /* sin almacenamiento */ }
  if (!/^[a-z0-9]{8,24}$/.test(sid)) {
    sid = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    sid = sid.slice(0, 24);
    try { sessionStorage.setItem("sn_tool_sid", sid); } catch { /* sin almacenamiento */ }
  }
  return sid;
}

async function enviar() {
  timer = null;
  const lote = cola.splice(0, 30);
  if (!lote.length) return;
  try { await supabase.rpc("log_tool_events" as never, { p_events: lote } as never); } catch { /* medir nunca rompe la herramienta */ }
  if (cola.length) timer = setTimeout(() => void enviar(), 2000);
}

export function toolEvent(tool: string, evento: ToolEvento): void {
  if (!TOOL_RE.test(tool)) return;
  cola.push({ tool, evento, at: Date.now(), sid: tabId() });
  if (cola.length > 120) cola = cola.slice(-120);
  if (!timer) timer = setTimeout(() => void enviar(), 2000);
}

/** Para las pruebas. */
export function _colaParaPruebas(): ToolEvent[] { return cola; }
export async function _enviarParaPruebas(): Promise<void> { if (timer) clearTimeout(timer); await enviar(); }
