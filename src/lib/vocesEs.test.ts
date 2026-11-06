import { describe, it, expect } from "vitest";
import { nombreVozEs } from "../../supabase/functions/_shared/vocesEs";

describe("Nombres de las voces en español", () => {
  it("las de la biblioteca llevan su frase hecha a mano", () => {
    expect(nombreVozEs("Sarah - Mature, Reassuring, Confident")).toBe("Sarah · madura y segura");
    expect(nombreVozEs("Daniel - Steady Broadcaster")).toBe("Daniel · de locutor de radio");
  });
  it("las demás se traducen palabra por palabra; lo que no se entiende queda solo con el nombre", () => {
    expect(nombreVozEs("Grandma Aurora - Warm, Deep & Loving", false)).toBe("Grandma Aurora · cálido, grave y cariñoso");
    expect(nombreVozEs("Javi - Social Media", false)).toBe("Javi · de redes");
    expect(nombreVozEs("Brian - Deep, Resonant and Comforting", false)).toBe("Brian · grave, sonoro y reconfortante");
    expect(nombreVozEs("Chun Li", false)).toBe("Chun Li");
    expect(nombreVozEs("Zed - Xyzzy", false)).toBe("Zed");
  });
});
