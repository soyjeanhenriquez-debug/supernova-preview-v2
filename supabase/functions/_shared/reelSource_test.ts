// Prueba de reelSource sin red: se simulan la base (PostgREST) y Apify con un fetch falso.
// Correr: deno test -A supabase/functions/_shared/reelSource_test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { APIFY_USD_PER_RESULT, extractMany, getReel, runApify } from "./reelSource.ts";

Deno.env.set("SUPABASE_URL", "http://db.test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-de-prueba");

type Row = Record<string, unknown>;
const state = { rows: new Map<string, Row>(), runs: [] as Row[], apifyCalls: [] as string[][], cap: 5, spent: 0, apifyStatus: 200 };

const item = (code: string) => ({
  shortCode: code, ownerUsername: "alguien", caption: "texto", videoDuration: 30, videoPlayCount: 1000,
  likesCount: 10, commentsCount: 2, videoUrl: `https://scontent.cdninstagram.com/${code}.mp4`,
  displayUrl: `https://scontent.cdninstagram.com/${code}.jpg`, type: "Video",
});
const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// deno-lint-ignore require-await
globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  const one = String(new Headers(init?.headers).get("Accept") ?? "").includes("vnd.pgrst.object");
  if (url.hostname === "api.apify.com") {
    state.apifyCalls.push(body.directUrls);
    if (state.apifyStatus !== 200) return res({ error: { type: "platform-feature-disabled" } }, state.apifyStatus);
    return res(body.directUrls.map((u: string) => item(u.split("/").filter(Boolean).at(-1)!)));
  }
  if (url.pathname === "/rest/v1/rpc/apify_budget") return res({ cap: state.cap, spent: state.spent });
  if (url.pathname === "/rest/v1/apify_runs") { state.runs.push(body); state.spent += Number(body.cost_usd); return res(null, 201); }
  if (url.pathname === "/rest/v1/reel_extractions") {
    if (method === "GET") {
      const eq = url.searchParams.get("shortcode") ?? "";
      const codes = eq.startsWith("eq.") ? [eq.slice(3)] : eq.slice(4, -1).split(",").map(s => s.replace(/"/g, ""));
      const found = codes.map(c => state.rows.get(c)).filter(Boolean);
      return one ? (found[0] ? res(found[0]) : res({ code: "PGRST116" }, 406)) : res(found);
    }
    const list = Array.isArray(body) ? body : [body];
    for (const r of list) state.rows.set(String(r.shortcode), { base: null, base_model: null, llm_a_usd: null, analyzed_at: null, ...state.rows.get(String(r.shortcode)), ...r });
    return one ? res(state.rows.get(String(list[0].shortcode))) : res(list.map(r => state.rows.get(String(r.shortcode))), 201);
  }
  throw new Error(`fetch no simulado: ${method} ${url}`);
};

const reset = () => { state.rows.clear(); state.runs = []; state.apifyCalls = []; state.cap = 5; state.spent = 0; state.apifyStatus = 200; };

Deno.test("el segundo análisis del mismo Reel sale de la caché y no llama a Apify", async () => {
  reset();
  const a = await getReel("test", "ABCDE12345", "tok");
  const b = await getReel("test", "ABCDE12345", "tok");
  assertEquals(a.ok && a.cacheHit, false);
  assertEquals(a.ok && a.apifyUsd, APIFY_USD_PER_RESULT);
  assertEquals(b.ok && b.cacheHit, true);
  assertEquals(b.ok && b.apifyUsd, 0);
  assertEquals(state.apifyCalls.length, 1);
  assertEquals(state.runs.length, 1);
});

Deno.test("una caché de más de 7 días se vuelve a leer y conserva el análisis base", async () => {
  reset();
  state.rows.set("VIEJO12345", { shortcode: "VIEJO12345", extracted_at: new Date(Date.now() - 8 * 86_400_000).toISOString(), base: { mecanismo: "x" } });
  const g = await getReel("test", "VIEJO12345", "tok");
  assertEquals(g.ok && g.cacheHit, false);
  assertEquals(state.apifyCalls.length, 1);
  assertEquals((state.rows.get("VIEJO12345") as Row).base, { mecanismo: "x" });
});

Deno.test("10 Reels del barrido = una sola corrida de Apify; los que están en caché no se piden", async () => {
  reset();
  await getReel("test", "YAESTA0001", "tok");
  const codes = Array.from({ length: 10 }, (_, i) => i === 0 ? "YAESTA0001" : `BARRIDO${String(i).padStart(3, "0")}`);
  const r = await extractMany("test", codes, "tok");
  assertEquals(r, { read: 9, cached: 1 });
  assertEquals(state.apifyCalls.length, 2); // 1 del getReel previo + 1 del barrido
  assertEquals(state.apifyCalls[1].length, 9);
});

Deno.test("con el tope del mes alcanzado no se llama a Apify, pero la caché sigue", async () => {
  reset();
  await getReel("test", "CACHEADO01", "tok");
  state.spent = 5;
  const nuevo = await getReel("test", "NUEVO00001", "tok");
  const viejo = await getReel("test", "CACHEADO01", "tok");
  assertEquals(nuevo, { ok: false, reason: "budget" });
  assertEquals(viejo.ok && viejo.cacheHit, true);
  assertEquals(state.apifyCalls.length, 1);
});

Deno.test("si Apify falla (403) devuelve down y anota la corrida sin costo", async () => {
  reset();
  state.apifyStatus = 403;
  assertEquals(await runApify("test", ["https://www.instagram.com/reel/FALLA00001/"], "tok"), "down");
  assertEquals(state.runs[0].ok, false);
  assertEquals(state.runs[0].cost_usd, 0);
});
