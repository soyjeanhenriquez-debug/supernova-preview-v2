import { supabase } from "@/integrations/supabase/client";
import { toWebp } from "@/lib/brandKit";

/**
 * Bono "Publica lo que hiciste con SUPERNOVA" (06-oct-2026, decisión de Jean): 50 créditos por
 * publicar en redes algo hecho con una herramienta, con el enlace del post y una captura.
 * Máximo 1 al día y 1.000 al mes. TODO lo decide el servidor (RPC claim_publish_bonus); aquí solo
 * se sube la captura y se muestra el resultado. Un admin revisa en Admin → Misiones.
 */

export interface BonusStatus {
  perClaim: number; monthCap: number; monthTotal: number; claimedToday: boolean; claimedItems: string[];
}

export interface MissionClaim {
  id: string; user_id: string; content_item_id: string | null; network: string; post_url: string;
  screenshot_path: string; credits: number; status: "granted" | "revoked"; claim_day: string;
  revoke_reason: string | null; created_at: string;
}

// La tabla y las RPC son nuevas: aún no están en los tipos generados de Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export async function getBonusStatus(): Promise<BonusStatus | null> {
  // Si la función aún no existe en la base (o falla la red), no se muestra nada del bono.
  let data: Record<string, unknown> | null = null;
  try {
    const r = await db.rpc("publish_bonus_status");
    if (r.error) return null;
    data = r.data;
  } catch { return null; }
  if (!data) return null;
  return {
    perClaim: Number(data.per_claim) || 50, monthCap: Number(data.month_cap) || 1000,
    monthTotal: Number(data.month_total) || 0, claimedToday: !!data.claimed_today,
    claimedItems: Array.isArray(data.claimed_items) ? data.claimed_items.map(String) : [],
  };
}

/** Red social de un enlace, para avisar antes de enviar (el servidor vuelve a comprobarlo). */
export function networkOf(url: string): string | null {
  const m = /^https:\/\/([^/\s?#]+)\/\S+$/i.exec(url.trim());
  if (!m) return null;
  const h = m[1].toLowerCase().replace(/:\d+$/, "").replace(/^(www|m|mobile|vm|vt)\./, "");
  if (h === "instagram.com" || h === "instagr.am") return "Instagram";
  if (h === "tiktok.com") return "TikTok";
  if (h === "youtube.com" || h === "youtu.be") return "YouTube";
  if (h === "facebook.com" || h === "fb.watch" || h === "fb.com") return "Facebook";
  if (h === "threads.net" || h === "threads.com") return "Threads";
  if (h === "x.com" || h === "twitter.com") return "X";
  if (h === "linkedin.com") return "LinkedIn";
  return null;
}

/** Captura del post → WebP ≤ 1280 px en misiones/<uid>/<fecha>.webp. Devuelve la ruta. */
export async function uploadScreenshot(uid: string, file: File): Promise<string> {
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) throw new Error("Sube la captura en JPG, PNG o WebP.");
  if (file.size > 15 * 1024 * 1024) throw new Error("La captura pesa demasiado (máximo 15 MB).");
  const blob = await toWebp(file, 1280, 0.82);
  if (blob.size > 2 * 1024 * 1024) throw new Error("La captura sigue pesando más de 2 MB. Prueba con otra.");
  const path = `${uid}/${Date.now()}.webp`;
  const { error } = await supabase.storage.from("misiones").upload(path, blob, { contentType: "image/webp", upsert: false });
  if (error) throw new Error("No se pudo subir la captura. Intenta de nuevo.");
  return path;
}

const ERRORS: Record<string, string> = {
  no_auth: "Inicia sesión para reclamar tu bono.",
  no_access: "El bono es para miembros con plan activo.",
  item: "Esta pieza no salió de una herramienta de SUPERNOVA.",
  url: "Pega el enlace del post (https://…) de Instagram, TikTok, YouTube, Facebook, Threads, X o LinkedIn.",
  shot: "Sube la captura de tu publicación.",
  used: "Ese post ya recibió su bono.",
  today: "Ya ganaste tu bono de hoy. Vuelve mañana.",
  month_cap: "Llegaste al máximo de bonos de este mes.",
};

export type ClaimResult = { ok: true; amount: number; balance: number; monthTotal: number } | { ok: false; message: string };

export async function claimBonus(itemId: string, url: string, shotPath: string): Promise<ClaimResult> {
  const { data, error } = await db.rpc("claim_publish_bonus", { p_item: itemId, p_url: url.trim(), p_shot: shotPath });
  if (error || !data) return { ok: false, message: "No se pudo reclamar ahora. Intenta de nuevo." };
  if (data.ok) return { ok: true, amount: Number(data.amount) || 0, balance: Number(data.balance) || 0, monthTotal: Number(data.month_total) || 0 };
  return { ok: false, message: ERRORS[data.error] ?? "No se pudo reclamar el bono." };
}

// ── Admin ───────────────────────────────────────────────────────────────
export async function listClaims(status: MissionClaim["status"]): Promise<MissionClaim[]> {
  const { data, error } = await db.from("mission_claims")
    .select("id,user_id,content_item_id,network,post_url,screenshot_path,credits,status,claim_day,revoke_reason,created_at")
    .eq("status", status).order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as MissionClaim[];
}

export async function screenshotUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("misiones").createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

export async function revokeClaim(id: string, reason: string): Promise<boolean> {
  const { data, error } = await db.rpc("admin_revoke_mission_claim", { p_id: id, p_reason: reason.slice(0, 200) });
  return !error && !!data?.ok;
}
