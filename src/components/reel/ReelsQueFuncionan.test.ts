import { describe, expect, it } from "vitest";
import { cifra, titular } from "./ReelsQueFuncionan";
describe("biblioteca", () => {
  it("titular", () => {
    expect(titular({ gancho: "Noweżykowém.", transcript: "Noweżykowém.", caption: "La relación más difícil. #amor" })).toBe("La relación más difícil.");
    expect(titular({ gancho: "Apple vende innovación, no teléfonos.", transcript: null, caption: "x" })).toBe("Apple vende innovación, no teléfonos.");
    expect(titular({ gancho: null, transcript: null, caption: null })).toBe("Reel sin texto");
  });
  it("cifra", () => { expect(cifra(7307076)).toBe("7,3 M"); expect(cifra(668050)).toBe("668 mil"); expect(cifra(3043)).toBe("3043"); });
});
