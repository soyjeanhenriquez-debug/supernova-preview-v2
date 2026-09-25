// Lectores de checkouts y tiendas de apps (funciones puras: HTML → datos). Sin red y sin eval: la
// página es de un desconocido, así que nada de lo que trae se ejecuta. Solo se guardan producto,
// precios, bumps, garantía y señales públicas de la tienda. NUNCA correos, teléfonos, llaves ni
// enlaces de entrega del producto pagado (ThriveCart los trae dentro de cada bump).

type Row = Record<string, unknown>;

export interface CheckoutBump { name: string; price: number | null; currency: string | null }
export interface CheckoutApp {
  store: "App Store" | "Google Play";
  /** App Store: cada compra dentro de la app con su precio. */
  in_app: { name: string; price: number | null }[];
  /** Google Play: solo publica el rango "US$0,99 – US$399,99 por artículo". */
  in_app_min: number | null;
  in_app_max: number | null;
  rating: number | null;
  ratings_count: number | null;
  /** Google Play: descargas públicas ("50.000+"). */
  installs: number | null;
  installs_label: string | null;
}
export interface CheckoutData {
  platform: string;
  product_name: string | null;
  price: number | null;
  currency: string | null;
  guarantee_days: number | null;
  /** El embudo tiene un upsell configurado después del pago (su precio no se ve sin comprar). */
  has_upsell: boolean;
  /** false = desde el checkout no se puede saber si hay upsell (Kiwify, SamCart). */
  upsell_visible?: boolean;
  bumps: CheckoutBump[];
  /** Cobro recurrente del producto principal, si lo es. */
  subscription?: { price: number | null; interval: string | null } | null;
  app?: CheckoutApp | null;
  source_url: string;
}

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n < 1e7 ? round2(n) : null;
};
/** Conteos (descargas, reseñas): enteros sin el tope de los precios. */
const count = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n < 1e11 ? Math.round(n) : null;
};
const cents = (v: unknown): number | null => { const n = num(v); return n === null ? null : round2(n / 100); };
const cur = (v: unknown): string | null => (typeof v === "string" && /^[A-Z]{3}$/.test(v) ? v : null);
const obj = (v: unknown): Row | null => (v && typeof v === "object" && !Array.isArray(v) ? v as Row : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** "$79.99", "R$ 9,90", "1.299,90 €", "US$1,297.50" → número. */
export function parseMoney(t: unknown): number | null {
  if (typeof t !== "string") return null;
  const m = t.match(/\d[\d.,\s\u00a0]*/);
  if (!m) return null;
  let s = m[0].replace(/[\s\u00a0]/g, "").replace(/[.,]$/, "");
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? "." : ",";
    s = s.replace(dec === "." ? /,/g : /\./g, "").replace(",", ".");
  } else {
    const sep = lastDot >= 0 ? "." : lastComma >= 0 ? "," : null;
    if (sep) {
      const parts = s.split(sep);
      // Un solo separador seguido de 1–2 cifras = decimales; si no, miles.
      s = parts.length === 2 && parts[1].length <= 2 ? `${parts[0]}.${parts[1]}` : parts.join("");
    }
  }
  return num(Number(s));
}

