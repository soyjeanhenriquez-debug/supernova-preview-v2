/**
 * Avisos de la ventana "Crea tu contraseña nueva" (src/components/SetPasswordDialog.tsx), en un
 * archivo aparte y mínimo: el login y el menú los usan sin cargar la ventana, que se descarga solo
 * cuando hace falta (fuera de la carga inicial de la app).
 */
export const SET_PASSWORD_FLAG = "supernova:set-password";
export const SET_PASSWORD_EVENT = "supernova:open-set-password";

/** Lo llama el login con código: al entrar se ofrece crear una contraseña nueva. */
export function offerNewPasswordAfterLogin() {
  try { sessionStorage.setItem(SET_PASSWORD_FLAG, "1"); } catch { /* sin almacenamiento: no se ofrece */ }
}
export function clearNewPasswordOffer() {
  try { sessionStorage.removeItem(SET_PASSWORD_FLAG); } catch { /* nada */ }
}
export function newPasswordOffered() {
  try { return sessionStorage.getItem(SET_PASSWORD_FLAG) === "1"; } catch { return false; }
}
/** Abre la ventana desde cualquier parte de la app. */
export function openSetPassword() { window.dispatchEvent(new Event(SET_PASSWORD_EVENT)); }
