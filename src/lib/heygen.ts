import { supabase } from "@/integrations/supabase/client";

export interface HeygenAvatar {
  avatar_id: string; avatar_name: string; preview_image_url: string | null;
  default_voice_id?: string | null; kind?: "talking_photo" | "avatar";
}
export interface HeygenVoice { voice_id: string; name: string; language: string | null }
export interface MediaJob {
  id: string;
  script: string;
  avatar_id: string | null;
  voice_id: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  video_url: string | null;
  cost_media_credits: number;
  dry_run: boolean;
  error: string | null;
  created_at: string;
  updated_at: string;
}

const FN_URL = (name: string) => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`;

/** Headers con el JWT real de la sesión (no el anon key) — necesario porque
 *  heygen-generate-video resuelve al usuario desde este token para saber a
 *  quién descontarle Media Credits. */
async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    "Content-Type": "application/json",
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function listAvatars(): Promise<{ avatars: HeygenAvatar[]; voices: HeygenVoice[]; dry_run: boolean }> {
  const res = await fetch(FN_URL("heygen-list-avatars"), { headers: await authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Error cargando avatares");
  return data;
}

export async function generateVideo(params: { script: string; avatar_id: string; voice_id: string; kind?: "talking_photo" | "avatar" }): Promise<{ id: string; status: string; dry_run: boolean; balance?: number }> {
  const res = await fetch(FN_URL("heygen-generate-video"), {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Error generando el video");
  return data;
}

/** Extrae un hook hablable (texto plano, sin Markdown) de las primeras ~150
 *  palabras de un guion — usado para pasarle a HeyGen solo el arranque del
 *  VSL, no el guion completo (que excede el límite de duración de un hook). */
export function extractHookFromScript(script: string, maxWords = 150): string {
  const plain = script
    .replace(/```[\s\S]*?```/g, " ")           // bloques de código
    .replace(/^#{1,6}\s.*$/gm, " ")             // encabezados markdown
    .replace(/\*\*(.*?)\*\*/g, "$1")            // negritas
    .replace(/\d{1,2}:\d{2}/g, " ")             // timestamps 0:00
    .replace(/[*_>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.split(" ").slice(0, maxWords).join(" ");
}

export async function fetchRecentJobs(limit = 10): Promise<MediaJob[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data } = await supabase
    .from("media_generation_jobs")
    .select("id, script, avatar_id, voice_id, status, video_url, cost_media_credits, dry_run, error, created_at, updated_at")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as MediaJob[]) ?? [];
}
