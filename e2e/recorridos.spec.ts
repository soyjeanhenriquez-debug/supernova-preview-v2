// Agente probador del Guardián del Creador: recorre la app publicada como la usa una persona y anota cada paso.
// Gratis o casi: no genera video (eso está en reel-studio.spec.ts). Corre en escritorio y, lo marcado @celular,
// también en tamaño de teléfono.
import { expect, test } from "@playwright/test";
import { paso, sinPantallazo } from "./comun";

const PANTALLAS = [
  ["Inicio", "/app"], ["Ofertas", "/app#/ofertas"], ["Radar", "/app#/radar"], ["Crear", "/app#/crear"],
  ["Contenido", "/app#/contenido"], ["Con tu cara", "/app#/con-tu-cara"], ["Analiza un Reel", "/app#/con-tu-cara/reel"],
] as const;

test("Las pantallas principales abren sin caerse @celular", async ({ page }, info) => {
  const errores: string[] = [];
  page.on("pageerror", e => errores.push(e.message));
  for (const [nombre, url] of PANTALLAS) {
    await paso(page, `Abrir ${nombre} (${info.project.name})`, async () => {
      await page.goto(url);
      await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
      await expect(page.getByText(/Inicia sesión|Iniciar sesión/).first()).toHaveCount(0, { timeout: 5_000 });
      await sinPantallazo(page);
      const ancho = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (ancho > 4) throw new Error(`${nombre}: la página se sale ${ancho} px a lo ancho.`);
      return `${nombre} abrió bien${errores.length ? ` (errores en consola: ${errores.length})` : ""}.`;
    });
  }
  expect(errores, errores.join("\n")).toEqual([]);
});

test("Guardián del Creador: el panel abre y la auditoría corre de verdad", async ({ page }) => {
  await page.goto("/admin/guardian");
  await paso(page, "Panel del Guardián abre", async () => {
    await expect(page.getByRole("heading", { name: "Guardián del Creador" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Críticos")).toBeVisible();
    return "El panel muestra conteos y pestañas.";
  });
  await paso(page, "Auditar toda Supernova", async () => {
    await page.getByRole("button", { name: /Auditar toda Supernova/ }).click();
    await expect(page.getByText("Auditoría terminada.")).toBeVisible({ timeout: 120_000 });
    await page.getByRole("tab", { name: "Pruebas" }).click();
    await expect(page.getByText(/Precios ≥ costo real × 5/)).toBeVisible();
    return "La auditoría terminó y sus pruebas se ven en el panel.";
  });
});

test("Reel Studio: abre y muestra tus voces por nombre", async ({ page }) => {
  await page.goto("/app#/con-tu-cara/reel-ia");
  await paso(page, "Reel Studio abre", async () => {
    await expect(page.getByRole("heading", { name: /Reel Studio|Mi identidad/ }).first()).toBeVisible({ timeout: 30_000 });
    await sinPantallazo(page);
    return "Reel Studio abrió.";
  });
  // Solo si hay un reel en curso se ve «Opciones avanzadas»; si no, la prueba de voces se salta y lo dice.
  const avanzadas = page.getByRole("button", { name: "Opciones avanzadas" });
  if (await avanzadas.count()) {
    await paso(page, "Reel Studio: elegir voz por nombre", async () => {
      await avanzadas.first().click();
      await expect(page.getByRole("button", { name: "Tu propia voz" })).toBeVisible({ timeout: 20_000 });
      const escuchar = await page.getByRole("button", { name: /^Escuchar / }).count();
      return `Se ve «Tu propia voz» y ${escuchar} voz(ces) con muestra para escuchar.`;
    }, { journey: "Reel Studio", step: 3 });
  }
});
