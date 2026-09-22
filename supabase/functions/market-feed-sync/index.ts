// SUPERNOVA — Mercado: descarga los feeds de las redes de afiliados y actualiza el catálogo.
//
// Los catálogos cambian a diario (precios, comisiones, productos que salen). Con un feed
// guardado, esto corre solo por cron; el admin también puede lanzarlo a mano.
//
// verify_jwt false (la invoca pg_cron) + compuerta interna: secreto de cron o admin con
// sesión. Las URLs de los feeds llevan la clave del programa de afiliados: viven en
// market_feeds, tabla sin permisos para la API, y NUNCA se devuelven enteras al cliente.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const MAX_BYTES = 25_000_000;   // un feed más grande que esto se corta: no cabe en memoria
const MAX_ROWS = 5_000;         // techo por feed, para no llenar la base de golpe
const BATCH = 300;

// deno-lint-ignore no-explicit-any
async function authorize(req: Request, admin: any): Promise<boolean> {
  const secret = req.headers.get("x-cron-secret");
  if (secret) {
    const { data } = await admin.rpc("verify_cron_secret", { p_secret: secret });
    if (data === true) return true;
  }
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const { data } = await admin.auth.getUser(token);
  const uid = data?.user?.id;
  if (!uid) return false;
  const { data: role } = await admin.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
  return !!role;
}

/** Delimitador: se decide con la primera línea, que es la de las columnas. Rakuten manda "|". */
function detectarSeparador(text: string): string {
  const linea = text.slice(0, 5000).split("\n")[0] ?? "";
  const cuenta = (c: string) => (linea.match(new RegExp(`\\${c}`, "g")) ?? []).length;
  return ([",", ";", "|", "\t"] as const).reduce((mejor, c) => (cuenta(c) > cuenta(mejor) ? c : mejor), ",");
}

/** CSV con comillas, saltos dentro de campo y separador , ; | o tabulador */
function parseCSV(text: string): Record<string, string>[] {
  const sep = detectarSeparador(text);
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = (rows.shift() ?? []).map((h) => h.trim());
  return rows.filter((r) => r.some((v) => v.trim()))
    .map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const unescapeXml = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&amp;/g, "&");

/**
 * XML sin dependencias: se queda con la etiqueta que más se repite teniendo hijos
 * (el "item" del feed) y aplana sus hijos directos. Es lo que traen todos los feeds.
 */
function parseXML(text: string): Record<string, string>[] {
  const counts = new Map<string, number>();
  for (const m of text.matchAll(/<([A-Za-z_][\w.:-]*)\b[^>]*>\s*</g)) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  let tag = "", best = 0;
  for (const [t, n] of counts) if (n > best) { best = n; tag = t; }
  if (!tag) return [];
  const out: Record<string, string>[] = [];
  const blocks = text.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "g"));
  for (const b of blocks) {
    const row: Record<string, string> = {};
    for (const f of b[1].matchAll(/<([A-Za-z_][\w.:-]*)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
      if (/<[A-Za-z_]/.test(f[2])) continue;               // nodo con hijos: no es un campo
      row[f[1]] = unescapeXml(f[2]).trim();
    }
    if (Object.keys(row).length) out.push(row);
    if (out.length >= MAX_ROWS) break;
  }
  return out;
}

const NUMERIC = new Set(["price", "commission_pct", "commission_amount", "popularity", "epc", "rating", "reviews"]);
const TEXT = new Set(["external_id", "title", "description", "category", "niche", "vendor", "currency",
  "image_url", "product_url", "affiliate_url", "language", "country"]);

