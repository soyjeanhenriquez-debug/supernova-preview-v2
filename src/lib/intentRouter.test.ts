import { beforeEach, describe, expect, it, vi } from "vitest";
import { planFor, routeIntent, startIntent, takeReelUrl, REEL_URL_KEY, TO_CAROUSEL_KEY, setClipPrompt, takeClipPrompt } from "./intentRouter";
import { REEL_TO_CAROUSEL_KEY } from "./carousel";
import { SEED_KEY, takeSeed } from "./creativeSeed";
import { ADMIN_ONLY_PAGES } from "./features";

const all = () => true;
const route = (t: string, via: "creador" | "marketer" = "marketer", canSee: (p: string) => boolean = all) => routeIntent(t, { via, canSee });
const PROFILE = { product: "Ebook de recetas para congelar", who: "Mamás que trabajan", promise: "Cocinar una vez para toda la semana", price: "US$9" };

describe("¿Qué quieres crear hoy? · entiende la frase", () => {
  it.each([
    ["Quiero un reel como este https://www.instagram.com/reel/ABC123xyz/", "reel_enlace", "concara"],
    ["este carrusel https://www.instagram.com/p/DXy12abcd/", "carrusel_enlace", "carrusel"],
    ["https://www.tiktok.com/@x/video/123", "otro_enlace", "concara"],
    ["quiero un reel como este que vi ayer", "recrear_reel", "concara"],
    ["Modelar un video de otro creador", "recrear_reel", "concara"],
    ["Subtítulos para mi video", "mi_video", "concara"],
    ["miniaturas para mi canal", "miniatura", "miniaturas"],
    ["Un carrusel sobre 5 errores al invertir", "carrusel", "carrusel"],
    ["un video para YouTube de finanzas", "youtube", "creadoryt"],
    ["texto animado con mi guion", "motion", "motion"],
    ["vender sin mostrar mi cara", "sin_cara", "personaje"],
    ["fotos de mi producto", "foto_producto", "fotoproducto"],
    ["una selfie con mi producto", "foto_ugc", "fotosugc"],
    ["la página de ventas de mi curso", "pagina", "paginas"],
    ["correos para mis clientes", "correos", "correos"],
    ["guion de VSL", "vsl", "vsl"],
    ["Quiero contar mi historia", "historia", "reels"],
    ["ganchos para tiktok", "ganchos", "ganchos"],
    ["un guion para mañana", "guion", "reels"],
    ["Un video anuncio para mi ebook", "video", "videoanuncio"],
    ["un video cinematográfico", "video", "videoanuncio"],
    ["Imágenes para vender mi curso", "imagen", "creativos"],
    ["¿qué vender esta semana?", "que_vender", "ofertas"],
    ["a qué precio lo vendo", "precio", "precio"],
  ])("«%s» → %s (%s)", (text, rule, tool) => {
    const p = route(text)!;
    expect(p.rule).toBe(rule);
    expect(p.tool.id).toBe(tool);
  });

  it("sin pista de la pieza: lo de su vía", () => {
    expect(route("algo para mi negocio de uñas", "marketer")!.tool.id).toBe("creativos");
    expect(route("algo para mi negocio de uñas", "creador")!.tool.id).toBe("reels");
  });

  it("frase vacía o muy corta: no propone nada", () => {
    expect(route("")).toBeNull();
    expect(route("  a ")).toBeNull();
  });

  it("siempre da alternativas distintas de la principal", () => {
    const p = route("un carrusel de recetas")!;
    expect(p.alternatives.length).toBeGreaterThan(0);
    expect(p.alternatives.map(a => a.id)).not.toContain(p.tool.id);
  });

  it("no lleva a pantallas que esa cuenta no ve: pasa a la siguiente que sí", () => {
    const client = (page: string) => !ADMIN_ONLY_PAGES.has(page);
    for (const t of ["vender sin mostrar mi cara", "un carrusel", "un video", "fotos de mi producto", "mi historia"]) {
      const p = route(t, "creador", client);
      if (p) expect(client(p.tool.key)).toBe(true);
    }
    const none = route("un carrusel", "creador", () => false);
    expect(none).toBeNull();
  });

  it("el enlace no queda dentro de la idea", () => {
    const p = route("mi versión de https://www.instagram.com/reel/ABC123xyz/ pero de recetas")!;
    expect(p.idea).not.toMatch(/https?:/);
    expect(p.reelUrl).toBe("https://www.instagram.com/reel/ABC123xyz/");
  });
});

