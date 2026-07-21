// SUPERNOVA — Media Studio: lista de avatares/voces de HeyGen para el picker.
// Sin HEYGEN_API_KEY responde en modo simulado (dry_run) con una lista fija,
// para poder desarrollar y probar todo el flujo sin gastar dinero real.
//
// El endpoint plano /v2/avatars nunca responde en cuentas reales probadas
// (timeout, aparentemente devuelve el catálogo público entero). El flujo que
// SÍ funciona (confirmado con la cuenta real) es por grupos:
//   GET /v2/avatar_group.list                      → grupos del usuario
//   GET /v2/avatar_group/{group_id}/avatars         → looks/avatares del grupo
// Cada avatar trae su default_voice_id, así el usuario no necesita elegir
// voz aparte (aunque se sigue exponiendo /v2/voices por si quiere cambiarla).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const DRY_RUN_AVATARS = [
  { avatar_id: "dryrun_avatar_male_1", avatar_name: "Carlos (demo)", preview_image_url: null, gender: "male", default_voice_id: null },
  { avatar_id: "dryrun_avatar_female_1", avatar_name: "Valentina (demo)", preview_image_url: null, gender: "female", default_voice_id: null },
];
const DRY_RUN_VOICES = [
  { voice_id: "dryrun_voice_es_1", name: "Español LATAM (demo)", language: "es" },
  { voice_id: "dryrun_voice_en_1", name: "English US (demo)", language: "en" },
];

const MAX_GROUPS = 8; // suficiente para un picker de UI, evita N llamadas innecesarias

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const apiKey = Deno.env.get("HEYGEN_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ avatars: DRY_RUN_AVATARS, voices: DRY_RUN_VOICES, dry_run: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Timeout duro por request: si HeyGen no responde, fallar rápido con un
  // error claro en vez de colgar la función indefinidamente.
  const withTimeout = async (url: string, ms = 12000) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { headers: { "X-Api-Key": apiKey, Accept: "application/json" }, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  };

  try {
    const groupsRes = await withTimeout("https://api.heygen.com/v2/avatar_group.list");
    if (!groupsRes.ok) {
      const detail = await groupsRes.text();
      return new Response(JSON.stringify({ error: "Error listando grupos de avatares", detail: detail.slice(0, 500) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const groupsData = await groupsRes.json();
    const groups = (groupsData?.data?.avatar_group_list ?? []).slice(0, MAX_GROUPS) as Array<Record<string, unknown>>;

    const avatarLists = await Promise.all(
      groups.map((g) =>
        withTimeout(`https://api.heygen.com/v2/avatar_group/${g.id}/avatars`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ),
    );

    // Los grupos de esta ruta (avatar_group.list → .../avatars) son "Photo
    // Avatars" (business_type "uploaded") — en la API de HeyGen esto es un
    // talking_photo, con su propio formato en video/generate (no "avatar").
    const avatars: Array<{ avatar_id: string; avatar_name: string; preview_image_url: string | null; default_voice_id: string | null; kind: "talking_photo" | "avatar" }> = [];
    groups.forEach((g, i) => {
      const list = (avatarLists[i]?.data?.avatar_list ?? []) as Array<Record<string, unknown>>;
      const usable = list.find((a) => a.status === "completed") ?? list[0];
      if (usable) {
        avatars.push({
          avatar_id: String(usable.id),
          avatar_name: String(g.name ?? usable.name ?? "Avatar"),
          preview_image_url: (usable.image_url as string) ?? (g.preview_image as string) ?? null,
          default_voice_id: (usable.default_voice_id as string) ?? null,
          kind: "talking_photo",
        });
      }
    });

    const voicesRes = await withTimeout("https://api.heygen.com/v2/voices");
    let voices: Array<{ voice_id: string; name: string; language: string | null }> = [];
    if (voicesRes.ok) {
      const voicesData = await voicesRes.json();
      const rawVoices = (voicesData?.data?.voices ?? []) as Array<Record<string, unknown>>;
      voices = rawVoices.slice(0, 30).map((v) => ({
        voice_id: String(v.voice_id), name: String(v.name ?? v.voice_id), language: (v.language as string) ?? null,
      }));
    }

    if (avatars.length === 0) {
      return new Response(JSON.stringify({ error: "No se encontraron avatares en tu cuenta de HeyGen" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ avatars, voices, dry_run: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "AbortError";
    return new Response(JSON.stringify({ error: timedOut ? "HeyGen no respondió a tiempo" : (e instanceof Error ? e.message : "Unknown") }), {
      status: timedOut ? 504 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
