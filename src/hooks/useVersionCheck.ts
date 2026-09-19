import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Aviso de versión nueva. Una pestaña abierta antes de un deploy sigue corriendo
 * el código viejo (textos viejos, llamadas que el servidor ya no acepta) hasta
 * que alguien recarga. Cada build escribe /version.json; cuando la pestaña
 * vuelve a estar visible se compara con el build que está corriendo y, si
 * cambió, se avisa. Index recarga solo en el siguiente cambio de pantalla, que
 * es un momento seguro (no hay nada a medio escribir en la pantalla destino).
 */
const CHECK_EVERY_MS = 5 * 60_000;
const MIN_GAP_MS = 60_000;

export function updateIsReady(): boolean {
  return (window as unknown as { __supernovaUpdateReady?: boolean }).__supernovaUpdateReady === true;
}

export function useVersionCheck() {
  useEffect(() => {
    if (import.meta.env.DEV) return;
    let notified = false;
    let lastCheck = 0;

    const check = async () => {
      if (notified || document.visibilityState !== "visible" || Date.now() - lastCheck < MIN_GAP_MS) return;
      lastCheck = Date.now();
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const { build } = (await res.json()) as { build?: unknown };
        if (typeof build !== "string" || !build || build === __BUILD_ID__) return;
        notified = true;
        (window as unknown as { __supernovaUpdateReady?: boolean }).__supernovaUpdateReady = true;
        toast("Hay una versión nueva de SUPERNOVA", {
          description: "Actualiza para ver lo último.",
          duration: Infinity,
          action: { label: "Actualizar", onClick: () => window.location.reload() },
        });
      } catch { /* sin red o respuesta no-JSON: se reintenta en la próxima ocasión */ }
    };

    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    check();
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      window.clearInterval(timer);
    };
  }, []);
}
