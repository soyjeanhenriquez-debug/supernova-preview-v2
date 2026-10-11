import { describe, expect, it } from "vitest";
import { isChunkLoadError } from "@/components/ErrorBoundary";

describe("fallos de carga tras publicar una versión nueva", () => {
  it("reconoce el error de React.lazy cuando Vite devuelve undefined (11-oct-2026)", () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'default')"))).toBe(true);
  });
  it("sigue reconociendo los de siempre y no confunde otros errores", () => {
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: /assets/x.js"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
  });
});
