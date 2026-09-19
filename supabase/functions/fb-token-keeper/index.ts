// SUPERNOVA — Guardián del token de Meta (Ad Library API).
//
// La Ad Library API solo acepta el token de USUARIO de una cuenta con identidad
// verificada; ese token dura ~60 días como mucho (el de "usuario del sistema", que
// no caduca, no está respaldado para esta API). Para que no vuelva a morirse en
// silencio:
//   · El token vive en Vault (un secreto de Edge Functions no se puede reescribir
//     desde código; Vault sí). FACEBOOK_ACCESS_TOKEN en los secretos es la SEMILLA:
//     basta pegar ahí cualquier token recién generado, aunque dure 1 hora.
//   · Esta función lo canjea por uno de 60 días (hace falta FACEBOOK_APP_ID y
//     FACEBOOK_APP_SECRET) y lo vuelve a canjear cuando le quedan < 45 días.
//   · Cada revisión deja su resultado en private.fb_token_meta → panel admin.
// Jamás devuelve ni registra el token: solo metadatos.
//
// verify_jwt = false (la llama pg_cron). Compuerta: secreto de cron o admin con sesión.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GRAPH = "https://graph.facebook.com/v21.0";
const RENEW_BELOW_DAYS = 45;

// deno-lint-ignore no-explicit-any
type Admin = any;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function authorize(req: Request, admin: Admin): Promise<boolean> {
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

async function graph(path: string, params: Record<string, string>, ms = 15000): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const u = new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(u.toString(), { signal: ctrl.signal });
    const body = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, body };
  } catch {
    return { ok: false, status: 0, body: { error: { message: "Meta no respondió" } } };
  } finally {
    clearTimeout(timer);
  }
}

// Mensaje de error de Meta sin arrastrar datos sensibles (el token nunca viene en él).
const fbError = (body: Record<string, unknown>) => {
  const e = (body?.error ?? {}) as Record<string, unknown>;
  return String(e.message ?? "error desconocido").slice(0, 240);
};

interface Info { valid: boolean; type: string | null; expiresAt: string | null; never: boolean; error: string | null }

async function inspect(token: string, appToken: string): Promise<Info> {
  const r = await graph("/debug_token", { input_token: token, access_token: appToken });
  const d = (r.body?.data ?? {}) as Record<string, unknown>;
  if (!r.ok || !d) return { valid: false, type: null, expiresAt: null, never: false, error: fbError(r.body) };
  const exp = Number(d.expires_at ?? 0);
  const dErr = (d.error ?? {}) as Record<string, unknown>;
  return {
    valid: d.is_valid === true,
    type: typeof d.type === "string" ? d.type : null,
    expiresAt: exp > 0 ? new Date(exp * 1000).toISOString() : null,
    never: d.is_valid === true && exp === 0,
    error: d.is_valid === true ? null : String(dErr.message ?? "token inválido").slice(0, 240),
  };
}

/** ¿La Ad Library API responde con este token? (1 resultado, lo más barato posible) */
async function probe(token: string): Promise<{ works: boolean; error: string | null }> {
  const r = await graph("/ads_archive", {
    access_token: token, search_terms: "curso", ad_reached_countries: JSON.stringify(["ES"]),
    ad_type: "ALL", ad_active_status: "ACTIVE", limit: "1", fields: "id",
  });
  return { works: r.ok, error: r.ok ? null : fbError(r.body) };
}

