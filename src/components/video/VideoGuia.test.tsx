import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VideoGuia } from "./VideoGuia";
import { takeReelStudioFile } from "@/lib/intentHandoff";

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/toolEvents", () => ({ toolEvent: vi.fn() }));

const click = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));

describe("Guía «¿Qué video quieres hacer?»", () => {
  beforeEach(() => { localStorage.clear(); window.location.hash = ""; });

  it("caso Cindy: redes → tiene ejemplo → uno parecido → sube el video y va a Reel Studio con el archivo", () => {
    render(<VideoGuia onModo={vi.fn()} />);
    expect(screen.getByText("¿Qué video quieres hacer?")).toBeTruthy();
    click(/Un video para redes/);
    expect(screen.getByText(/Tienes un video de ejemplo/)).toBeTruthy();
    click(/Sí, tengo uno/);
    expect(screen.getByText("¿Qué quieres tomar de ese video?")).toBeTruthy();
    click(/Hacer uno parecido con mi producto/);
    expect(screen.getByText("Sube tu video de ejemplo")).toBeTruthy();
    const file = new File(["x"], "recetas.mp4", { type: "video/mp4" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    expect(window.location.hash).toBe("#/con-tu-cara/reel-ia");
    expect(takeReelStudioFile()).toBe(file);
    expect(takeReelStudioFile()).toBeNull(); // se lee una sola vez
  });

  it("solo copiar el estilo lleva a Motion graphics dentro de Video", () => {
    const onModo = vi.fn();
    render(<VideoGuia onModo={onModo} />);
    click(/Un video para anunciar/);
    click(/Sí, tengo uno/);
    click(/Solo copiar su estilo/);
    expect(onModo).toHaveBeenCalledWith("motion");
  });

  it("anuncio sin ejemplo con una persona presentando lleva al anuncio de 3 tomas", () => {
    const onModo = vi.fn();
    render(<VideoGuia onModo={onModo} />);
    click(/Un video para anunciar/);
    click(/No, empiezo desde mi idea/);
    click(/Una persona presentando mi producto/);
    expect(onModo).toHaveBeenCalledWith("anuncio");
  });

  it("editar un video ya grabado lleva a Sube tu video", () => {
    render(<VideoGuia onModo={vi.fn()} />);
    click(/Editar un video que ya grabé/);
    expect(window.location.hash).toBe("#/con-tu-cara/video");
  });

  it("Atrás vuelve a la pregunta anterior y, cerrada, queda el enlace «Te ayudo» para abrirla", () => {
    render(<VideoGuia onModo={vi.fn()} />);
    click(/Un video para redes/);
    click(/Atrás/);
    expect(screen.getByText("¿Qué video quieres hacer?")).toBeTruthy();
    click(/Cerrar la guía/);
    expect(screen.getByText(/No sabes por dónde empezar/)).toBeTruthy();
    click(/No sabes por dónde empezar/);
    expect(screen.getByText("¿Qué video quieres hacer?")).toBeTruthy();
  });

  it("después de usarla hoy, al volver a entrar aparece cerrada", () => {
    localStorage.setItem("sn_video_guia_visto", new Date().toDateString());
    render(<VideoGuia onModo={vi.fn()} />);
    expect(screen.queryByText("¿Qué video quieres hacer?")).toBeNull();
    expect(screen.getByText(/No sabes por dónde empezar/)).toBeTruthy();
  });
});