describe("¿Qué quieres crear hoy? · nunca gasta", () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear(); window.location.hash = ""; vi.spyOn(window, "scrollTo").mockImplementation(() => undefined); });

  it("la semilla va SIN autostart, con la ficha y la idea como gancho de referencia", () => {
    const nav = vi.fn();
    startIntent(route("Un carrusel sobre 5 errores al congelar")!, PROFILE, nav);
    expect(window.location.hash).toBe("#/carrusel");
    expect(JSON.parse(sessionStorage.getItem(SEED_KEY)!).autostart).toBeUndefined();
    const seed = takeSeed("carrusel")!;
    expect(seed.product).toBe(PROFILE.product);
    expect(seed.who).toBe(PROFILE.who);
    expect(seed.hook).toBe("Un carrusel sobre 5 errores al congelar");
    expect(seed.autostart).toBeUndefined();
    expect(nav).not.toHaveBeenCalled();
  });

  it("sin ficha, la idea hace de producto", () => {
    startIntent(route("imágenes para mi taller de velas")!, { product: "", who: "", promise: "" }, vi.fn());
    expect(takeSeed("creativos")!.product).toBe("imágenes para mi taller de velas");
  });

  it("un reel de Instagram llega precargado a Analiza un Reel (y se borra al leerlo)", () => {
    startIntent(route("como este https://www.instagram.com/reel/ABC123xyz/")!, PROFILE, vi.fn());
    expect(window.location.hash).toBe("#/con-tu-cara/reel");
    expect(sessionStorage.getItem(REEL_URL_KEY)).toBeTruthy();
    expect(takeReelUrl()).toBe("https://www.instagram.com/reel/ABC123xyz/");
    expect(takeReelUrl()).toBe("");
  });

  it("los generadores reciben la idea como texto, sin generar", () => {
    const nav = vi.fn();
    startIntent(route("la página de ventas de mi curso")!, PROFILE, nav);
    expect(nav).toHaveBeenCalledWith("Generadores");
    expect(JSON.parse(localStorage.getItem("supernova_generator_prefill")!)).toEqual({ generator: "landing-copy", text: "la página de ventas de mi curso" });
  });

  it("ir a una alternativa conserva la idea", () => {
    const p = planFor("videoanuncio", route("un carrusel de recetas")!);
    startIntent(p, PROFILE, vi.fn());
    expect(window.location.hash).toBe("#/video-anuncio");
    expect(takeSeed("video_anuncio")!.hook).toBe("un carrusel de recetas");
  });

  it("un carrusel de Instagram llega puesto a Modelar uno que ya funciona", () => {
    expect(TO_CAROUSEL_KEY).toBe(REEL_TO_CAROUSEL_KEY);
    startIntent(route("https://www.instagram.com/p/DXy12abcd/")!, PROFILE, vi.fn());
    expect(window.location.hash).toBe("#/carrusel");
    expect(JSON.parse(localStorage.getItem(TO_CAROUSEL_KEY)!).url).toBe("https://www.instagram.com/p/DXy12abcd/");
    expect(sessionStorage.getItem(SEED_KEY)).toBeNull();
  });

  it("el prompt se lee una sola vez y no genera nada", () => {
    setClipPrompt("  una mujer abre su laptop  ");
    expect(takeClipPrompt()).toBe("una mujer abre su laptop");
    expect(takeClipPrompt()).toBe("");
  });

  it("un enlace raro guardado a mano no se precarga", () => {
    sessionStorage.setItem(REEL_URL_KEY, "javascript:alert(1)");
    expect(takeReelUrl()).toBe("");
  });
});
