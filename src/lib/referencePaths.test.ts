import { describe, expect, it } from "vitest";
import { checkReferencePaths } from "../../supabase/functions/generate-ad-creative/refs";

const UID = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-2222-3333-4444-555555555555";

describe("checkReferencePaths (generate-ad-creative)", () => {
  it("acepta rutas propias", () => {
    const r = checkReferencePaths([`${UID}/prod/refs/1.webp`, `${UID}/prod/2.png`], UID);
    expect(r).toEqual({ ok: true, paths: [`${UID}/prod/refs/1.webp`, `${UID}/prod/2.png`] });
  });
  it("sin referencias es válido", () => {
    expect(checkReferencePaths(undefined, UID)).toEqual({ ok: true, paths: [] });
  });
  it("rechaza ruta ajena", () => {
    expect(checkReferencePaths([`${OTHER}/prod/1.webp`], UID).ok).toBe(false);
  });
  it("rechaza ..", () => {
    expect(checkReferencePaths([`${UID}/../${OTHER}/1.webp`], UID).ok).toBe(false);
  });
  it("rechaza más de 3", () => {
    expect(checkReferencePaths([1, 2, 3, 4].map(i => `${UID}/p/${i}.webp`), UID).ok).toBe(false);
  });
  it("rechaza URLs", () => {
    expect(checkReferencePaths(["https://evil.com/x.png"], UID).ok).toBe(false);
    expect(checkReferencePaths([`data:image/png;base64,AAAA`], UID).ok).toBe(false);
    expect(checkReferencePaths([`//evil.com/${UID}/x.png`], UID).ok).toBe(false);
  });
  it("rechaza lo que no es imagen o no es lista", () => {
    expect(checkReferencePaths([`${UID}/p/x.mp4`], UID).ok).toBe(false);
    expect(checkReferencePaths(`${UID}/p/x.webp`, UID).ok).toBe(false);
  });
});
