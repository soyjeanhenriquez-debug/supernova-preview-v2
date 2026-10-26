// SUPERNOVA — Para publicar (26-oct-2026, pedido de Jean): programa en Upload-Post una pieza de la biblioteca
// (content_items con slot_at y archivos en el bucket privado «publicaciones») y deja Notion al día.
//
//   programar { item_id } → sube el reel (video) o el carrusel (fotos) a Upload-Post con scheduled_date = la casilla.
//                           Responde 202 con job_id: la pieza queda «programado». Si falla, «error» con el motivo.
//   notion    { item_id } → crea o actualiza su página en Notion → 🎞️ Reels de Referencia (estado, fecha, hora, copy).
//
// Hoy solo la cuenta de Jean (su perfil de Upload-Post y su Notion). Compuerta en el servidor: el token debe ser
// de su usuario (id y correo). Secretos (nunca salen al cliente): UPLOAD_POST_API_KEY, UPLOAD_POST_USER
// (por defecto "default"), NOTION_TOKEN y NOTION_DB (por defecto la base 🎞️ Reels de Referencia).
// Docs leídas el 26-oct-2026: docs.upload-post.com/api/upload-video y /api/upload-photo; Notion API 2022-06-28.
import { corsHeaders } from "npm:@supabase/supabase-js@2.117.1/cors";
import { createClient } from "npm:@supabase/supabase-js@2.117.1";

const OWNER_ID = "2687ca65-02c7-40db-b2fc-8ed0d57a4424";
const OWNER_EMAIL = "soyjeanhenriquez@gmail.com";
const UP = "https://api.upload-post.com/api";
const NOTION_DB_DEF = "de531176-e53f-4ee8-ab8c-214e521fbbd6";
const REDES_VIDEO = new Set(["instagram", "youtube", "tiktok", "facebook"]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function owner(req: Request): Promise<string | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data } = await admin().auth.getUser(token);
  const u = data?.user;
  return u && u.id === OWNER_ID && (u.email ?? "").toLowerCase() === OWNER_EMAIL ? u.id : null;
}

type Item = {
  id: string; user_id: string; title: string | null; topic: string; caption: string | null; slot_at: string | null;
  media_tipo: "reel" | "carrusel" | null; media_paths: string[]; pub_redes: string[]; pub_estado: string; notion_page: string | null;
};

/** Primera línea del copy, para YouTube (que pide título). */
const tituloDe = (it: Item) => (it.title || (it.caption ?? "").split("\n")[0] || it.topic).replace(/\s+/g, " ").trim().slice(0, 95);

async function programar(it: Item): Promise<{ ok: true; job: string } | { ok: false; error: string }> {
  const key = Deno.env.get("UPLOAD_POST_API_KEY");
  if (!key) return { ok: false, error: "Falta conectar Upload-Post: guarda tu llave en los secretos (UPLOAD_POST_API_KEY)." };
  if (!it.slot_at) return { ok: false, error: "La pieza no tiene casilla (día y hora)." };
  if (new Date(it.slot_at).getTime() < Date.now() + 5 * 60_000) return { ok: false, error: "Esa hora ya pasó o está por pasar: muévela a otra casilla." };
  if (!it.media_paths.length) return { ok: false, error: "Falta el archivo: sube el reel o las fotos del carrusel." };
  const db = admin();
  const form = new FormData();
  form.append("user", Deno.env.get("UPLOAD_POST_USER") ?? "default");
  form.append("scheduled_date", new Date(it.slot_at).toISOString());
  const caption = (it.caption ?? "").slice(0, 2200);
  form.append("title", it.media_tipo === "reel" ? tituloDe(it) : caption);
  if (it.media_tipo === "reel") {
    const redes = it.pub_redes.filter(r => REDES_VIDEO.has(r));
    if (!redes.length) return { ok: false, error: "Elige al menos una red." };
    redes.forEach(r => form.append("platform[]", r));
    form.append("description", caption);
    form.append("instagram_title", caption);
    const { data: file, error } = await db.storage.from("publicaciones").download(it.media_paths[0]);
    if (error || !file) return { ok: false, error: "No se encontró el video en la biblioteca." };
    form.append("video", file, "reel.mp4");
  } else {
    form.append("platform[]", "instagram");
    for (const [k, p] of it.media_paths.slice(0, 10).entries()) {
      const { data: file } = await db.storage.from("publicaciones").download(p);
      if (!file) return { ok: false, error: `No se encontró la lámina ${k + 1}.` };
      form.append("photos[]", file, `lamina-${k + 1}.${(file.type.split("/")[1] || "jpg").replace("jpeg", "jpg")}`);
    }
  }
  const r = await fetch(`${UP}/${it.media_tipo === "reel" ? "upload" : "upload_photos"}`, {
    method: "POST",
    headers: { Authorization: `Apikey ${key}`, "Idempotency-Key": `${it.id}-${it.slot_at}` },
    body: form,
    signal: AbortSignal.timeout(120_000),
  }).catch(e => { console.error("upload-post:", e); return null; });
  if (!r) return { ok: false, error: "Upload-Post no respondió. Toca Programar otra vez en un momento." };
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d?.success === false) {
    console.error("upload-post:", r.status, JSON.stringify(d).slice(0, 300));
    const msg = r.status === 429 ? "Llegaste al tope de publicaciones del mes en Upload-Post (plan gratis)."
      : r.status === 403 ? "Tu plan de Upload-Post no permite esto (por ejemplo TikTok en el plan gratis)."
      : r.status === 401 ? "Upload-Post rechazó la llave. Revisa UPLOAD_POST_API_KEY."
      : r.status === 404 ? "No se encontró tu perfil de Upload-Post (UPLOAD_POST_USER)."
      : "Upload-Post no aceptó la publicación. Revisa el archivo y vuelve a programar.";
    return { ok: false, error: msg };
  }
  return { ok: true, job: String(d?.job_id ?? d?.request_id ?? "programado") };
}