const daysLeft = (iso: string | null) => (iso ? Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000) : null);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (!(await authorize(req, admin))) return json(401, { error: "No autorizado" });

  try {
    const body = (await req.json().catch(() => ({}))) as { action?: string };
    const force = body.action === "renew"; // "auto" (cron) renueva solo cuando toca

    const appId = Deno.env.get("FACEBOOK_APP_ID")?.trim();
    const appSecret = Deno.env.get("FACEBOOK_APP_SECRET")?.trim();
    const envTok = Deno.env.get("FACEBOOK_ACCESS_TOKEN")?.trim() || null;
    const { data: vaultRaw } = await admin.rpc("get_fb_token");
    const vaultTok = typeof vaultRaw === "string" && vaultRaw.length > 20 ? vaultRaw : null;

    const save = (token: string | null, i: { valid: boolean; works: boolean; type: string | null; expiresAt: string | null; source: string; renewed: boolean; error: string | null }) =>
      admin.rpc("fb_token_save", {
        p_token: token, p_is_valid: i.valid, p_works: i.works, p_token_type: i.type,
        p_expires_at: i.expiresAt, p_source: i.source, p_renewed: i.renewed, p_error: i.error,
      });

    if (!vaultTok && !envTok) {
      await save(null, { valid: false, works: false, type: null, expiresAt: null, source: "ninguno", renewed: false, error: "No hay token de Meta configurado" });
      return json(200, { ok: false, step: "sin_token", todo: "Pega un token en el secreto FACEBOOK_ACCESS_TOKEN" });
    }

    // Sin credenciales de la app no se puede inspeccionar ni canjear: solo se prueba.
    if (!appId || !appSecret) {
      for (const [source, tok] of [["vault", vaultTok], ["env", envTok]] as const) {
        if (!tok) continue;
        const p = await probe(tok);
        if (p.works) {
          await save(source === "env" ? tok : null, { valid: true, works: true, type: null, expiresAt: null, source, renewed: false, error: "Faltan FACEBOOK_APP_ID y FACEBOOK_APP_SECRET: no se puede renovar solo" });
          return json(200, { ok: true, works: true, source, auto_renew: false, todo: "Agrega FACEBOOK_APP_ID y FACEBOOK_APP_SECRET para que se renueve solo" });
        }
      }
      const p = await probe((vaultTok ?? envTok)!);
      await save(null, { valid: false, works: false, type: null, expiresAt: null, source: vaultTok ? "vault" : "env", renewed: false, error: p.error });
      return json(200, { ok: false, works: false, error: p.error, todo: "Genera un token nuevo y agrega FACEBOOK_APP_ID y FACEBOOK_APP_SECRET" });
    }

    const appToken = `${appId}|${appSecret}`;
    // Candidatos: el de Vault y la semilla de los secretos. Gana el válido que más dure.
    const seen = new Set<string>();
    const candidates: { source: string; token: string; info: Info }[] = [];
    for (const [source, tok] of [["vault", vaultTok], ["env", envTok]] as const) {
      if (!tok || seen.has(tok)) continue;
      seen.add(tok);
      candidates.push({ source, token: tok, info: await inspect(tok, appToken) });
    }
    const valid = candidates.filter((c) => c.info.valid)
      .sort((a, b) => (b.info.never ? Infinity : new Date(b.info.expiresAt ?? 0).getTime()) - (a.info.never ? Infinity : new Date(a.info.expiresAt ?? 0).getTime()));

    if (valid.length === 0) {
      const err = candidates.map((c) => `${c.source}: ${c.info.error}`).join(" · ");
      await save(null, { valid: false, works: false, type: null, expiresAt: null, source: candidates[0]?.source ?? "ninguno", renewed: false, error: err });
      return json(200, { ok: false, step: "token_invalido", error: err, todo: "Genera un token nuevo en el Graph API Explorer y pégalo en FACEBOOK_ACCESS_TOKEN" });
    }

    let best = valid[0];
    let renewed = false;
    let renewError: string | null = null;
    const left = daysLeft(best.info.expiresAt);
    const shouldRenew = !best.info.never && (force || left === null || left < RENEW_BELOW_DAYS || best.source === "env");

    if (shouldRenew) {
      const x = await graph("/oauth/access_token", {
        grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: best.token,
      });
      const fresh = typeof x.body?.access_token === "string" ? (x.body.access_token as string) : null;
      if (x.ok && fresh) {
        const info = await inspect(fresh, appToken);
        if (info.valid) { best = { source: "vault", token: fresh, info }; renewed = true; }
        else renewError = `El token canjeado no es válido: ${info.error}`;
      } else {
        renewError = `No se pudo canjear: ${fbError(x.body)}`;
      }
    }

    const p = await probe(best.token);
    // Se guarda en Vault si es nuevo o si venía de la semilla; si ya estaba en Vault no se reescribe.
    await save(renewed || best.source === "env" ? best.token : null, {
      valid: true, works: p.works, type: best.info.type, expiresAt: best.info.expiresAt,
      source: "vault", renewed, error: p.works ? renewError : (p.error ?? renewError),
    });

    return json(200, {
      ok: p.works, works: p.works, renewed, token_type: best.info.type,
      expires_at: best.info.expiresAt, days_left: daysLeft(best.info.expiresAt), never_expires: best.info.never,
      auto_renew: true, error: p.works ? renewError : (p.error ?? renewError),
    });
  } catch (e) {
    console.error("fb-token-keeper:", e instanceof Error ? e.name : "error");
    return json(500, { error: "No se pudo revisar el token" });
  }
});
