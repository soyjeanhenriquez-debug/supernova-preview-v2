import { describe, expect, it } from "vitest";
import { langFromText } from "@/lib/demo-winning-ads";

describe("langFromText", () => {
  it("reconoce español", () => {
    expect(langFromText("Aprende a crear tu primer curso en línea con una guía para empezar desde cero", "en")).toBe("es");
  });
  it("un anuncio en inglés dirigido a México no es español", () => {
    expect(langFromText("Get the guide now and learn how to build your first online course with this method", "es")).toBe("en");
  });
  it("vietnamita y francés salen como otro", () => {
    expect(langFromText("Khóa học trực tuyến giúp bạn học tiếng Anh nhanh hơn mỗi ngày", "es")).toBe("otro");
    expect(langFromText("Découvrez le programme pour vous et votre famille avec des recettes dans la cuisine", "es")).toBe("otro");
  });
  it("texto corto usa el país", () => {
    expect(langFromText("Curso gratis", "pt")).toBe("pt");
  });
});
