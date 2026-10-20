import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TeleprompterLibre } from "./TeleprompterLibre";
import { promptLines } from "@/lib/reel";

describe("Teleprompter libre", () => {
  it("cada salto de línea es un párrafo y las líneas largas se parten en frases", () => {
    const largo = "Esta es una frase bastante larga que sirve para probar el corte. ".repeat(2) + "Y esta es la última del párrafo largo.";
    expect(promptLines("Hola.\n\n  \nSegunda línea\n" + largo)).toEqual([
      "Hola.", "Segunda línea",
      "Esta es una frase bastante larga que sirve para probar el corte.", "Esta es una frase bastante larga que sirve para probar el corte.", "Y esta es la última del párrafo largo.",
    ]);
    expect(promptLines("...\n---")).toEqual([]);
  });

  it("abre el teleprompter con el texto pegado y lo recuerda en el dispositivo", () => {
    localStorage.clear();
    const { unmount } = render(<TeleprompterLibre onHome={() => undefined} />);
    const boton = screen.getByRole("button", { name: /Abrir el teleprompter/ });
    expect(boton).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Tu texto"), { target: { value: "Perdonar no es volver.\nEs soltar el peso." } });
    expect(screen.getByText(/2 párrafos/)).toBeInTheDocument();
    fireEvent.click(boton);
    expect(screen.getByRole("dialog", { name: "Teleprompter" })).toHaveTextContent("Es soltar el peso.");
    unmount();
    render(<TeleprompterLibre onHome={() => undefined} />);
    expect(screen.getByLabelText("Tu texto")).toHaveValue("Perdonar no es volver.\nEs soltar el peso.");
  });
});