/** Devuelve el JSON (objeto o arreglo) que empieza en `start`, respetando las cadenas. */
export function scanJson(s: string, start: number): string | null {
  const open = s[start];
  if (open !== "{" && open !== "[") return null;
  let depth = 0, inStr = false;
  for (let i = start; i < s.length && i - start < 3_000_000; i++) {
    const c = s[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") { depth--; if (depth === 0) return s.slice(start, i + 1); }
  }
  return null;
}

function jsonAfter(html: string, marker: RegExp): unknown {
  const m = marker.exec(html);
  if (!m) return null;
  const at = html.indexOf(m[0]) + m[0].length;
  const j = scanJson(html, html.slice(at).search(/[{[]/) + at);
  if (!j) return null;
  try { return JSON.parse(j); } catch { return null; }
}

function ldJson(html: string, type: string): Row | null {
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const o = JSON.parse(m[1]);
      for (const x of Array.isArray(o) ? o : [o]) if (obj(x)?.["@type"] === type) return x as Row;
    } catch { /* otro bloque */ }
  }
  return null;
}

// ── Nuxt 2: window.__NUXT__=(function(a,b,…){ a.x=…; return {…} }(v1,v2,…)) ──────────────
// Es código, no JSON. Se lee con un analizador mínimo que solo entiende literales, asignaciones
// a propiedades y referencias a los parámetros. Cualquier otra cosa → null (nunca se ejecuta).
type Node =
  | { k: "lit"; v: unknown } | { k: "ref"; n: string } | { k: "arr"; items: Node[] } | { k: "hole"; n: number }
  | { k: "obj"; props: [string, Node][] };

export function parseNuxt2(html: string): unknown {
  const at = html.indexOf("window.__NUXT__=(function(");
  if (at < 0) return null;
  const end = html.indexOf("</script>", at);
  const s = html.slice(at + "window.__NUXT__=(function(".length, end < 0 ? undefined : end);
  let i = 0;
  const fail = (): never => { throw new Error("nuxt2"); };
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const eat = (t: string) => { ws(); if (s.startsWith(t, i)) { i += t.length; return true; } return false; };
  const need = (t: string) => { if (!eat(t)) fail(); };
  const ident = () => { ws(); const m = /^[A-Za-z_$][\w$]*/.exec(s.slice(i, i + 64)); if (!m) fail(); i += m![0].length; return m![0]; };
  const str = () => {
    ws(); if (s[i] !== '"') fail();
    let j = i + 1;
    while (j < s.length && s[j] !== '"') j += s[j] === "\\" ? 2 : 1;
    const v = JSON.parse(s.slice(i, j + 1)) as string; i = j + 1; return v;
  };
  let depth = 0;
  const value = (): Node => {
    if (++depth > 200) fail();
    try {
      ws();
      const c = s[i];
      if (c === '"') return { k: "lit", v: str() };
      if (c === "{") {
        i++; const props: [string, Node][] = [];
        if (!eat("}")) {
          do {
            ws();
            const key = s[i] === '"' ? str() : /\d/.test(s[i]) ? String(numLit()) : ident();
            need(":"); props.push([key, value()]);
          } while (eat(","));
          need("}");
        }
        return { k: "obj", props };
      }
      if (c === "[") {
        i++; const items: Node[] = [];
        if (!eat("]")) { do items.push(value()); while (eat(",")); need("]"); }
        return { k: "arr", items };
      }
      if (c === "-" || /\d/.test(c) || c === ".") return { k: "lit", v: numLit() };
      const id = ident();
      if (id === "true") return { k: "lit", v: true };
      if (id === "false") return { k: "lit", v: false };
      if (id === "null") return { k: "lit", v: null };
      if (id === "void") { ws(); numLit(); return { k: "lit", v: null }; }
      if (id === "Array") { need("("); const n = numLit(); need(")"); return { k: "hole", n: Math.min(Math.max(0, n), 1000) }; }
      if (id === "new") fail(); // Date, Map…: no hacen falta
      return { k: "ref", n: id };
    } finally { depth--; }
  };
  const numLit = () => {
    ws(); const m = /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i, i + 40)); if (!m) fail();
    i += m![0].length; return Number(m![0]);
  };

  try {
    const params: string[] = [];
    if (!eat(")")) { do params.push(ident()); while (eat(",")); need(")"); }
    need("{");
    const stmts: { base: string; path: string[]; val: Node }[] = [];
    let ret: Node | null = null;
    for (let guard = 0; guard < 5000; guard++) {
      ws();
      if (s.startsWith("return", i)) { i += 6; ret = value(); eat(";"); need("}"); break; }
      const base = ident(); const path: string[] = [];
      for (;;) {
        if (eat(".")) path.push(ident());
        else if (eat("[")) { ws(); path.push(s[i] === '"' ? str() : String(numLit())); need("]"); }
        else break;
      }
      need("="); stmts.push({ base, path, val: value() }); eat(";");
    }
    if (!ret) fail();
    need("("); const args: Node[] = [];
    if (!eat(")")) { do args.push(value()); while (eat(",")); need(")"); }

    const env = new Map<string, unknown>();
    const evalNode = (n: Node, d = 0): unknown => {
      if (d > 200) fail();
      switch (n.k) {
        case "lit": return n.v;
        case "hole": return new Array(n.n).fill(null);
        case "ref": return env.has(n.n) ? env.get(n.n) : null;
        case "arr": return n.items.map((x) => evalNode(x, d + 1));
        case "obj": { const o: Row = {}; for (const [k, v] of n.props) if (k !== "__proto__") o[k] = evalNode(v, d + 1); return o; }
      }
    };
    params.forEach((p, idx) => env.set(p, idx < args.length ? evalNode(args[idx]) : null));
    for (const st of stmts) {
      let target = env.get(st.base) as Row | unknown[] | null;
      for (const key of st.path.slice(0, -1)) target = target && typeof target === "object" ? (target as Row)[key] as Row : null;
      const last = st.path[st.path.length - 1];
      if (target && typeof target === "object" && last !== undefined && last !== "__proto__") (target as Row)[last] = evalNode(st.val);
    }
    return evalNode(ret!);
  } catch {
    return null;
  }
}

