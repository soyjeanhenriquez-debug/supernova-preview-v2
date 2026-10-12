import { describe, expect, it } from "vitest";
import { scrubUrl } from "./analytics";

describe("scrubUrl: nada de tokens hacia PostHog", () => {
  it("borra el token de un enlace de acceso por correo", () => {
    expect(scrubUrl("https://supernova-six-eta.vercel.app/#access_token=eyJabc&refresh_token=xyz&type=magiclink"))
      .toBe("https://supernova-six-eta.vercel.app/#[oculto]");
  });
  it("borra los errores de enlace caducado", () => {
    expect(scrubUrl("https://x.app/#error=access_denied&error_code=otp_expired")).toBe("https://x.app/#[oculto]");
  });
  it("borra ?t= (baja de correos) y ?code=", () => {
    expect(scrubUrl("https://x.app/unsub?t=secreto123")).toBe("https://x.app/unsub?t=[oculto]");
    expect(scrubUrl("https://x.app/app?code=abc&checkout=success")).toBe("https://x.app/app?code=[oculto]&checkout=success");
  });
  it("deja intactas las pantallas normales", () => {
    expect(scrubUrl("https://x.app/app#/ofertas")).toBe("https://x.app/app#/ofertas");
    expect(scrubUrl("https://x.app/app#/mi-negocio")).toBe("https://x.app/app#/mi-negocio");
  });
});

describe("Prueba 9 de 10 (R2-10)", () => {
  it("cleanProps: nunca salen textos escritos, correos ni nombres", async () => {
    const { cleanProps } = await import("./analytics");
    expect(cleanProps({ text: "¿cómo vendo?", email: "a@b.co", nombre: "Ana", card: "inicio", n: 3 })).toEqual({ card: "inicio", n: 3 });
    expect(cleanProps({ origen: "x@y.com" })).toEqual({});
    expect(cleanProps({ origen: "a".repeat(100) })?.origen).toHaveLength(64);
    expect(cleanProps(undefined)).toBeUndefined();
  });

  it("emitSoftRecharge: solo con saldo < 300, con el detalle que espera R2-03", async () => {
    const { emitSoftRecharge, onSoftRecharge, SOFT_RECHARGE_EVENT } = await import("./analytics");
    expect(SOFT_RECHARGE_EVENT).toBe("sn:soft-recharge");
    const got: unknown[] = [];
    const off = onSoftRecharge(d => got.push(d));
    expect(emitSoftRecharge(1200, "carrusel")).toBe(false);
    expect(emitSoftRecharge(300, "carrusel")).toBe(false);
    expect(emitSoftRecharge(120, "mi-version")).toBe(true);
    off();
    expect(emitSoftRecharge(10, "video")).toBe(true); // ya nadie escucha
    expect(got).toEqual([{ balance: 120, tool: "mi-version" }]);
  });

  it("notePlanState: plan_pagado solo al pasar de prueba a pago; notePurchased: solo si suben", async () => {
    localStorage.clear();
    const { identifyUser, notePlanState, notePurchased, resetAnalytics } = await import("./analytics");
    expect(notePlanState("trialing")).toBe(false); // sin sesión no anota nada
    identifyUser({ id: "u1" }, false);
    expect(notePlanState("trialing")).toBe(false);
    expect(notePlanState("trialing")).toBe(false);
    expect(notePlanState("active")).toBe(true);
    expect(notePlanState("active")).toBe(false);
    expect(notePurchased(0)).toBe(0);   // primera vez: solo se recuerda
    expect(notePurchased(500)).toBe(500);
    expect(notePurchased(300)).toBe(0); // gastó: no es recarga
    resetAnalytics();
    expect(notePurchased(5000)).toBe(0);
  });

  it("el embudo tiene los pasos de la misión 10 en orden", async () => {
    const { FUNNEL_9DE10 } = await import("./analytics");
    expect(FUNNEL_9DE10.map(s => s.event)).toEqual([
      "portada_vista", "prueba_click", "cuenta_creada", "inicio_abierto", "mi_version_click", "mi_version_lista",
      "pieza_creada", "te_sirvio", "pago_click", "plan_pagado", "recarga_click", "recarga_hecha",
    ]);
  });
});
