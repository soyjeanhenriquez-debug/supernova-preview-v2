import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { isChunkLoadError, reloadOnceForNewVersion } from "@/components/ErrorBoundary";

// Traductores del navegador (Chrome, Safari, extensiones) cambian los nodos de texto por
// debajo de React; al actualizar la pantalla React intenta quitar un nodo que ya no está y
// lanza "Failed to execute 'removeChild'/'insertBefore'", que tumbaba la pantalla entera
// (12 de 13 errores guardados en client_errors el 23-sep). index.html ya pide no traducir;
// esto evita el pantallazo si alguien fuerza la traducción igual. Solución conocida:
// https://github.com/facebook/react/issues/11538
if (typeof Node === "function" && Node.prototype) {
  const removeChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) return child;
    return removeChild.call(this, child) as T;
  };
  const insertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(this: Node, newNode: T, ref: Node | null): T {
    if (ref && ref.parentNode !== this) return insertBefore.call(this, newNode, null) as T;
    return insertBefore.call(this, newNode, ref) as T;
  };
}

// Tras publicar una versión nueva, una pestaña abierta pide chunks que ya no
// existen (su nombre cambia en cada build). Vite avisa con este evento: se
// recarga una vez para tomar la versión nueva en lugar de quedarse a medias.
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  reloadOnceForNewVersion();
});
window.addEventListener("unhandledrejection", (event) => {
  if (isChunkLoadError(event.reason)) reloadOnceForNewVersion();
});

// Quien vuelve con sesión guardada va directo al Inicio: se empiezan a descargar la app y el
// Inicio YA, en paralelo con la comprobación de sesión y de acceso (antes iban uno tras otro).
try {
  if (Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token"))) {
    void import("./pages/Index");
    void import("./pages/DashboardPage");
  }
} catch { /* sin almacenamiento: se descargan cuando toque */ }

createRoot(document.getElementById("root")!).render(<App />);
