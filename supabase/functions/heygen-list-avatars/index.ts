// SUPERNOVA — Media Studio: avatares y voces de HeyGen para el selector.
// Sin HEYGEN_API_KEY responde en modo simulado (dry_run) con una lista fija,
// para poder desarrollar y probar todo el flujo sin gastar dinero real.
//
// API v3 (HeyGen apaga v1/v2 el 2026-10-31):
//   GET /v3/avatars?ownership=private             → grupos propios (el nombre que el usuario reconoce)
//   GET /v3/avatars/looks?group_id=…              → "looks" de cada grupo: su id es el avatar_id de POST /v3/videos
//   GET /v3/voices                           → voces (clonadas primero, luego español)
// Cada look trae su default_voice_id, así el usuario no tiene que elegir voz.
// Todas las listas van paginadas y con tope: el catálogo público entero nos
// colgaba la petición en v2.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient as createGuardClient } from "npm:@supabase/supabase-js@2";

const HEYGEN_API = "https://api.heygen.com";
const MAX_GROUPS = 10;      // grupos propios que se muestran
const LOOKS_PER_GROUP = 4;  // un grupo con 15 looks no debe tapar a los demás
const MAX_AVATARS = 24;
const MAX_VOICES = 80;

const DRY_RUN_AVATARS = [
  { avatar_id: "dryrun_avatar_male_1", avatar_name: "Carlos (demo)", preview_image_url: null, gender: "male", default_voice_id: null },
  { avatar_id: "dryrun_avatar_female_1", avatar_name: "Valentina (demo)", preview_image_url: null, gender: "female", default_voice_id: null },
];
const DRY_RUN_VOICES = [
  { voice_id: "dryrun_voice_es_1", name: "Español LATAM (demo)", language: "es" },
  { voice_id: "dryrun_voice_en_1", name: "English US (demo)", language: "en" },
];

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ── Compuerta de usuario ────────────────────────────────────────────────
// verify_jwt del gateway NO basta: la llave pública (anon) que viaja en el
// bundle de la web también es un JWT válido, y con ella cualquiera llamaba a
// esta función sin cuenta y sin gastar créditos. Aquí se exige un USUARIO real
// con acceso vigente y se aplica un tope de uso por usuario (RPC edge_guard).
async function requireUser(req: Request, fn: string, maxHour: number, maxDay: number): Promise<{ userId: string } | Response> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(401, { error: "Inicia sesión para usar esta función." });
  const guard = createGuardClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await guard.auth.getUser(token);
  const userId = data?.user?.id;
  if (!userId) return json(401, { error: "Sesión inválida o expirada. Vuelve a iniciar sesión." });
  const { data: g, error } = await guard.rpc("edge_guard", { p_user_id: userId, p_fn: fn, p_max_hour: maxHour, p_max_day: maxDay });
  if (error) return json(503, { error: "No se pudo verificar el acceso. Intenta de nuevo." });
  if (g?.ok !== true) {
    return g?.reason === "rate_limited"
      ? json(429, { error: "Alcanzaste el límite de uso de esta función. Intenta más tarde." })
      : json(403, { error: "Tu cuenta no tiene acceso activo." });
  }
  return { userId };
}