// ── Kiwify ────────────────────────────────────────────────────────────────
export function parseKiwify(html: string, url: string): CheckoutData | null {
  const root = obj(parseNuxt2(html));
  const c = obj(obj(arr(root?.data)[0])?.checkout) ?? obj(obj(root?.state)?.checkoutData);
  const cart = obj(c?.cart);
  if (!c || !cart) return null;
  const first = obj(arr(c.cartProducts)[0]);
  const currency = cur(obj(c.settings)?.currency) ?? cur(obj(c.i18n)?.baseCurrency) ?? cur(cart.currency);
  const price = cents(cart.price) ?? cents(first?.unit_price);
  if (price === null) return null;
  const bumps = arr(c.bumps).map(obj).filter((b): b is Row => !!b).slice(0, 10)
    .map((b) => ({ name: clip(b.name ?? b.oto_headline, 160), price: cents(b.price), currency: cur(b.currency) ?? currency }))
    .filter((b) => b.name);
  const sub = obj(c.subscription);
  return {
    platform: "Kiwify",
    product_name: clip(first?.product_name ?? cart.name, 200) || null,
    price, currency, guarantee_days: null,
    has_upsell: false, upsell_visible: false, bumps,
    subscription: c.isSubscription === true ? { price, interval: clip(sub?.frequency ?? sub?.interval ?? sub?.period, 20) || null } : null,
    source_url: url,
  };
}

// ── ThriveCart: window._thrive = {…"product":{…}} ─────────────────────────
export function parseThriveCart(html: string, url: string): CheckoutData | null {
  const p = obj(obj(jsonAfter(html, /window\._thrive\s*=/))?.product);
  const plan = obj(p?.primary_plan);
  if (!p || !plan) return null;
  const currency = cur(p.currency);
  const price = num(plan.price);
  if (price === null) return null;
  const mode = clip(plan.payment_mode, 20);
  const bumps = arr(p.bumps).map(obj).filter((b): b is Row => !!b && b.enabled !== false).slice(0, 10)
    .map((b) => ({ name: clip(b.name, 160), price: num(b.price), currency })) // sin "fulfillment": es el enlace de entrega
    .filter((b) => b.name);
  return {
    platform: "ThriveCart",
    product_name: clip(p.name, 200) || null,
    price, currency, guarantee_days: null,
    has_upsell: p.funnel === true, bumps,
    subscription: mode && mode !== "single" && mode !== "split"
      ? { price: num(plan.rebill_price) ?? price, interval: clip(plan.frequency ?? plan.rebill_frequency, 20) || null } : null,
    source_url: url,
  };
}

// ── SamCart: página nueva (Next.js) o vieja (var product / var bump / var context) ──
export function parseSamCart(html: string, url: string): CheckoutData | null {
  const next = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (next) {
    let root: Row | null = null;
    try { root = obj(JSON.parse(next[1])); } catch { /* sigue con la vieja */ }
    const qs = arr(obj(obj(obj(root?.props)?.pageProps)?.dehydratedState)?.queries);
    const d = qs.map((q) => obj(obj(obj(q)?.state)?.data)).find((x) => x && Array.isArray(x.paymentOptions));
    const main = obj(arr(d?.paymentOptions)[0]);
    if (d && main) {
      const currency = cur(d.currency);
      const price = cents(main.amount);
      const recurring = cents(main.recurringPrice);
      return {
        platform: "SamCart",
        product_name: clip(main.name ?? obj(d.product)?.name, 200) || null,
        price, currency, guarantee_days: null,
        has_upsell: false, upsell_visible: false,
        bumps: arr(d.orderBumps).map(obj).filter((b): b is Row => !!b).slice(0, 10)
          .map((b) => ({ name: clip(b.name, 160), price: cents(b.amount), currency })).filter((b) => b.name),
        subscription: recurring !== null || main.subscriptionFrequency
          ? { price: recurring ?? price, interval: clip(main.subscriptionFrequency, 20) || null } : null,
        source_url: url,
      };
    }
  }
  const ctx = obj(jsonAfter(html, /var context\s*=/));
  const product = obj(jsonAfter(html, /var product\s*=/));
  if (!ctx && !product) return null;
  const currency = cur(ctx?.currency_code);
  const primary = arr(ctx?.products).map(obj).find((x) => x?.type === "primary");
  const price = cents(primary?.price) ?? cents(product?.price);
  if (price === null) return null;
  const bump = obj(jsonAfter(html, /var bump\s*=/));
  const g = /"key":"guarantee_select","value":"(\d{1,3})_day"/.exec(html);
  return {
    platform: "SamCart",
    product_name: clip(product?.name, 200) || null,
    price, currency, guarantee_days: g ? Number(g[1]) : null,
    has_upsell: false, upsell_visible: false,
    bumps: bump && clip(bump.name, 160) ? [{ name: clip(bump.name, 160), price: cents(bump.price), currency }] : [],
    subscription: null,
    source_url: url,
  };
}

