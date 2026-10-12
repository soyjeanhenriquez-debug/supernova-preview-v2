/**
 * R2-15 · Radar: idioma por el TEXTO del anuncio (11-oct-2026), no por el país.
 * Casos nuevos (distintos de langFromText.test.ts) para que el arreglo no se pierda:
 * portugués largo de venta, español largo con palabras que comparte con el portugués, vietnamita
 * largo dirigido a México e inglés dirigido a LATAM.
 */
import { describe, expect, it } from "vitest";
import { langFromText } from "@/lib/demo-winning-ads";

describe("R2 · langFromText", () => {
  it("portugués largo de venta (Hotmart) sale como portugués aunque el país sea de habla hispana", () => {
    const pt = "Você está cansada de tentar emagrecer e não ver resultado? Neste método você aprende a montar o seu cardápio da semana em uma tarde, com receitas simples que cabem no seu bolso. São mais de 200 receitas e um guia passo a passo para quem nunca cozinhou. Acesse agora e garanta a sua vaga, porque as vagas são limitadas e o bônus é só hoje.";
    expect(langFromText(pt, "es")).toBe("pt");
  });

  it("español largo con 'de', 'que', 'para' (comunes con el portugués) sigue siendo español", () => {
    const es = "Para las mamás que trabajan y no tienen tiempo de cocinar: con esta guía aprendes a preparar la comida de toda la semana en una sola tarde. Son recetas sencillas, con ingredientes que encuentras en cualquier mercado y un plan de compras para que no gastes de más. Es un producto digital: lo recibes al momento por WhatsApp y lo usas desde tu celular.";
    expect(langFromText(es, "pt")).toBe("es");
    expect(langFromText(es, "en")).toBe("es");
  });

  it("vietnamita largo dirigido a México sale como 'otro' (no se mezcla con español)", () => {
    const vi = "Khóa học nấu ăn trực tuyến dành cho người mới bắt đầu. Bạn sẽ học cách nấu những món ăn ngon, đơn giản và tiết kiệm cho cả gia đình mỗi ngày. Đăng ký ngay hôm nay để nhận thêm tài liệu miễn phí và được hỗ trợ trực tiếp từ giáo viên.";
    expect(langFromText(vi, "es")).toBe("otro");
    expect(langFromText(vi, "en")).toBe("otro");
  });

  it("inglés dirigido a Colombia sale como inglés", () => {
    const en = "Stop wasting hours on meal prep. This digital cookbook shows you how to plan the whole week in one afternoon, with simple recipes and a shopping list you can use on your phone. Get instant access now and start cooking smarter this week.";
    expect(langFromText(en, "es")).toBe("en");
  });

  it("ruso por alfabeto; texto corto o vacío usa el país", () => {
    expect(langFromText("Узнайте как начать свой онлайн бизнес сегодня", "es")).toBe("ru");
    expect(langFromText("Curso gratis hoy", "es")).toBe("es");
    expect(langFromText("", "pt")).toBe("pt");
  });
});
