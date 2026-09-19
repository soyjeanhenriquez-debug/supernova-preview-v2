import { useEffect, useRef, type ReactNode } from "react";
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
// Pila de modales abiertos: con uno encima de otro (la ficha de una oferta y,
// sobre ella, "Crear mi versión"), Esc cierra solo el de arriba.
const openModals: symbol[] = [];

export function ModalPortal({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  const id = useRef(Symbol("modal")).current;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    openModals.push(id);
    return () => {
      document.body.style.overflow = prev;
      const i = openModals.indexOf(id);
      if (i >= 0) openModals.splice(i, 1);
    };
  }, [id]);

  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openModals[openModals.length - 1] === id) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, id]);

  return createPortal(children, document.body);
}
