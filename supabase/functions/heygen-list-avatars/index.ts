// SUPERNOVA — Media Studio: lista de avatares/voces de HeyGen para el picker.
// Sin HEYGEN_API_KEY responde en modo simulado (dry_run) con una lista fija,
// para poder desarrollar y probar todo el flujo sin gastar dinero real.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const DRY_RUN_AVATARS = [
  { avatar_id: "dryrun_avatar_male_1", avatar_name: "Carlos (demo)", preview_image_url: null, gender: "male" },
  { avatar_id: "dryrun_avatar_female_1", avatar_name: "Valentina (demo)", preview_image_url: null, gender: "female" },
];
const DRY_RUN_VOICES = [
  { voice_id: "dryrun_voice_es_1", name: "Español LATAM (demo)", language: "es" },
  { voice_id: "dryrun_voice_en_1", name: "English US (demo)", language: "en" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const apiKey = Deno.env.get("HEYGEN_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ avatars: DRY_RUN_AVATARS, voices: DRY_RUN_VOICES, dry_run: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const [avatarsRes, voicesRes] = await Promise.all([
      fetch("https://api.heygen.com/v2/avatars", { headers: { "X-Api-Key": apiKey } }),
      fetch("https://api.heygen.com/v2/voices", { headers: { "X-Api-Key": apiKey } }),
    ]);

    if (!avatarsRes.ok || !voicesRes.ok) {
      const bad = avatarsRes.ok ? voicesRes : avatarsRes;
      const detail = await bad.text();
      return new Response(JSON.stringify({ error: "Error consultando HeyGen", detail: detail.slice(0, 500) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const avatarsData = await avatarsRes.json();
    const voicesData = await voicesRes.json();

    // Tolerante a variaciones de forma: HeyGen suele anidar bajo `data`.
    const rawAvatars = avatarsData?.data?.avatars ?? avatarsData?.data ?? [];
    const rawVoices = voicesData?.data?.voices ?? voicesData?.data ?? [];

    const avatars = (Array.isArray(rawAvatars) ? rawAvatars : []).slice(0, 24).map((a: Record<string, unknown>) => ({
      avatar_id: a.avatar_id, avatar_name: a.avatar_name ?? a.avatar_id,
      preview_image_url: a.preview_image_url ?? null, gender: a.gender ?? null,
    }));
    const voices = (Array.isArray(rawVoices) ? rawVoices : []).slice(0, 24).map((v: Record<string, unknown>) => ({
      voice_id: v.voice_id, name: v.name ?? v.voice_id, language: v.language ?? null,
    }));

    return new Response(JSON.stringify({ avatars, voices, dry_run: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
