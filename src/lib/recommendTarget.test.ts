import { describe, it, expect } from "vitest";
import {
  recommendTarget, alternativesFor, targetInfo, firstLine, daysEvidence, adMediaKind,
  ideaFromOffer, ideaFromAd, ideaFromYt, fmtNum,
} from "@/lib/recommendTarget";
import { SEED_TARGETS } from "@/lib/creativeSeed";

describe("recommendTarget", () => {
  it("Radar con video → video anuncio", () => {
    expect(recommendTarget({ source: "radar", media: "video" }).target).toBe("video_anuncio");
  });
  it("Radar con imagen → creativos 4:5", () => {
    const r = recommendTarget({ source: "radar", media: "image" });
    expect(r).toMatchObject({ target: "creativos", aspect: "4:5" });
    expect(r.reason).toMatch(/imagen/);
  });
  it("Radar sin saber el formato → creativos", () => {
    expect(recommendTarget({ source: "radar" }).target).toBe("creativos");
    expect(recommendTarget({ source: "radar", media: null }).target).toBe("creativos");
  });
  it("Oferta → creativos", () => {
    expect(recommendTarget({ source: "oferta" }).target).toBe("creativos");
  });
  it("Nicho de YouTube → youtube (16:9 largo, 9:16 Short)", () => {
    expect(recommendTarget({ source: "nicho_yt" })).toMatchObject({ target: "youtube", aspect: "16:9" });
    expect(recommendTarget({ source: "nicho_yt", kind: "short" })).toMatchObject({ target: "youtube", aspect: "9:16" });
  });
  it("Side hustle UGC → anuncio en video (UGC con presentador sigue cerrado)", () => {
    expect(recommendTarget({ source: "side_hustle", hustle: "ugc" }).target).toBe("video_anuncio");
  });
  it("Side hustle faceless → youtube", () => {
    expect(recommendTarget({ source: "side_hustle", hustle: "faceless" }).target).toBe("youtube");
  });
  it("Side hustle marca personal → carrusel", () => {
    expect(recommendTarget({ source: "side_hustle", hustle: "marca" }).target).toBe("carrusel");
  });
  it("Side hustle low ticket, kits y local → creativos", () => {
    for (const h of ["low_ticket", "kits", "local"] as const) expect(recommendTarget({ source: "side_hustle", hustle: h }).target).toBe("creativos");
  });
  it("Manual → creativos", () => {
    expect(recommendTarget({ source: "manual" }).target).toBe("creativos");
  });
  it("toda razón es una frase corta en español", () => {
    const inputs = [
      { source: "radar", media: "video" }, { source: "oferta" }, { source: "nicho_yt", kind: "short" },
      { source: "side_hustle", hustle: "ugc" }, { source: "manual" },
    ] as const;
    for (const i of inputs) {
      const r = recommendTarget(i);
      expect(r.reason.length).toBeGreaterThan(10);
      expect(r.reason.length).toBeLessThanOrEqual(100);
      expect(r.reason).not.toMatch(/gan(a|ar|arás)\s+(US\$|\$|dinero)/i);
    }
  });
});

describe("alternativesFor / targetInfo", () => {
  it("siempre 3 alternativas, sin la recomendada", () => {
    for (const t of ["creativos", "video_anuncio", "youtube", "carrusel", "video_ugc"] as const) {
      const alts = alternativesFor(t, "oferta");
      expect(alts).toHaveLength(3);
      expect(alts).not.toContain(t);
      expect(alts).not.toContain("video_ugc"); // cerrado en el servidor: nunca como alternativa
    }
    expect(alternativesFor("youtube", "nicho_yt")).toEqual(["miniaturas", "video_anuncio", "carrusel"]);
  });
  it("costos del plan: creativos 18, carrusel 30, video anuncio 165, UGC 110, YouTube guion 30", () => {
    expect(targetInfo("creativos").credits).toBe(18);
    expect(targetInfo("carrusel").credits).toBe(30);
    expect(targetInfo("video_anuncio").credits).toBe(165);
    expect(targetInfo("video_ugc").credits).toBe(110);
    expect(targetInfo("youtube")).toMatchObject({ credits: 30, costLabel: "guion 30" });
  });
  it("cada pieza tiene nombre y costo positivo", () => {
    for (const t of SEED_TARGETS) {
      const i = targetInfo(t);
      expect(i.label).toBeTruthy();
      expect(i.credits).toBeGreaterThan(0);
    }
  });
});

