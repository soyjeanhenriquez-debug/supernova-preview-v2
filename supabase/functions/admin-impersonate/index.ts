// SUPERNOVA — "Entrar como este usuario" (Admin → Usuarios).
// Devuelve un enlace mágico de un solo uso que abre la app con la sesión del
// usuario elegido, para ver exactamente lo que ve un cliente (p. ej. qué
// avatares le salen en Media Studio). Nunca envía correo.
//
// Quién puede pedirlo: SOLO un admin con sesión viva. El secreto de cron ya no
// sirve aquí: si se filtrara, daría la cuenta de cualquier cliente. Nunca se
// entrega el enlace de otro admin (sería escalar privilegios) y cada uso queda
// en audit_log.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// null = no autorizado; si no, el id del admin.
async function authorizeInternal(req: Request, guard: ReturnType<typeof createClient>): Promise<string | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data } = await guard.auth.getUser(token);
  const uid = data?.user?.id;
  if (!uid) return null;
  const { data: role } = await guard.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
  return role ? uid : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const caller = await authorizeInternal(req, guard);
  if (!caller) return json(401, { error: "No autorizado" });

  const body = await req.json().catch(() => ({}));
  const userId = String(body.userId ?? "").trim();
  if (!UUID_RE.test(userId)) return json(400, { error: "userId inválido" });

  const { data: target, error: getErr } = await guard.auth.admin.getUserById(userId);
  if (getErr || !target?.user?.email) return json(404, { error: "Usuario no encontrado" });
  const { data: targetAdmin } = await guard.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (targetAdmin) return json(403, { error: "No se puede entrar como otro admin." });

  // Vuelve a la misma web desde la que se pidió (producción o local), si la hay.
  const origin = req.headers.get("origin");
  const redirectTo = origin && /^https?:\/\/[^/]+$/i.test(origin) ? `${origin}/` : undefined;

  const { data, error } = await guard.auth.admin.generateLink({
    type: "magiclink",
    email: target.user.email,
    options: redirectTo ? { redirectTo } : undefined,
  });
  const link = data?.properties?.action_link;
  if (error || !link) {
    console.error("admin-impersonate:", error?.message);
    return json(500, { error: "No se pudo generar el enlace." });
  }
  const { error: auditErr } = await guard.from("audit_log").insert({
    user_id: caller, action: "ADMIN_IMPERSONATE", resource_type: "user", resource_id: userId,
    new_data: { origin: origin ?? null },
  });
  if (auditErr) console.error("admin-impersonate audit_log:", auditErr.message);
  console.log("admin-impersonate:", caller, "→", userId);
  return json(200, { email: target.user.email, link });
});
