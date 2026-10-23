/**
 * R2-15 · Video (12-oct-2026).
 *  - Un anuncio en video (3 tomas de 5 s) cuesta 225 créditos con CUALQUIER plantilla.
 *  - El precio por toma del estudio es el mismo de CREDIT_COSTS (lo que dice la tarjeta y el botón).
 *  - "Armar video final" (montaje en el navegador) y bajar las tomas NO cobran: no crean videos ni
 *    descuentan créditos. El único cobro es el del servidor al crear cada toma (video-studio).
 */
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) },
    functions: { invoke: vi.fn() },
  },
}));

import { buildShots, planCost, VIDEO_PRICE, VIDEO_TEMPLATES, type VideoBrief } from "./videoTemplates";
import { CREDIT_COSTS } from "@/hooks/useCredits";
import { fetchJobFile } from "@/components/video/videoApi";

const brief: VideoBrief = { product: "Guía digital de recetas rápidas", who: "Mamás que trabajan", promise: "Cocinar la semana en una tarde" };
const SRC = (p: string) => fs.readFileSync(path.resolve(__dirname, "..", p), "utf8");

describe("R2 · costo del anuncio en video", () => {
  it("cualquier plantilla de anuncio = 3 tomas de 5 s = 267 créditos (costo × 6, 22-oct-2026)", () => {
    for (const t of VIDEO_TEMPLATES) {
      const shots = buildShots("anuncio", t.id, brief);
      expect(shots.map(s => s.seconds), t.id).toEqual([5, 5, 5]);
      expect(planCost(shots), t.id).toBe(267);
    }
  });

  it("el precio por toma del estudio es el mismo que CREDIT_COSTS (no se separan)", () => {
    expect(VIDEO_PRICE[5]).toBe(CREDIT_COSTS.vid_mini_5);
    expect(VIDEO_PRICE[10]).toBe(CREDIT_COSTS.vid_mini_10);
  });

  it("rehacer 1 toma cuesta solo esa toma", () => {
    const shots = buildShots("anuncio", "demostracion", brief);
    expect(planCost(shots.slice(2))).toBe(CREDIT_COSTS.vid_mini_5);
  });
});

describe("R2 · armar las tomas no cobra en el navegador", () => {
  it("bajar el archivo de una toma pide 'file' y nunca crea un video", async () => {
    const fetchMock = vi.fn(async () => new Response(new Blob(["mp4"]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchJobFile("job-1");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/functions\/v1\/video-studio$/);
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({ action: "file", job_id: "job-1" });
    expect(body).not.toHaveProperty("prompt");
    expect(body).not.toHaveProperty("seconds");
    vi.unstubAllGlobals();
  });

  it("montaje y 'Listo para publicar' no descuentan créditos ni crean videos", () => {
    for (const f of ["lib/montage.ts", "components/video/AdFinalVideo.tsx", "components/video/ReadyToPublish.tsx"]) {
      const src = SRC(f);
      expect(src, f).not.toMatch(/consume_credits|debit_credits|\bconsume\(|applyServerCharge|useCredits/);
      expect(src, f).not.toMatch(/createVideo\(|invokeVideo\(|functions\.invoke\(/);
    }
  });

  it("el estudio de video nunca cobra por su cuenta: solo refleja lo que cobró el servidor", () => {
    const src = SRC("pages/VideoStudioPage.tsx");
    expect(src).not.toMatch(/consume_credits|debit_credits|\bconsume\(|\.rpc\(/);
    // Ningún archivo de la app (fuera del hook) llama a consume(): todo cobro va por el servidor.
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !/hooks\/useCredits\.ts$|integrations\/supabase\/types\.ts$/.test(p)) {
          const s = fs.readFileSync(p, "utf8");
          if (/\.rpc\(\s*["']consume_credits["']|\.rpc\(\s*["']debit_credits["']|\bconsume\(\s*["'][a-z_]+["']/.test(s)) offenders.push(path.relative(path.resolve(__dirname, ".."), p));
        }
      }
    };
    walk(path.resolve(__dirname, ".."));
    expect(offenders).toEqual([]);
  }, 30000);
});