type Row = Record<string, unknown>;
const httpsOrNull = (v: unknown) => (typeof v === "string" && /^https:\/\//i.test(v) && v.length < 2000 ? v : null);
const strOrNull = (v: unknown) => (typeof v === "string" && v ? v : null);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const gate = await requireUser(req, "heygen-list-avatars", 60, 300);
  if (gate instanceof Response) return gate;

  const apiKey = Deno.env.get("HEYGEN_API_KEY");
  if (!apiKey) return json(200, { avatars: DRY_RUN_AVATARS, voices: DRY_RUN_VOICES, dry_run: true });

  // Una página de una lista v3 ({ data: [...] }). Timeout duro por petición: si
  // HeyGen no responde se falla rápido en vez de colgar la función. null = falló.
  const list = async (path: string, ms = 12000): Promise<Row[] | null> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(`${HEYGEN_API}${path}`, { headers: { "x-api-key": apiKey, Accept: "application/json" }, signal: ctrl.signal });
      if (!r.ok) {
        console.error("heygen-list-avatars:", path.split("?")[0], "→", r.status, (await r.text()).slice(0, 200));
        return null;
      }
      const body = await r.json().catch(() => null);
      return Array.isArray(body?.data) ? (body.data as Row[]) : [];
    } catch (e) {
      console.error("heygen-list-avatars:", path.split("?")[0], "→", e instanceof Error ? e.name : e);
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  // Los avatares y voces PRIVADOS de la cuenta de HeyGen son la cara y la voz clonada del
  // dueño: solo los ve un admin. Un cliente recibe el catálogo público (si no, cualquiera
  // podía hacer videos con la cara y la voz de Jean).
  const guard = createGuardClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: adminRole } = await guard.from("user_roles").select("role").eq("user_id", gate.userId).eq("role", "admin").maybeSingle();
  const isAdmin = !!adminRole;

  const usable = (l: Row) => !l.status || l.status === "completed";
  const [groups, ownVoices, esVoices, anyVoices] = await Promise.all([
    isAdmin ? list("/v3/avatars?ownership=private&limit=50") : Promise.resolve([] as Row[]),
    isAdmin ? list("/v3/voices?type=private&limit=50") : Promise.resolve([] as Row[]),
    list("/v3/voices?type=public&language=Spanish&limit=40"),
    list("/v3/voices?type=public&limit=30"),
  ]);
  if (groups === null) return json(502, { error: "HeyGen no respondió. Intenta de nuevo en un momento." });

  // Looks por grupo y repartidos por turnos (el 1º de cada grupo, luego el 2º…):
  // así aparecen todos los avatares del usuario y no solo el grupo más grande.
  const shownGroups = groups.filter(usable).slice(0, MAX_GROUPS);
  const perGroup = await Promise.all(shownGroups.map((g) =>
    list(`/v3/avatars/looks?ownership=private&group_id=${encodeURIComponent(String(g.id))}&limit=${LOOKS_PER_GROUP * 2}`)));
  let looks: Row[] = [];
  for (let i = 0; i < LOOKS_PER_GROUP; i++) {
    for (const arr of perGroup) {
      const l = (arr ?? []).filter(usable)[i];
      if (l) looks.push(l);
    }
  }
  // Sin avatares propios: unos cuantos del catálogo para que el selector no quede vacío.
  if (looks.length === 0) {
    looks = ((await list(`/v3/avatars/looks?ownership=public&limit=${MAX_AVATARS}`)) ?? []).filter(usable);
  }

  const groupById = new Map<string, Row>(groups.map((g) => [String(g.id), g]));
  const seenInGroup = new Map<string, number>();
  const GENERIC = /^(photo avatar|avatar|look|untitled|sin t[ií]tulo)$/i;

  const avatars = looks.slice(0, MAX_AVATARS).map((l) => {
    const gid = String(l.group_id ?? "");
    const group = groupById.get(gid);
    const groupName = strOrNull(group?.name);
    const lookName = strOrNull(l.name);
    const n = (seenInGroup.get(gid) ?? 0) + 1;
    seenInGroup.set(gid, n);
    // El 1º de cada grupo lleva el nombre que el usuario le puso al grupo; los
    // demás, el nombre del look si dice algo, o un número.
    const name = !groupName
      ? (lookName ?? "Avatar")
      : n === 1 ? groupName
      : (lookName && lookName !== groupName && !GENERIC.test(lookName) ? `${groupName} · ${lookName}` : `${groupName} · ${n}`);
    return {
      avatar_id: String(l.id),
      avatar_name: name,
      preview_image_url: httpsOrNull(l.preview_image_url) ?? httpsOrNull(group?.preview_image_url),
      default_voice_id: strOrNull(l.default_voice_id) ?? strOrNull(group?.default_voice_id),
      gender: strOrNull(l.gender),
      // Compatibilidad con el cliente: en v3 todos los avatares se piden igual.
      kind: "avatar" as const,
    };
  });

  if (avatars.length === 0) {
    return json(404, { error: "No se encontraron avatares en la cuenta de HeyGen." });
  }

  // Voces: primero las clonadas del dueño de la cuenta, luego español, luego el resto.
  const seen = new Set<string>();
  const voices: Array<{ voice_id: string; name: string; language: string | null }> = [];
  for (const v of [...(ownVoices ?? []), ...(esVoices ?? []), ...(anyVoices ?? [])]) {
    const id = strOrNull(v.voice_id);
    if (!id || seen.has(id) || voices.length >= MAX_VOICES) continue;
    seen.add(id);
    voices.push({ voice_id: id, name: strOrNull(v.name) ?? id, language: strOrNull(v.language) });
  }

  // La voz recomendada de cada avatar siempre debe poder elegirse, aunque no
  // haya salido en las páginas de voces pedidas arriba.
  for (const a of avatars) {
    if (a.default_voice_id && !seen.has(a.default_voice_id)) {
      seen.add(a.default_voice_id);
      voices.unshift({ voice_id: a.default_voice_id, name: `Voz de ${a.avatar_name}`, language: null });
    }
  }

  return json(200, { avatars, voices, dry_run: false });
});