/** Crea o actualiza la página en Notion. Sin NOTION_TOKEN no hace nada (y lo dice). */
async function notion(it: Item, estado: string): Promise<string | null> {
  const token = Deno.env.get("NOTION_TOKEN");
  if (!token) return null;
  const estadoNotion = estado === "publicado" ? "🚀 Publicado" : estado === "programado" ? "📅 Programado" : "✂️ En edición";
  const plataformas = (it.media_tipo === "carrusel" ? ["instagram"] : it.pub_redes)
    .map(r => ({ instagram: "IG", tiktok: "TikTok", youtube: "YouTube Shorts", facebook: "FB" } as Record<string, string>)[r]).filter(Boolean);
  const props: Record<string, unknown> = {
    Nombre: { title: [{ text: { content: (it.title || it.topic).slice(0, 200) } }] },
    Estado: { status: { name: estadoNotion } },
    "Copy final de publicación": { rich_text: [{ text: { content: (it.caption ?? "").slice(0, 1900) } }] },
    Plataformas: { multi_select: plataformas.map(name => ({ name })) },
  };
  if (it.slot_at) {
    props["Fecha objetivo de publicación"] = { date: { start: it.slot_at } };
    props["Hora de publicación"] = { date: { start: it.slot_at } };
  }
  const headers = { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" };
  const r = it.notion_page
    ? await fetch(`https://api.notion.com/v1/pages/${it.notion_page}`, { method: "PATCH", headers, body: JSON.stringify({ properties: props }) })
    : await fetch("https://api.notion.com/v1/pages", {
      method: "POST", headers,
      body: JSON.stringify({ parent: { database_id: Deno.env.get("NOTION_DB") ?? NOTION_DB_DEF }, properties: props }),
    });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { console.error("notion:", r.status, JSON.stringify(d).slice(0, 300)); return null; }
  return typeof d?.id === "string" ? d.id : it.notion_page;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const uid = await owner(req);
    if (!uid) return json({ error: "Publicar desde la app todavía es solo para la cuenta de Jean." }, 403);
    const body = await req.json().catch(() => ({})) as { action?: string; item_id?: string };
    const id = typeof body.item_id === "string" && /^[0-9a-f-]{36}$/i.test(body.item_id) ? body.item_id : null;
    if (!id) return json({ error: "Falta la pieza." }, 400);
    const db = admin();
    const { data: it } = await db.from("content_items")
      .select("id, user_id, title, topic, caption, slot_at, media_tipo, media_paths, pub_redes, pub_estado, notion_page")
      .eq("id", id).eq("user_id", uid).maybeSingle();
    if (!it) return json({ error: "No se encontró la pieza." }, 404);
    const item = it as Item;

    if (body.action === "programar") {
      if (item.pub_estado === "programado" || item.pub_estado === "publicado") return json({ error: "Esa pieza ya está programada." }, 409);
      const r = await programar(item);
      if (!r.ok) {
        await db.from("content_items").update({ pub_estado: "error", pub_error: r.error, updated_at: new Date().toISOString() }).eq("id", id);
        return json({ error: r.error }, 422);
      }
      const page = await notion(item, "programado");
      await db.from("content_items").update({
        pub_estado: "programado", pub_job: r.job, pub_error: null, notion_page: page ?? item.notion_page, status: "grabado", updated_at: new Date().toISOString(),
      }).eq("id", id);
      return json({ ok: true, job: r.job, notion: page ? "actualizado" : Deno.env.get("NOTION_TOKEN") ? "falló" : "sin conexión" });
    }

    if (body.action === "notion") {
      const page = await notion(item, item.pub_estado);
      if (page && page !== item.notion_page) await db.from("content_items").update({ notion_page: page }).eq("id", id);
      return json({ ok: true, notion: page ? "actualizado" : Deno.env.get("NOTION_TOKEN") ? "falló" : "sin conexión" });
    }

    return json({ error: "Acción desconocida." }, 400);
  } catch (e) {
    console.error("publicar:", e);
    return json({ error: "No se pudo completar." }, 500);
  }
});
