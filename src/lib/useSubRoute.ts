import { useCallback, useEffect, useState } from "react";

/**
 * Los pasos DENTRO de una pantalla también tienen dirección (Fase 1 de la organización, 16-oct-2026):
 * "#/con-tu-cara/reel/<id>". Así el botón Atrás del navegador vuelve un paso (no te saca de la
 * herramienta), recargar no pierde dónde estabas y se puede guardar el enlace.
 * El primer tramo sigue siendo la pantalla (lo lee Index); este hook maneja lo que va después.
 */
export function useSubRoute(slug: string) {
  const read = useCallback((): string[] => {
    try {
      const parts = decodeURIComponent(window.location.hash.replace(/^#\/?/, "")).split("/");
      return parts[0] === slug ? parts.slice(1).filter(Boolean) : [];
    } catch { return []; }
  }, [slug]);
  const [segs, setSegs] = useState<string[]>(read);

  useEffect(() => {
    const sync = () => setSegs(read());
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => { window.removeEventListener("popstate", sync); window.removeEventListener("hashchange", sync); };
  }, [read]);

  /** Va a un paso: go(["reel", id]). `replace` no deja el paso anterior en el historial. */
  const go = useCallback((next: string[], replace = false) => {
    const target = `#/${[slug, ...next].map(encodeURIComponent).join("/")}`;
    if (window.location.hash !== target) {
      window.history[replace ? "replaceState" : "pushState"](null, "", `${window.location.pathname}${window.location.search}${target}`);
    }
    setSegs(next);
    window.scrollTo({ top: 0 });
  }, [slug]);

  return { segs, go };
}
