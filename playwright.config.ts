import { defineConfig, devices } from "@playwright/test";
import { SESION } from "./e2e/comun";

/**
 * Agente probador de punta a punta del Guardián del Creador (25-oct-2026). Corre contra la app publicada con la
 * sesión de Jean guardada FUERA del repo (~/.supernova-e2e/sesion.json, permisos 600). Cada recorrido se anota en
 * el Guardián (guardian_log_e2e). Sesión: `npm run e2e:sesion` (entras tú una vez). Pruebas: `npm run e2e`.
 * Lo programa ~/Library/LaunchAgents/com.supernova.guardian-e2e.plist (lunes 9:00).
 */
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/antes.ts",
  timeout: 15 * 60_000,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: `${process.env.HOME}/.supernova-e2e/ultimo.json` }]],
  outputDir: `${process.env.HOME}/.supernova-e2e/resultados`,
  use: {
    baseURL: process.env.E2E_URL ?? "https://supernova-six-eta.vercel.app",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "es-DO",
  },
  projects: [
    { name: "sesion", testMatch: /sesion\.guardar\.ts$/, use: { ...devices["Desktop Chrome"], storageState: { cookies: [], origins: [] } } },
    { name: "escritorio", testMatch: /.*\.spec\.ts$/, use: { ...devices["Desktop Chrome"], storageState: SESION } },
    { name: "celular", testMatch: /.*\.spec\.ts$/, use: { ...devices["iPhone 13"], defaultBrowserType: "chromium", storageState: SESION }, grep: /@celular/ },
  ],
});
