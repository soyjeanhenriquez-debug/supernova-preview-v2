import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const updateUser = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { updateUser: (...a: unknown[]) => updateUser(...a) } } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import SetPasswordDialog from "./SetPasswordDialog";

describe("SetPasswordDialog", () => {
  beforeEach(() => updateUser.mockReset());

  it("explica los errores en español y no se cierra por un toque fuera si ya escribió", async () => {
    updateUser.mockResolvedValue({ error: { message: "Password is known to be weak and easy to guess, please choose a different one." } });
    const onClose = vi.fn();
    const { container } = render(<SetPasswordDialog onClose={onClose} />);
    fireEvent.change(screen.getByLabelText("Contraseña nueva"), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText("Repite la contraseña"), { target: { value: "password12" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar contraseña/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/no son iguales/);
    fireEvent.click(container.firstChild as HTMLElement); // fondo
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Repite la contraseña"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar contraseña/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/fácil de adivinar/));
  });

  it("guarda y cierra", async () => {
    updateUser.mockResolvedValue({ error: null });
    const onClose = vi.fn();
    render(<SetPasswordDialog onClose={onClose} />);
    fireEvent.change(screen.getByLabelText("Contraseña nueva"), { target: { value: "una-clave-larga" } });
    fireEvent.change(screen.getByLabelText("Repite la contraseña"), { target: { value: "una-clave-larga" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar contraseña/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updateUser).toHaveBeenCalledWith({ password: "una-clave-larga" });
  });
});
