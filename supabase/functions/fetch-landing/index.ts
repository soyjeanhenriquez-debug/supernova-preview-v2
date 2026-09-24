// SUPERNOVA — Fetch landing page HTML and extract relevant metadata server-side.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient as createGuardClient } from "npm:@supabase/supabase-js@2";

function pick(html: string, re: RegExp): string {
  const m = html.match(re);
  return (m?.[1] ?? "").trim();
}

// ── Anti-SSRF ───────────────────────────────────────────────────────────
// La URL la escribe el usuario y la descarga ESTE servidor: sin filtro se podía
// apuntar a localhost, a la red interna o al endpoint de metadatos y leer la
// respuesta. Solo http(s), puertos web, sin IPs privadas (tampoco tras resolver
// el DNS ni tras una redirección) y con tope de tamaño.
const PRIVATE_V4 = [
  /^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^192\.0\.0\./, /^198\.1[89]\./, /^(22[4-9]|2[3-5]\d)\./,
];
const BLOCKED = "Host no permitido.";

function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (v.includes(":")) {
    if (v === "::1" || v === "::") return true;
    if (/^f[cd]/.test(v) || /^fe[89ab]/.test(v)) return true; // ULA y link-local
    if (v.startsWith("::ffff:")) return true;                  // IPv4 mapeada: no hace falta para una landing
    return false;
  }
  return PRIVATE_V4.some((re) => re.test(v));
}

async function assertPublicUrl(raw: string): Promise<URL> {
  const u = new URL(raw); // normaliza 2130706433, 0x7f.1, etc. a 127.0.0.1
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Solo se admiten URLs http(s).");
  if (u.username || u.password) throw new Error("URL no permitida.");
  if (u.port && !["80", "443", "8080", "8443"].includes(u.port)) throw new Error("Puerto no permitido.");
  const host = u.hostname.toLowerCase();
  if (host.includes(":") || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (isPrivateIp(host)) throw new Error(BLOCKED);
    return u;
  }
  if (!host.includes(".") || /(^|\.)(localhost|local|internal|lan|home|corp|intranet)$/.test(host)) throw new Error(BLOCKED);
  // Un dominio público puede apuntar a una IP privada: se resuelve y se revisa. Si no se pudo
  // resolver NINGUNA dirección, se bloquea (antes un DNS que fallaba adrede dejaba pasar la URL).
  let resolved = 0;
  for (const type of ["A", "AAAA"] as const) {
    let ips: string[] = [];
    try { ips = await Deno.resolveDns(host, type); } catch { /* sin registro de ese tipo, o DNS no disponible */ }
    if (ips.some(isPrivateIp)) throw new Error(BLOCKED);
    resolved += ips.length;
  }
  if (resolved === 0) throw new Error(BLOCKED);
  return u;
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) { await reader.cancel(); break; }
    chunks.push(value);
  }
  const buf = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.length; }
  return new TextDecoder().decode(buf);
}

// ── Compuerta de usuario ────────────────────────────────────────────────
// verify_jwt del gateway NO basta: la llave pública (anon) que viaja en el
// bundle de la web también es un JWT válido, y con ella cualquiera llamaba a
// esta función sin cuenta y sin gastar créditos. Aquí se exige un USUARIO real
// con acceso vigente y se aplica un tope de uso por usuario (RPC edge_guard).
async function requireUser(req: Request, fn: string, maxHour: number, maxDay: number): Promise<{ userId: string } | Response> {
  const deny = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return deny(401, "Inicia sesión para usar esta función.");
  const guard = createGuardClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await guard.auth.getUser(token);
  const userId = data?.user?.id;
  if (!userId) return deny(401, "Sesión inválida o expirada. Vuelve a iniciar sesión.");
  const { data: g, error } = await guard.rpc("edge_guard", { p_user_id: userId, p_fn: fn, p_max_hour: maxHour, p_max_day: maxDay });
  if (error) return deny(503, "No se pudo verificar el acceso. Intenta de nuevo.");
  if (g?.ok !== true) {
    return g?.reason === "rate_limited"
      ? deny(429, "Alcanzaste el límite de uso de esta función. Intenta más tarde.")
      : deny(403, "Tu cuenta no tiene acceso activo.");
  }
  return { userId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const gate = await requireUser(req, "fetch-landing", 60, 300);
  if (gate instanceof Response) return gate;

  try {
    const { url } = await req.json().catch(() => ({ url: "" }));
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ success: false, error: "url requerida" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: URL;
    try { parsed = await assertPublicUrl(String(url).slice(0, 2000)); } catch (e) {
      return new Response(JSON.stringify({ success: false, error: e instanceof Error && e.message !== "Invalid URL" ? e.message : "URL inválida" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const domain = parsed.hostname.replace(/^www\./, "");

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15000);

    let html = "";
    let status = 0;
    try {
      // Redirecciones a mano: cada salto se vuelve a validar (una URL pública
      // puede responder 302 hacia una dirección interna).
      let target = parsed;
      let res: Response | null = null;
      for (let hop = 0; hop < 5; hop++) {
        res = await fetch(target.toString(), {
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
          },
        });
        const loc = res.headers.get("location");
        if (res.status >= 300 && res.status < 400 && loc) {
          await res.body?.cancel();
          target = await assertPublicUrl(new URL(loc, target).toString());
          res = null;
          continue;
        }
        break;
      }
      if (!res) throw new Error("Demasiadas redirecciones.");
      status = res.status;
      html = await readCapped(res, 2_000_000);
    } finally {
      clearTimeout(t);
    }

    if (!html || status >= 400) {
      return new Response(JSON.stringify({
        success: false, domain, status,
        error: `No se pudo acceder (${status || "sin respuesta"})`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const title = pick(html, /<title[^>]*>([^<]+)<\/title>/i);
    const metaDescription = pick(html, /<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["']/i);
    const ogTitle = pick(html, /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    const ogDescription = pick(html, /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    const ogImage = pick(html, /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
    const siteName = pick(html, /<meta[^>]+property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i);

    const bodyText = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 5000);

    // Best-guess brand name
    const brandName = (siteName || ogTitle || title)
      .replace(/[|\-–—].*$/, "")
      .trim()
      .slice(0, 80) || domain;

    return new Response(JSON.stringify({
      success: true, domain, brandName,
      title, metaDescription, ogTitle, ogDescription, ogImage, bodyText, status,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
