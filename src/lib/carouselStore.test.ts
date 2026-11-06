import { describe, it, expect, vi, beforeEach } from "vitest";

const upsert = vi.fn(() => Promise.resolve({ error: null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ upsert }) } }));

import { saveDraft, loadDraft } from "@/lib/carouselStore";
import type { CarouselDraft } from "@/lib/carousel";

const draft = (): CarouselDraft => ({
  covers: [{ title: "Los 3 *secretos* para congelar", subtitle: "", tag: "", why: "" }], pick: 0, caption: "",
  slides: [{ kind: "portada", tone: "oscuro", kicker: "", title: "Portada", image: "https://firmada/x.png?token=1", imagePath: "u/x.png" } as never],
});

describe("Carruseles en «Lo que creaste»", () => {
  beforeEach(() => { localStorage.clear(); upsert.mockClear(); vi.useFakeTimers(); });

  it("un carrusel nuevo recibe su id, queda en el navegador y 2 s después va a la base sin URLs firmadas", () => {
    const d = draft();
    saveDraft("u1", "p1", d);
    expect(d.saveId).toMatch(/^[0-9a-f-]{36}$/);
    expect(loadDraft("u1", "p1")?.saveId).toBe(d.saveId);
    expect(upsert).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2100);
    expect(upsert).toHaveBeenCalledTimes(1);
    const row = (upsert.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(row).toMatchObject({ id: d.saveId, user_id: "u1", product_id: "p1", title: "Los 3 secretos para congelar" });
    const s = (row.draft as CarouselDraft).slides[0] as unknown as Record<string, unknown>;
    expect(s.image).toBeUndefined();
    expect(s.imagePath).toBe("u/x.png");
  });

  it("varios cambios seguidos se guardan una sola vez y con el mismo id", () => {
    const d = draft();
    saveDraft("u1", "p1", d);
    const id = d.saveId;
    saveDraft("u1", "p1", { ...d, caption: "pie nuevo" });
    vi.advanceTimersByTime(2100);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect((upsert.mock.calls[0] as unknown as [{ id: string; draft: CarouselDraft }])[0]).toMatchObject({ id, draft: { caption: "pie nuevo" } });
  });
});
