import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VideoGuia } from "./VideoGuia";
import { takeMontaje, takeReelStudio } from "@/lib/intentHandoff";

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/toolEvents", () => ({ toolEvent: vi.fn() }));
vi.mock("@/hooks/useCredits", () => ({ CREDIT_COSTS: { motion_style: 40 } }));
vi.mock("@/components/HelpAssistant", () => ({ ASK_ASSISTANT_EVENT: "supernova:ask-assistant" }));

const click = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const subir = (file: File) => fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
const TEXTO = "Si trabajas todo el día, lo último que necesitas al llegar a casa es empezar otra jornada en la cocina.";
const guia = (p: Partial<Parameters<typeof VideoGuia>[0]> = {}) => render(<VideoGuia onModo={vi.fn()} onEstilo={vi.fn()} {...p} />);

describe("Guía «¿Qué video quieres hacer?»", () => {
  beforeEach(() => { localStorage.clear(); window.location.hash = ""; takeReelStudio(); });

  it("caso Cindy: video de ejemplo + su texto → «uno parecido» va a Reel Studio con los dos", () => {
    guia();
    click(/Un video para redes/);
    expect(screen.getByText("¿Qué tienes ya?")).toBeTruthy();
    click(/Un video de ejemplo y mi texto/);
    expect(screen.getByText("Paso 3 de 5")).toBeTruthy();
    const file = new File(["x"], "recetas.mp4", { type: "video/mp4" });
    subir(file);
    expect(screen.getByText("Pega tu texto")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Tu texto"), { target: { value: TEXTO } });
    click(/^Seguir/);
    expect(screen.getByText("¿Qué quieres hacer con este video?")).toBeTruthy();
    click(/Sí, hacer uno parecido/);
    expect(window.location.hash).toBe("#/con-tu-cara/reel-ia");
    expect(takeReelStudio()).toEqual({ file, texto: TEXTO });
    expect(takeReelStudio()).toBeNull(); // se lee una sola vez
  });

  it("solo un video de ejemplo: «solo copiar su estilo» lo manda a Motion graphics con el precio a la vista", () => {
    const onEstilo = vi.fn();
    guia({ onEstilo });
    click(/Un video para anunciar/);
    click(/Solo un video de ejemplo/);
    const file = new File(["x"], "anuncio.mp4", { type: "video/mp4" });
    subir(file);
    click(/Solo copiar su estilo · 40 créditos/);
    expect(onEstilo).toHaveBeenCalledWith(file, undefined);
  });

  it("solo su texto: «texto animado» lleva a Motion graphics con el texto puesto", () => {
    const onModo = vi.fn();
    guia({ onModo });
    click(/Un video para redes/);
    click(/Solo mi texto/);
    fireEvent.change(screen.getByLabelText("Tu texto"), { target: { value: TEXTO } });
    click(/^Seguir/);
    expect(screen.getByText("¿Cómo quieres que se vea tu texto?")).toBeTruthy();
    click(/Texto animado/);
    expect(onModo).toHaveBeenCalledWith("motion", TEXTO);
  });

  it("solo su texto: «mi voz con imágenes» va a Reel Studio con el texto", () => {
    guia();
    click(/Un video para redes/);
    click(/Solo mi texto/);
    fireEvent.change(screen.getByLabelText("Tu texto"), { target: { value: TEXTO } });
    click(/^Seguir/);
    click(/Mi voz con imágenes/);
    expect(window.location.hash).toBe("#/con-tu-cara/reel-ia");
    expect(takeReelStudio()).toEqual({ file: undefined, texto: TEXTO });
  });

  it("un texto demasiado corto no deja seguir", () => {
    guia();
    click(/Un video para redes/);
    click(/Solo mi texto/);
    fireEvent.change(screen.getByLabelText("Tu texto"), { target: { value: "hola" } });
    click(/^Seguir/);
    expect(screen.getByText("Pega tu texto")).toBeTruthy();
  });

  it("nada todavía, para anunciar: una persona presentando lleva al anuncio de 3 tomas", () => {
    const onModo = vi.fn();
    guia({ onModo });
    click(/Un video para anunciar/);
    click(/Nada todavía/);
    click(/Una persona presentando mi producto/);
    expect(onModo).toHaveBeenCalledWith("anuncio", undefined);
  });

  it("editar: un video ya grabado va a Sube tu video", () => {
    guia();
    click(/Editar lo que ya grabé/);
    click(/Un video ya grabado/);
    expect(window.location.hash).toBe("#/con-tu-cara/video");
  });

  it("editar: varias tomas van a Edita tus tomas", () => {
    guia();
    click(/Editar lo que ya grabé/);
    click(/Varias tomas para unir/);
    expect(window.location.hash).toBe("#/con-tu-cara/montaje");
  });

  it("caso Cindy completo: referencia + su texto + ya tiene sus tomas → Edita tus tomas con la referencia y el texto", () => {
    guia();
    click(/Un video para redes/);
    click(/Un video de ejemplo y mi texto/);
    const file = new File(["x"], "recetas.mp4", { type: "video/mp4" });
    subir(file);
    fireEvent.change(screen.getByLabelText("Tu texto"), { target: { value: TEXTO } });
    click(/^Seguir/);
    click(/Ya tengo mis tomas: unirlas como este video/);
    expect(window.location.hash).toBe("#/con-tu-cara/montaje");
    expect(takeMontaje()).toEqual({ file, texto: TEXTO });
  });

  it("«Mis tomas ya hechas» lleva directo a Edita tus tomas", () => {
    guia();
    click(/Un video para anunciar/);
    click(/Mis tomas ya hechas/);
    expect(window.location.hash).toBe("#/con-tu-cara/montaje");
  });

  it("si nada le sirve, escribe qué quiere y se lo pasa al asistente con lo que ya contó", () => {
    const pedidos: string[] = [];
    const on = (e: Event) => pedidos.push((e as CustomEvent<{ text: string }>).detail.text);
    window.addEventListener("supernova:ask-assistant", on);
    guia();
    click(/Un video para redes/);
    click(/Escríbenos qué quieres hacer/);
    fireEvent.change(screen.getByLabelText("Qué quieres hacer"), { target: { value: "quiero el precio arriba todo el video" } });
    click(/Enviar al asistente/);
    window.removeEventListener("supernova:ask-assistant", on);
    expect(pedidos[0]).toBe("Quiero hacer un video para redes. quiero el precio arriba todo el video");
  });

  it("Atrás vuelve paso a paso y, cerrada, queda el enlace «Te ayudo» para abrirla", () => {
    guia();
    click(/Un video para redes/);
    click(/Solo un video de ejemplo/);
    click(/Atrás/);
    expect(screen.getByText("¿Qué tienes ya?")).toBeTruthy();
    click(/Atrás/);
    expect(screen.getByText("¿Qué video quieres hacer?")).toBeTruthy();
    click(/Cerrar la guía/);
    click(/No sabes por dónde empezar/);
    expect(screen.getByText("¿Qué video quieres hacer?")).toBeTruthy();
  });

  it("después de usarla hoy, al volver a entrar aparece cerrada", () => {
    localStorage.setItem("sn_video_guia_visto", new Date().toDateString());
    guia();
    expect(screen.queryByText("¿Qué video quieres hacer?")).toBeNull();
    expect(screen.getByText(/No sabes por dónde empezar/)).toBeTruthy();
  });
});