describe("ayudantes", () => {
  it("firstLine toma la primera frase útil y recorta a 140", () => {
    expect(firstLine("\n¡Hola!\nAprende inglés en casa. Sin clases.")).toBe("¡Hola!");
    expect(firstLine("Aprende inglés en casa. Sin clases.")).toBe("Aprende inglés en casa.");
    expect(firstLine("x".repeat(300)).length).toBeLessThanOrEqual(140);
    expect(firstLine(null)).toBe("");
  });
  it("daysEvidence solo con un dato real", () => {
    expect(daysEvidence(214)).toBe("214 días pagando anuncios");
    expect(daysEvidence(1)).toBe("1 día pagando anuncios");
    expect(daysEvidence(0)).toBeUndefined();
    expect(daysEvidence(null)).toBeUndefined();
  });
  it("adMediaKind lee la caché de la vista previa", () => {
    const store = new Map<string, string>([
      ["sn:ad-prev:1234567", JSON.stringify({ videoUrl: "https://v", imageUrl: null })],
      ["sn:ad-prev:7654321", JSON.stringify({ imageUrl: "https://i" })],
    ]);
    const s = { getItem: (k: string) => store.get(k) ?? null };
    expect(adMediaKind("https://www.facebook.com/ads/library/?id=1234567", s)).toBe("video");
    expect(adMediaKind("https://www.facebook.com/ads/library/?id=7654321", s)).toBe("image");
    expect(adMediaKind("https://www.facebook.com/ads/library/?id=9999999", s)).toBeNull();
    expect(adMediaKind("https://x.com", s)).toBeNull();
  });
});

describe("semillas desde cada fuente", () => {
  const offer = {
    id: "o1", product_name: "Guía de inglés", sample_title: null, page_name: "Inglés Ya", sample_body: "Habla inglés en 30 días.\nCompra ya",
    target_audience: null, mechanism: null, why_wins: "Precio bajo y promesa clara", price_hint: "US$9", days_active: 214,
  };
  it("oferta: completa quién y promesa si faltan, gancho como referencia y evidencia real", () => {
    const d = ideaFromOffer(offer);
    expect(d).toMatchObject({ source: "oferta", product: "Guía de inglés", price: "US$9", evidence: "214 días pagando anuncios", refId: "o1" });
    expect(d.who).toContain("Guía de inglés");
    expect(d.promise).toBe("Precio bajo y promesa clara");
    expect(d.hook).toBe("Habla inglés en 30 días.");
  });
  it("anuncio: título como producto y días activos como evidencia", () => {
    const d = ideaFromAd({ id: "db-1", title: "Curso de uñas", body: "Aprende a hacer uñas acrílicas desde casa. Inscríbete", pageName: "Nails", daysActive: 120 });
    expect(d).toMatchObject({ source: "radar", product: "Curso de uñas", evidence: "120 días pagando anuncios" });
    expect(d.hook).toBe("Aprende a hacer uñas acrílicas desde casa.");
  });
  it("YouTube: ytRef y formato vertical para Shorts", () => {
    const d = ideaFromYt({ id: "abcdefghijk", title: "Los romanos", seconds: 50, views: 120000 }, "Historia", true);
    expect(d.aspect).toBe("9:16");
    expect(d.ytRef).toEqual({ id: "abcdefghijk", title: "Los romanos", seconds: 50 });
    expect(d.evidence).toMatch(/vistas en YouTube/);
  });
});

describe("fmtNum", () => {
  it("punto de miles siempre", () => {
    expect(fmtNum(2000)).toBe("2.000");
    expect(fmtNum(165)).toBe("165");
    expect(fmtNum(1234567)).toBe("1.234.567");
    expect(fmtNum(-1500)).toBe("-1.500");
  });
});
