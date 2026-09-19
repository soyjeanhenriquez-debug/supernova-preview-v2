import { Component, type ErrorInfo, type ReactNode } from "react";

const RELOAD_KEY = "supernova_chunk_reload_at";

/** Un chunk que ya no existe: pasa cuando publicamos una versión nueva y la
 *  pestaña del usuario sigue con el index.html anterior (los nombres de los
 *  archivos cambian en cada despliegue). La cura es recargar. */
export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? "");
  return /dynamically imported module|Importing a module script failed|ChunkLoadError|Failed to fetch dynamically|Unable to preload CSS/i.test(msg);
}

/** Recarga UNA vez por minuto como mucho: si el chunk de verdad no existe, no entra en bucle. */
export function reloadOnceForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch { /* sessionStorage bloqueado: se recarga igual, una vez */ }
  window.location.reload();
  return true;
}

interface Props { children: ReactNode; /** Cambia al navegar: limpia el error para que otra pantalla sí se vea. */ resetKey?: string; compact?: boolean }
interface State { error: Error | null }

/**
 * Sin esto, cualquier excepción al pintar deja la app en blanco. Con esto el
 * resto de la interfaz sigue viva, el usuario ve qué hacer, y si el fallo es
 * una versión nueva recién publicada se recarga solo.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isChunkLoadError(error) && reloadOnceForNewVersion()) return;
    console.error("[SUPERNOVA] error de interfaz:", error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const stale = isChunkLoadError(error);
    return (
      <div className={this.props.compact ? "py-16 px-6 text-center" : "min-h-screen bg-background flex items-center justify-center p-6 text-center"}>
        <div className="max-w-md mx-auto space-y-4">
          <div className="text-4xl" aria-hidden>{stale ? "✨" : "🛠️"}</div>
          <h2 className="font-display text-xl font-bold">
            {stale ? "Hay una versión nueva de SUPERNOVA" : "Esta pantalla tuvo un problema"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {stale
              ? "Recarga para usar la última versión. No pierdes nada de lo que ya guardaste."
              : "No es tu culpa y no perdiste créditos por esto. Recarga la página; si se repite, escríbenos desde el asistente de ayuda."}
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Recargar
            </button>
            {!stale && (
              <button
                onClick={() => { window.location.href = "/"; }}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary transition-colors"
              >
                Ir al inicio
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