function num(v: string): number | null {
  const n = parseFloat(v.replace(/[^0-9.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (!(await authorize(req, admin))) return json({ error: "No autorizado" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* el cron llama sin cuerpo */ }
  const action = typeof body.action === "string" ? body.action : "run";

  // ── Gestión de feeds (solo admin; la URL nunca vuelve entera) ──────────
  if (action === "list") {
    const { data } = await admin.from("market_feeds")
      .select("id,source,label,url,tags,active,last_run,last_count,last_error,created_at,default_commission_pct")
      .order("created_at", { ascending: false });
    const feeds = (data ?? []).map((f: Record<string, unknown>) => ({
      ...f, url: String(f.url).replace(/^(https:\/\/[^/]+\/).*$/, "$1…"),  // solo el dominio
    }));
    return json({ feeds });
  }

  if (action === "save") {
    const f = (body.feed ?? {}) as Record<string, unknown>;
    const url = String(f.url ?? "").trim();
    if (!/^https:\/\//i.test(url)) return json({ error: "La URL debe empezar por https://" }, 400);
    const row = {
      source: String(f.source ?? "manual"),
      label: String(f.label ?? "").slice(0, 80),
      url,
      default_commission_pct: f.default_commission_pct == null || f.default_commission_pct === ""
        ? null : Math.max(0, Math.min(100, Number(f.default_commission_pct))),
      mapping: (f.mapping && typeof f.mapping === "object") ? f.mapping : {},
      tags: Array.isArray(f.tags) ? (f.tags as string[]).map((t) => String(t).slice(0, 30)).slice(0, 10) : [],
    };
    const { data, error } = await admin.from("market_feeds").insert(row).select("id").single();
    if (error) return json({ error: error.message }, 400);
    return json({ id: data.id });
  }

  if (action === "delete") {
    const id = String(body.id ?? "");
    if (!id) return json({ error: "Falta el id" }, 400);
    const { error } = await admin.from("market_feeds").delete().eq("id", id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  // ── Descarga y actualización ──────────────────────────────────────────
  let q = admin.from("market_feeds").select("*").eq("active", true);
  if (typeof body.id === "string" && body.id) q = q.eq("id", body.id);
  const { data: feeds, error: feedsError } = await q;
  if (feedsError) return json({ error: feedsError.message }, 500);

  const resumen: Array<Record<string, unknown>> = [];
  for (const feed of feeds ?? []) {
    let count = 0, err: string | null = null;
    try {
      const resp = await fetch(feed.url, { headers: { "User-Agent": "SUPERNOVA/1.0 (+market-feed-sync)" } });
      if (!resp.ok) throw new Error(`La red respondió ${resp.status}`);
      const buf = new Uint8Array(await resp.arrayBuffer());
      if (buf.byteLength > MAX_BYTES) throw new Error("El feed pesa más de 25 MB");
      const text = new TextDecoder("utf-8").decode(buf);
      const rows = /^\s*</.test(text) ? parseXML(text) : parseCSV(text);
      if (!rows.length) throw new Error("El feed no trae filas");

      const mapping = (feed.mapping ?? {}) as Record<string, string>;
      if (!mapping.external_id || !mapping.title) throw new Error("Al feed le falta el emparejado de ID y título");

      const now = new Date().toISOString();
      const payload = rows.slice(0, MAX_ROWS).map((r) => {
        const out: Record<string, unknown> = { source: feed.source, tags: feed.tags ?? [], last_seen: now, is_active: true };
        for (const [field, col] of Object.entries(mapping)) {
          const raw = (r[col] ?? "").trim();
          if (!raw) continue;
          if (NUMERIC.has(field)) out[field] = num(raw);
          else if (TEXT.has(field)) out[field] = raw.slice(0, field === "description" ? 1200 : 400);
        }
        // Si el feed no trae comisión (Awin no la manda), se usa la del programa.
        if (out.commission_pct == null && out.commission_amount == null && feed.default_commission_pct != null) {
          out.commission_pct = Number(feed.default_commission_pct);
        }
        return out;
      }).filter((r) => r.external_id && r.title);

      for (let i = 0; i < payload.length; i += BATCH) {
        const { error } = await admin.from("market_offers")
          .upsert(payload.slice(i, i + BATCH), { onConflict: "source,external_id" });
        if (error) throw new Error(error.message);
        count += Math.min(BATCH, payload.length - i);
      }
    } catch (e) {
      err = e instanceof Error ? e.message : "Error desconocido";
    }
    await admin.from("market_feeds").update({
      last_run: new Date().toISOString(), last_count: count, last_error: err,
    }).eq("id", feed.id);
    resumen.push({ feed: feed.label || feed.source, productos: count, error: err });
  }

  return json({ ok: true, feeds: resumen });
});
