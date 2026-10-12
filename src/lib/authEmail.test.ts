import { describe, expect, it } from "vitest";
import { isValidEmail, suggestEmail } from "./authEmail";

describe("suggestEmail", () => {
  it("corrige los errores típicos", () => {
    expect(suggestEmail("ana@gmial.com")).toBe("ana@gmail.com");
    expect(suggestEmail("ana@gmail.con")).toBe("ana@gmail.com");
    expect(suggestEmail("ana@gmail.co")).toBe("ana@gmail.com");
    expect(suggestEmail("Ana@Hotmial.com")).toBe("ana@hotmail.com");
    expect(suggestEmail("ana@outlok.com")).toBe("ana@outlook.com");
    expect(suggestEmail("ana@yaho.com")).toBe("ana@yahoo.com");
  });
  it("no toca correos buenos ni dominios reales parecidos", () => {
    expect(suggestEmail("ana@gmail.com")).toBeNull();
    expect(suggestEmail("ana@mail.com")).toBeNull();
    expect(suggestEmail("ana@yahoo.com.ar")).toBeNull();
    expect(suggestEmail("ana@miempresa.do")).toBeNull();
    expect(suggestEmail("ana")).toBeNull();
  });
});

describe("isValidEmail", () => {
  it("valida lo básico", () => {
    expect(isValidEmail("ana@gmail.com")).toBe(true);
    expect(isValidEmail(" ana@gmail.com ")).toBe(true);
    expect(isValidEmail("ana@gmail")).toBe(false);
    expect(isValidEmail("ana gmail.com")).toBe(false);
  });
});
