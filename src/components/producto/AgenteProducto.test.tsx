import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EMPTY_PROFILE } from "@/lib/businessProfile";

const builderCall = vi.fn();
vi.mock("@/lib/productBuilder", async (orig) => ({ ...(await orig<typeof import("@/lib/productBuilder")>()), builderCall: (b: unknown) => builderCall(b) }));
vi.mock("@/lib/brandDna", () => ({ useBrandDna: () => ({ dna: { communication_style: "" }, loaded: true }) }));
vi.mock("@/components/offers/userCountry", () => ({ getUserCountry: () => Promise.resolve("DO") }));

import { AgenteProducto } from "./AgenteProducto";

const profile = {
  ...EMPTY_PROFILE,
  product: "Recetario PDF de 60 rellenos y postres sin estufa ni horno",
  who: "Mujeres que hacen dulces en casa", promise: "Haz postres sin fuego", price: "US$1,99", price_amount: 1.99, price_currency: "USD",
};

const pb = { models: [{ slug: "estandar", enabled: true, cost: 5, piece_action: "builder_piece" }], deleteBuild: vi.fn(), updateBuild: vi.fn(), reload: vi.fn() };

describe("AgenteProducto · Dulce Sin Fuego", () => {
  it("no pregunta lo que sabe, salta con «Decide tú» y arma el plan con el constructor de siempre", async () => {
    builderCall.mockResolvedValue({
      ok: true, status: 200, billing: { charged: 0, balance: null, receipt: null },
      data: {
        charged: 0,
        build: { id: "b1", format: "ebook", size: "normal", tone: "cercano", title: "Dulce Sin Fuego", subtitle: "Rellenos y postres sin horno", status: "borrador", pieces_total: 2, pieces_done: 0 },
        pieces: [
          { id: "p1", idx: 0, kind: "capitulo", module: null, title: "Rellenos cremosos", brief: "", content: null },
          { id: "p2", idx: 1, kind: "bono", module: null, title: "Lista de compras", brief: "", content: null },
        ],
      },
    });
    render(<AgenteProducto profile={profile} productName="Dulce Sin Fuego" activeId="prod1" pb={pb as never}
      unlocked balance={100} applyServerCharge={vi.fn()} onClose={vi.fn()} onOpenBuild={vi.fn()} />);

    expect(await screen.findByText(/Lo que ya sé/)).toBeInTheDocument();
    expect(screen.queryByText("¿Qué le vas a entregar a quien compra?")).toBeNull();
    expect(screen.getByText("¿Cuánto sabe quien te compra?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Decide tú"));
    fireEvent.click(await screen.findByText("Decide tú"));

    await waitFor(() => expect(builderCall).toHaveBeenCalled());
    const body = builderCall.mock.calls[0][0];
    expect(body).toMatchObject({ action: "outline", format: "ebook", genre: "recetario", product_id: "prod1" });
    expect(body.notes).toContain("60 recetas");
    expect(await screen.findByText("US$1,99")).toBeInTheDocument();
    expect(screen.getByText(/Escríbelo · 10 créditos/)).toBeInTheDocument();
  });
});
