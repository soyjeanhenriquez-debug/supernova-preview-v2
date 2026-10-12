import { describe, expect, it } from "vitest";
import { langFromText, LANG_LABEL } from "@/lib/demo-winning-ads";

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

describe("langFromText con textos largos", () => {
  it("portugués largo no empata con español", () => {
    const pt = "Bilionário traído – ele ascende com a ajuda de uma garota muda. O magnata de Wall Street, Ryan Chase, é envenenado e jogado ao mar por sua noiva, Mia, durante uma luxuosa festa em um iate. Ele sobrevive milagrosamente, porém perde a voz, a identidade e tudo o que um dia teve. Sem nada, Ryan é resgatado por uma gentil mulher muda chamada Sophia, que leva ele de volta ao pequeno restaurante de sua família e oferece a ele um emprego.";
    expect(langFromText(pt, "es")).toBe("pt");
  });
  it("español largo sigue siendo español", () => {
    const es = "Si quieres empezar a vender por internet pero no sabes por dónde empezar, esta guía es para ti. Aprende paso a paso cómo crear tu primer producto digital, cómo ponerle precio y cómo conseguir tus primeros clientes por WhatsApp, sin experiencia y con lo que ya tienes en casa.";
    expect(langFromText(es, "pt")).toBe("es");
  });
});

describe("LANG_LABEL", () => {
  it("dice el idioma en español llano", () => {
    expect(LANG_LABEL[langFromText("Get the guide now and learn how to build your first online course with this method", "es")]).toBe("Inglés");
    expect(LANG_LABEL.otro).toBe("Otro idioma");
  });
});
