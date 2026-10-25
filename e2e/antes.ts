// Antes de correr el agente probador: sin sesión guardada no se prueba nada (y se dice qué hacer).
import { existsSync } from "node:fs";
import { SESION } from "./comun";

export default function antes() {
  const soloSesion = process.argv.some(a => a === "--project=sesion");
  if (!soloSesion && !existsSync(SESION)) {
    throw new Error("Todavía no hay sesión guardada. Corre primero «npm run e2e:sesion», entra con tu cuenta en la ventana que se abre y luego «npm run e2e».");
  }
}
