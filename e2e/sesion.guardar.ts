// Guarda tu sesión para el agente probador: se abre Chromium, entras TÚ (correo, contraseña y la verificación de
// Cloudflare) y al ver la app se guarda en ~/.supernova-e2e/sesion.json con permisos 600. Nadie más la lee.
import { test } from "@playwright/test";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SESION } from "./comun";

test("Guardar mi sesión", async ({ page, context }) => {
  test.setTimeout(11 * 60_000);
  mkdirSync(dirname(SESION), { recursive: true, mode: 0o700 });
  await page.goto("/app");
  console.log("Inicia sesión en la ventana que se abrió. Tienes 10 minutos.");
  await page.waitForFunction(() => Object.keys(localStorage).some(k => /^sb-.*-auth-token$/.test(k)), null, { timeout: 10 * 60_000, polling: 1000 });
  await page.waitForTimeout(3000);
  await context.storageState({ path: SESION });
  chmodSync(SESION, 0o600);
  console.log("Sesión guardada. Ya puedes cerrar la ventana.");
});
