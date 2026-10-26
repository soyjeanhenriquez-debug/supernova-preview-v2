import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Inicio } from "./Inicio";
import { DIARIO_VACIO, IDENTIDAD_VACIA } from "./useStudioDatos";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const pl = { id: "p1", nombre: "Diego Vetencourt · 5 proyectos con Claude", fuente: "", duracion: 51, analisis: { planos: [{}, {}], duracion: 51 }, thumbs: [], thumbUrls: [], created_at: "" };

describe("Reel Studio · inicio (Guardián del Creador)", () => {
  it("agrega una plantilla por enlace sin abrir un reel nuevo y marca varias para la producción diaria", async () => {
    const onAgregar = vi.fn(async () => undefined);
    const onGuardar = vi.fn(async () => true);
    const onElegir = vi.fn();
    render(<Inicio idn={IDENTIDAD_VACIA} plantillas={[pl as never]} borradores={[]} diario={{ ...DIARIO_VACIO, plantilla_ids: [] }} busy={false}
      onElegir={onElegir} onIdentidad={() => {}} onBorrador={() => {}} onDescartar={() => {}} onPlantilla={() => {}} onBorrarPlantilla={() => {}}
      onGuardarDiario={onGuardar} onCrearAhora={async () => {}} onAgregarPlantilla={onAgregar} agregando="" />);
    fireEvent.change(screen.getByPlaceholderText(/Pega el enlace de un Reel/), { target: { value: "https://www.instagram.com/reel/DeR5gDJNEHQ/" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar plantilla" }));
    expect(onAgregar).toHaveBeenCalledWith("https://www.instagram.com/reel/DeR5gDJNEHQ/");
    expect(onElegir).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Diego Vetencourt/ }));
    expect(onGuardar).toHaveBeenCalledWith(expect.objectContaining({ plantilla_ids: ["p1"], plantilla_id: "p1" }));
  });
});
