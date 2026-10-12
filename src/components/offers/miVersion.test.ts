import { describe, it, expect } from "vitest";
import {
  PRICE_TOKEN, buildOfferFacts, fillPrice, fmtUsd, parseAmount, receiptPrice, receiptToText, sellCountry, selectorIso,
  whatsappShareUrl, NEXT_STEPS, type MiVersionData,
} from "./miVersion";
import { needsReplaceConfirm } from "./useSellOffer";
import { defaultOfferFilter, LANG_ES_FILTER, type Offer } from "@/lib/offers";
import type { OfferIntel } from "@/lib/offerIntel";
import type { DemoAd } from "@/lib/demo-winning-ads";
import * as server from "../../../supabase/functions/oraculo-generate/miVersion";

const offer = (p: Partial<Offer> = {}): Offer => ({
  id: "o1", page_id: "p1", market: "CO", page_name: "El otro romulo", ads_count: 20, active_ads: 16, days_active: 100,
  duplicate_count: 3, winner_score: 80, tier: "mega", sample_ad_id: null, sample_title: "Vivir de tu conocimiento",
  sample_body: "Convierte lo que sabes en un producto digital", sample_ad_url: null, first_seen: null, last_seen: null,
  product_name: "Vivir de tu conocimiento", niche: "dinero_negocios", offer_type: "infoproducto", business_model: "pago_unico",
  language: "es", price_hint: null, mechanism: "Guía paso a paso para empaquetar tu oficio", why_wins: null,
  target_audience: "Profesionales que quieren vender lo que saben", copy_score: 5, enriched_at: null, ...p,
});
const intel = (p: Partial<OfferIntel> = {}): OfferIntel => ({
  offer_id: "o1", landing_url: null, landing_domain: null, landing_title: null, checkout_url: null, checkout_platform: "Hotmart",
  funnel_type: null, price_text: "USD 17", checkout_data: null, verdict: null, status: "ready", verdict_at: null, updated_at: "", ...p,
});
const ad: DemoAd = {
  id: "offer-o1", pageId: "p1", pageName: "El otro romulo", title: "Vivir de tu conocimiento", body: "Convierte lo que sabes",
  daysActive: 100, duplicates: 16, score: 80, tier: "mega", offerType: "infoproducto", market: "LATAM", marketLabel: "CO",
  flag: "🇨🇴", lang: "es", adUrl: "", vertical: undefined,
} as DemoAd;

const mi: MiVersionData = {
  name: "Tu saber, tu negocio", promise: "Aprende a convertir tu oficio en una guía que se vende por WhatsApp.",
  who: "Profesionales que empiezan de cero", includes: ["La guía paso a paso", "Entrega por WhatsApp"],
  why_it_sells: ["Lleva 100 días pagando anuncios"],
  ad: { hook: "¿Sabes hacer algo que otros pagarían?", primary_text: "Texto del anuncio. Escríbeme por WhatsApp.", headline: "Vende lo que sabes", cta: "Enviar mensaje" },
  image: { prompt: "Una persona en su escritorio", text: "Vende lo que sabes" },
  whatsapp: `Te cuento: la guía cuesta ${PRICE_TOKEN}. Pagas por [tu número o cuenta].`,
};

describe("Mi versión · país y moneda", () => {
  it("convierte el país de user_age_country (ISO) a la moneda que sabemos usar", () => {
    expect(sellCountry("DO")).toMatchObject({ code: "RD", symbol: "RD$", name: "República Dominicana" });
    expect(sellCountry("co").code).toBe("CO");
    expect(sellCountry("PE")).toMatchObject({ code: null, symbol: "US$", name: "Perú" });
    expect(sellCountry(null)).toMatchObject({ iso: "OTRO", symbol: "US$" });
    expect(selectorIso("PE")).toBe("OTRO");
    expect(selectorIso("mx")).toBe("MX");
  });
  it("lee precios escritos como los escribe un latino", () => {
    expect(parseAmount("1.500")).toBe(1500);
    expect(parseAmount("RD$ 68.000")).toBe(68000);
    expect(parseAmount("27,90")).toBe(27.9);
    expect(parseAmount("1.200,50")).toBe(1200.5);
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("0")).toBeNull();
  });
  it("formatea dólares en español", () => {
    expect(fmtUsd(17)).toBe("US$17");
    expect(fmtUsd(27.9)).toBe("US$27,90");
    expect(fmtUsd(1500)).toBe("US$1.500");
  });
});

describe("Mi versión · precio sin inventar", () => {
  it("usa el precio REAL de la oferta, en la moneda de la persona, con su CPA máximo", () => {
    const p = receiptPrice(offer(), intel(), sellCountry("DO"));
    expect(p.kind).toBe("ready");
    if (p.kind !== "ready") return;
    expect(p.source).toBe("original");
    expect(p.local).toBe("RD$1.020"); // 17 × 60
    expect(p.originalText).toBe("USD 17");
    expect(p.cpaLocal).toBe("RD$890"); // (17 × 0,9 − 0,4) × 60 = 894 → redondeo de 10
  });
  it("sin precio en los datos: pide uno y la sugerencia del veredicto solo como sugerencia", () => {
    const i = intel({ price_text: null, verdict: { suggested_ticket: "$17 USD" } as OfferIntel["verdict"] });
    const p = receiptPrice(offer(), i, sellCountry("CO"));
    expect(p).toEqual({ kind: "missing", originalText: null, suggestion: "$17 USD" });
    expect(fillPrice(mi.whatsapp, p)).toContain("[tu precio]");
    expect(fillPrice(mi.whatsapp, p)).not.toContain(PRICE_TOKEN);
  });
  it("el precio que escribe la persona manda", () => {
    const p = receiptPrice(offer(), intel(), sellCountry("CO"), 70000);
    expect(p).toMatchObject({ kind: "ready", source: "tuyo", local: "COL$70.000" });
    const usd = receiptPrice(null, null, sellCountry("US"), 27.9);
    expect(usd).toMatchObject({ kind: "ready", local: "US$27,90" });
  });
  it("pone el precio en el WhatsApp y en el texto para copiar", () => {
    const p = receiptPrice(offer(), intel(), sellCountry("DO"));
    expect(fillPrice(mi.whatsapp, p)).toBe("Te cuento: la guía cuesta RD$1.020. Pagas por [tu número o cuenta].");
    const all = receiptToText(mi, p, sellCountry("DO"));
    expect(all).toContain("MI VERSIÓN: Tu saber, tu negocio");
    expect(all).toContain("RD$1.020");
    expect(all).toContain("CPA máximo");
    expect(all).not.toContain(PRICE_TOKEN);
    expect(all).not.toMatch(/clon/i);
  });
});

