import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { isChunkLoadError, reloadOnceForNewVersion } from "@/components/ErrorBoundary";

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

createRoot(document.getElementById("root")!).render(<App />);