// ── App Store ─────────────────────────────────────────────────────────────
export function parseAppStore(html: string, url: string): CheckoutData | null {
  const ld = ldJson(html, "SoftwareApplication");
  if (!ld) return null;
  const offer = obj(Array.isArray(ld.offers) ? ld.offers[0] : ld.offers);
  const rating = obj(ld.aggregateRating);
  // La sección "Compras dentro de la app" viene como pares [nombre, precio].
  let inApp: { name: string; price: number | null }[] = [];
  for (const m of html.matchAll(/"textPairs":(\[\[[\s\S]{0,4000}?\]\])/g)) {
    try {
      const pairs = (JSON.parse(m[1]) as unknown[]).filter((p): p is [string, string] =>
        Array.isArray(p) && typeof p[0] === "string" && typeof p[1] === "string");
      const priced = pairs.map(([n, p]) => ({ name: clip(n, 120), price: parseMoney(p) })).filter((x) => x.name && x.price !== null);
      if (priced.length && priced.length >= pairs.length / 2) {
        const seen = new Set<string>();
        inApp = priced.filter((x) => { const k = `${x.name}|${x.price}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 15);
        break;
      }
    } catch { /* otro bloque */ }
  }
  return {
    platform: "App Store",
    product_name: clip(ld.name, 200) || null,
    price: num(offer?.price), currency: cur(offer?.priceCurrency), guarantee_days: null,
    has_upsell: false, upsell_visible: false, bumps: [], subscription: null,
    app: {
      store: "App Store", in_app: inApp, in_app_min: null, in_app_max: null,
      rating: num(rating?.ratingValue), ratings_count: count(rating?.reviewCount ?? rating?.ratingCount),
      installs: null, installs_label: null,
    },
    source_url: url,
  };
}

// ── Google Play ───────────────────────────────────────────────────────────
export function parseGooglePlay(html: string, url: string): CheckoutData | null {
  const ld = ldJson(html, "SoftwareApplication");
  if (!ld) return null;
  const offer = obj(Array.isArray(ld.offers) ? ld.offers[0] : ld.offers);
  const rating = obj(ld.aggregateRating);
  // Los datos de ESTA app van en el bloque ds:5; los demás son apps parecidas.
  const k = html.indexOf("AF_initDataCallback({key: 'ds:5'");
  const block = k >= 0 ? html.slice(k, Math.max(k, html.indexOf("</script>", k))) : "";
  let min: number | null = null, max: number | null = null;
  for (const m of block.matchAll(/"([^"\d]{0,6}\d[\d.,\u00a0]*[^"\d]{0,6} - [^"\d]{0,6}\d[\d.,\u00a0]*[^"]{0,40})"/g)) {
    const [a, b] = m[1].split(" - ");
    min = parseMoney(a); max = parseMoney(b);
    if (min !== null && max !== null) break;
  }
  const inst = /\["([0-9][0-9.,\s\u00a0]*\+)",(\d+),\d+/.exec(block);
  return {
    platform: "Google Play",
    product_name: clip(ld.name, 200) || null,
    price: parseMoney(String(offer?.price ?? "")) ?? num(offer?.price), currency: cur(offer?.priceCurrency), guarantee_days: null,
    has_upsell: false, upsell_visible: false, bumps: [], subscription: null,
    app: {
      store: "Google Play", in_app: [], in_app_min: min, in_app_max: max,
      rating: num(rating?.ratingValue) !== null ? round2(Number(rating?.ratingValue)) : null,
      ratings_count: count(rating?.ratingCount ?? rating?.reviewCount),
      installs: inst ? count(inst[2]) : null, installs_label: inst ? clip(inst[1], 20) : null,
    },
    source_url: url,
  };
}

export const CHECKOUT_PARSERS: Record<string, (html: string, url: string) => CheckoutData | null> = {
  Kiwify: parseKiwify,
  ThriveCart: parseThriveCart,
  SamCart: parseSamCart,
  "App Store": parseAppStore,
  "Google Play": parseGooglePlay,
};
