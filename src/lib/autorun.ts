/**
 * Botones de un clic ("Hazme el primer anuncio", "Mis mensajes de WhatsApp"…): el botón deja dicho
 * qué hacer al llegar a la herramienta y la herramienta lo ejecuta UNA vez al abrirse. Lo que gasta
 * créditos lo sigue cobrando el servidor como siempre (el botón dice cuánto antes de tocarlo); aquí
 * solo se recuerda la orden, en sessionStorage, y se borra al leerla para que no se repita.
 */
export type AutorunAction = "mandala-first-ad" | "recovery-sequence" | "builder-outline";

const KEY = "supernova.autorun";
const MAX_AGE_MS = 2 * 60_000; // una orden vieja (otra pestaña, otro día) no se ejecuta

export function setAutorun(action: AutorunAction) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ action, at: Date.now() })); } catch { /* sin almacenamiento */ }
}

/** Devuelve true (y la borra) si la orden pendiente es `action` y es reciente. */
export function takeAutorun(action: AutorunAction): boolean {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return false;
    const { action: a, at } = JSON.parse(raw) as { action?: string; at?: number };
    if (a !== action) return false;
    sessionStorage.removeItem(KEY);
    return typeof at === "number" && Date.now() - at < MAX_AGE_MS;
  } catch { return false; }
}
