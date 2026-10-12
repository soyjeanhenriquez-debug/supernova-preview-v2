/**
 * R2-15 · El asistente no ofrece lo que el cliente no tiene (12-oct-2026).
 * Se toma el prompt REAL que el asistente manda al servidor para un cliente (no admin) y se revisa:
 *  - Mercado y Media Studio solo pueden aparecer como "no disponibles / más adelante";
 *  - el avatar que habla (Media Studio o lip-sync) no se presenta con precio;
 *  - lo que sí tiene (Ofertas, Radar, Video con IA) y sus precios siguen ahí.
 * Si el SYSTEM_PROMPT vuelve a describir Mercado o Media Studio como disponibles, esto falla.
 */
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";

const admin = vi.hoisted(() => ({ isAdmin: false }));
vi.mock("@/hooks/useIsAdmin", () => ({ useIsAdmin: () => ({ isAdmin: admin.isAdmin, loading: false }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } },
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

import { HelpAssistant, ASK_ASSISTANT_EVENT } from "./HelpAssistant";
import { CREDIT_COSTS } from "@/hooks/useCredits";

/** Abre el asistente, manda una pregunta y devuelve el systemPrompt que viajó al servidor. */
async function sentPrompt(asAdmin = false): Promise<string> {
  admin.isAdmin = asAdmin;
  localStorage.clear();
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response("{}", { status: 500 }));
  vi.stubGlobal("fetch", fetchMock);
  const { container, unmount } = render(<HelpAssistant />);
  act(() => { window.dispatchEvent(new CustomEvent(ASK_ASSISTANT_EVENT, { detail: { text: "¿Qué puedo hacer?" } })); });
  const ta = container.querySelector("textarea")!;
  await act(async () => { fireEvent.keyDown(ta, { key: "Enter" }); });
  const call = fetchMock.mock.calls.find(c => String(c[0]).includes("/functions/v1/ai-chat"));
  unmount();
  vi.unstubAllGlobals();
  expect(call, "el asistente no llamó a ai-chat").toBeDefined();
  return JSON.parse(String((call as unknown as [string, RequestInit])[1].body)).systemPrompt as string;
}

const NOT_AVAILABLE = /no est[áa]n? disponibles?|todav[íi]a no|a[úu]n no|m[áa]s adelante|en pausa|no (los|las|lo|la) (recomiendes|ofrezcas)|no est[áa]n? abiert[oa]s?|pronto/i;
const sentences = (s: string) => s.split(/(?<=[.!?])\s+|\n+/).map(x => x.trim()).filter(Boolean);
/** Frases que nombran algo de esta lista sin decir que no está disponible. */
const offered = (prompt: string, name: RegExp) => sentences(prompt).filter(x => name.test(x) && !NOT_AVAILABLE.test(x));

describe("R2 · HelpAssistant: nada en pausa como disponible", () => {
  it("para un cliente, el prompt avisa que Mercado y Media Studio no están disponibles", async () => {
    const p = await sentPrompt(false);
    const paused = sentences(p).filter(x => /NO están disponibles|EN PAUSA/.test(x));
    expect(paused.some(x => /\bMercado\b/.test(x)), "Mercado sin aviso de pausa").toBe(true);
    expect(paused.some(x => /Media Studio/.test(x)), "Media Studio sin aviso de pausa").toBe(true);
  });

  it("lo que sí tiene sigue con su precio (Radar, Video con IA)", async () => {
    const p = await sentPrompt(false);
    expect(p).toMatch(/Radar/);
    expect(p).toMatch(/Ofertas/);
    expect(p).toContain(`${CREDIT_COSTS.vid_mini_5} créditos`);
  });

  it("al admin se le manda sin el aviso de pausa", async () => {
    const p = await sentPrompt(true);
    expect(p).not.toMatch(/NO están disponibles/);
  });

  // Fallo real (12-oct-2026). Dueño probable: agente del asistente / textos de ayuda (R2 "HelpAssistant").
  // El SYSTEM_PROMPT describe "5b. **Mercado**" y "9. **Media Studio**" (con packs en US$) como secciones
  // normales, y la Mándala dice "Los guiones de video se llevan a Media Studio con un botón". El aviso de
  // pausa va al final, así que la IA recibe dos órdenes que chocan. Arreglo en el reporte R2-15.
  // Arreglado por R2-09 (12-oct-2026): guía reescrita; lo pausado solo sale en la lista "EN PAUSA".
  it("Mercado y Media Studio no aparecen como disponibles en ninguna frase", async () => {
    const p = await sentPrompt(false);
    expect(offered(p, /\bMercado\b|Media Studio|Media Credits/)).toEqual([]);
  });

  // Fallo real (12-oct-2026). Mismo dueño. "el avatar habla con voz real y la boca sincronizada …:
  // cuesta 530 créditos hasta 15 s, 1.060 hasta 30 s y 1.590 hasta 45 s" (y Media Studio "hablado por
  // un avatar de IA … 10 por video"): un avatar que habla, con precio, que el cliente no tiene abierto.
  // Arreglado por R2-09 (12-oct-2026): el avatar que habla ya no tiene precio en la guía.
  it("el avatar que habla no se ofrece con precio", async () => {
    const p = await sentPrompt(false);
    const priced = sentences(p).filter(x => /avatar|boca sincronizada|lip ?sync/i.test(x) && /\d[\d.]*\s*(cr[ée]ditos|por video|Media Credits)|\bcuesta\b/i.test(x) && !NOT_AVAILABLE.test(x));
    expect(priced).toEqual([]);
  });

  it("el prompt no le dice al cliente cuántos dólares vale un crédito", async () => {
    const p = await sentPrompt(false);
    expect(p).not.toMatch(/(por|cada|1|un)\s+cr[ée]dito[^.\n]{0,20}(US\$|\$|d[óo]lar)|(US\$|\$)\s*[\d.,]+\s*(por|el|cada|\/)\s*cr[ée]dito/i);
  });
});
