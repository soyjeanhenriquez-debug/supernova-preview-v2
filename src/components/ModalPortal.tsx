import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Monta un modal hecho a mano (`fixed inset-0 …`) directamente en <body>.
 *
 * Por qué: `position: fixed` se ancla a la VENTANA salvo que algún ancestro
 * tenga `transform`, `filter` o `backdrop-filter`; en ese caso se ancla a ese
 * ancestro. El contenedor del Dashboard conserva un `transform` de su animación
 * de entrada, así que un modal abierto desde los picks (con la página ya
 * desplazada) quedaba centrado en una caja de ~3.700 px de alto: el usuario
 * solo veía el fondo negro. Fuera del árbol de la página eso no puede pasar.
 *
 * De paso: bloquea el scroll del fondo mientras está abierto y cierra con Esc.
 */
export function ModalPortal({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(children, document.body);
}