describe("Mi versión · datos para la IA y siguiente paso", () => {
  it("manda los datos reales de UNA oferta y avisa que no use su marca", () => {
    const f = buildOfferFacts(ad, offer(), intel());
    expect(f.length).toBeGreaterThan(80);
    expect(f).toContain("Días pagando anuncios: 100");
    expect(f).toContain("Anunciante (no usar su nombre): El otro romulo");
    expect(f).toContain("Guía paso a paso");
    expect(f).not.toContain("USD 17"); // el precio no va a la IA: lo pone la app
  });
  it("funciona sin oferta (Radar) y sigue pasando el mínimo del servidor", () => {
    expect(buildOfferFacts({ ...ad, body: "" }).length).toBeGreaterThanOrEqual(80);
  });
  it("siguiente paso: carrusel, video, página de ventas y mes de contenido, con su costo", () => {
    expect(NEXT_STEPS.map((s) => s.id)).toEqual(["carrusel", "video", "pagina", "contenido"]);
    for (const s of NEXT_STEPS) expect(s.cost).toMatch(/\d+ créditos/);
    expect(NEXT_STEPS.find((s) => s.id === "pagina")?.generator).toBe("landing-copy");
  });
  it("abre WhatsApp con el mensaje", () => {
    expect(whatsappShareUrl("Hola ¿qué tal?")).toBe("https://wa.me/?text=Hola%20%C2%BFqu%C3%A9%20tal%3F");
  });
});

describe("Vender esto sin window.confirm", () => {
  it("solo pregunta si la ficha tiene OTRO producto", () => {
    expect(needsReplaceConfirm("", "A")).toBe(false);
    expect(needsReplaceConfirm("Mi guía", "mi guía ")).toBe(false);
    expect(needsReplaceConfirm("Mi guía", "Otra cosa")).toBe(true);
  });
});

describe("Ofertas · mercado según el país", () => {
  it("español para LATAM, España y EE. UU.; Brasil a su mercado; el resto, todas", () => {
    expect(defaultOfferFilter("DO")).toBe(LANG_ES_FILTER);
    expect(defaultOfferFilter("co")).toBe(LANG_ES_FILTER);
    expect(defaultOfferFilter("US")).toBe(LANG_ES_FILTER);
    expect(defaultOfferFilter("BR")).toBe("BR");
    expect(defaultOfferFilter("DE")).toBe("all");
    expect(defaultOfferFilter(null)).toBe("all");
  });
});

describe("Servidor · normalizeMiVersion (oraculo-generate)", () => {
  const raw = (o: Record<string, unknown>) => "```json\n" + JSON.stringify({ ...mi, ...o }) + "\n```";
  it("mismo contrato que el cliente", () => {
    expect(server.PRICE_TOKEN).toBe(PRICE_TOKEN);
    const d = server.normalizeMiVersion(raw({}), "El otro romulo");
    expect(d).not.toBeNull();
    expect(Object.keys(d!).sort()).toEqual(Object.keys(mi).sort());
  });
  it("cambia cualquier precio que escriba la IA por {PRECIO} y quita la marca del nombre", () => {
    const d = server.normalizeMiVersion(raw({ name: "Vivir de tu conocimiento de El otro romulo", whatsapp: "Cuesta US$27 o 79.000 COP." }), "El otro romulo")!;
    expect(d.name).toBe("Vivir de tu conocimiento");
    expect(d.whatsapp).not.toMatch(/27|79/);
    expect(d.whatsapp).toContain(PRICE_TOKEN);
  });
  it("si el WhatsApp no trae el precio, se lo agrega", () => {
    const d = server.normalizeMiVersion(raw({ whatsapp: "Escríbeme y te paso los datos." }), null)!;
    expect(d.whatsapp.endsWith(`Precio: ${PRICE_TOKEN}`)).toBe(true);
  });
  it("devuelve null si falta lo esencial o no es JSON (el servidor reembolsa)", () => {
    expect(server.normalizeMiVersion("no es json", null)).toBeNull();
    expect(server.normalizeMiVersion(raw({ name: "" }), null)).toBeNull();
    expect(server.normalizeMiVersion(raw({ ad: {} }), null)).toBeNull();
  });
  it("el prompt pide {PRECIO}, prohíbe inventar precios y nunca dice clonar", () => {
    const p = server.miVersionPrompt("datos", { label: "Colombia (COP)", methods: "Nequi" });
    expect(p).toContain(PRICE_TOKEN);
    expect(p).toContain("Nequi");
    expect(p).toMatch(/Nunca escribas un precio/);
    expect(server.MI_VERSION_SYSTEM).not.toMatch(/clon/i);
  });
});
