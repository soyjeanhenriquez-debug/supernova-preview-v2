import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ReelsEnCurso, type ReelEnCurso } from "./ReelsEnCurso";

const reel = (o: Partial<ReelEnCurso>): ReelEnCurso => ({ id: "a", titulo: "Mi reel", origen: "guion", paso: 0, preparado: false, abierto: false, texto: "Jesús dijo esto", ...o });

describe("Sigue donde lo dejaste (27-oct-2026)", () => {
  it("muestra cada reel con su origen, su estado y cuál está abierto; un toque lo abre", () => {
    const abrir = vi.fn();
    render(<ReelsEnCurso cargarPortada={async () => null} onAbrir={abrir} onBorrar={() => undefined}
      reels={[reel({ id: "g", titulo: "Lucas 14:28", abierto: true }), reel({ id: "d", titulo: "5 PROYECTOS", origen: "referencia", preparado: true, paso: 1 })]} />);
    expect(screen.getByText("Sigue donde lo dejaste")).toBeTruthy();
    expect(screen.getByText("Abierto")).toBeTruthy();
    expect(screen.getByText("Sin preparar")).toBeTruthy();
    expect(screen.getByText("Paso 2 · Tus recursos")).toBeTruthy();
    expect(screen.getByText("Recreado")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Abrir 5 PROYECTOS" }));
    expect(abrir).toHaveBeenCalledWith("d");
  });
  it("borrar es un botón aparte (no abre el reel)", () => {
    const abrir = vi.fn(), borrar = vi.fn();
    render(<ReelsEnCurso cargarPortada={async () => null} onAbrir={abrir} onBorrar={borrar} reels={[reel({ id: "x", titulo: "Uno" })]} />);
    fireEvent.click(screen.getByRole("button", { name: "Borrar Uno" }));
    expect(borrar).toHaveBeenCalledWith("x");
    expect(abrir).not.toHaveBeenCalled();
  });
  it("sin reels no muestra nada", () => {
    const { container } = render(<ReelsEnCurso cargarPortada={async () => null} onAbrir={() => undefined} onBorrar={() => undefined} reels={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
