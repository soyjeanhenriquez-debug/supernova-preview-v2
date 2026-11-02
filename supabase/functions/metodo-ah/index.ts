// SUPERNOVA — «Video IA Perfecto» (Modelo AH), fase 1 (02-nov-2026, aprobado por Jean): de UNA frase a un
// storyboard con personaje fijo. El método vive en _shared/metodoAh.ts; aquí solo compuertas, dinero y archivos.
//
// Compuertas (verify_jwt NO protege): usuario real (caller) → interruptor de admin (edge_limits
// 'metodo-ah:open'; false = solo admins) → cobro en el servidor con edge_guard_charge ANTES de gastar →
// proveedor → si falla, reembolso.
//
// Acciones:
//   config  (gratis) → si está abierto para esta cuenta.
//   crear   { idea, modo?, duracion?, voz?, plantilla?, cara?: { bucket: "personajes"|"estudio-avatar", path } }
//           → cobra ah_storyboard (160) → agentes 01–05 (Gemini, JSON) → guarda proyecto + escenas.
//             Las imágenes se piden después (cada una cabe en el tiempo de una llamada):
//   imagen  { proyecto, cual: "personaje" | número de escena } (gratis: ya va en el storyboard) → genera la imagen
//           con el catálogo AH (GPT Image 2 en A/B, Nano Banana Pro en C) y la referencia del personaje.
//           Máx. 2 intentos por imagen. Si el personaje no sale en 2 intentos, se devuelve el storyboard entero.
//   cambiar { proyecto, escena, campo: ropa|lugar|pose|luz|camara, deseo? } → cobra ah_cambio (10) → cambia SOLO
//           ese campo (el resto queda congelado) y rehace esa imagen con la anterior como referencia.
//   ver     { proyecto } (gratis) → proyecto + escenas con URLs firmadas (1 h).
//   lista   (gratis) → los últimos 12 proyectos de esta cuenta.
import { corsHeaders } from "npm:@supabase/supabase-js@2.117.1/cors";
import { admin, billingHeaders, caller, charge, json, refund, type Caller } from "../_shared/media.ts";
import { ownStoragePath } from "../_shared/paths.ts";
import { apimartImage } from "../_shared/apimart.ts";
import {
  ACCION_CAMBIO, ACCION_STORYBOARD, CAMBIO_SYSTEM, CAMPOS, IMAGEN_USD, MAX_INTENTOS, PLAN_SYSTEM,
  aplicarCambio, cambioPrompt, geminiUsd, isCampo, isDuracion, isModo, isPlantilla, isVoz, modeloImagen,
  parsePlan, planPrompt, prompt6C, promptPersonaje, soloCambia, type Campo, type Escena, type Opciones, type Plan,
} from "../_shared/metodoAh.ts";

const FN = "metodo-ah";
const OPEN_SWITCH = "metodo-ah:open";
const OUT = "estudio-avatar";
const MODEL = "gemini-3-flash-preview";
const MAX_HOUR = 12, MAX_DAY = 40;
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);

async function switchOpen(who: Caller): Promise<boolean> {
  if (who.isAdmin) return true;
  const { data, error } = await admin().from("edge_limits").select("enabled").eq("fn", OPEN_SWITCH).maybeSingle();
  if (error) { console.error("edge_limits:", error.message); return false; }
  return !data || data.enabled === true;
}

async function gemini(system: string, user: string, maxTokens: number): Promise<{ text: string; usd: number }> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("sin GEMINI_API_KEY");
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: maxTokens, temperature: 0.9 },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  const text = d?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  return { text, usd: geminiUsd(d?.usageMetadata ?? {}) };
}

async function logCost(uid: string, model: string, usd: number, images: number) {
  const { error } = await admin().from("ai_usage").insert({ user_id: uid, fn: FN, model, images, cost_usd: usd });
  if (error) console.error("ai_usage:", error.message);
}
async function sumarCosto(pid: string, usd: number) {
  const db = admin();
  const { data } = await db.from("ah_proyectos").select("costo_usd").eq("id", pid).maybeSingle();
  await db.from("ah_proyectos").update({ costo_usd: Number(data?.costo_usd ?? 0) + usd, updated_at: new Date().toISOString() }).eq("id", pid);
}

/** URL firmada (30 min) de una imagen PROPIA (foto subida o generada por el estudio). */
async function firmarPropia(uid: string, ref: unknown): Promise<string | null> {
  const r = (ref ?? {}) as { bucket?: unknown; path?: unknown };
  const bucket = r.bucket === OUT ? OUT : r.bucket === "personajes" ? "personajes" : null;
  const p = bucket ? ownStoragePath(uid, r.path) : null;
  if (!bucket || !p) return null;
  const { data } = await admin().storage.from(bucket).createSignedUrl(p, 60 * 30);
  return data?.signedUrl ?? null;
}
const firmarOut = async (path: string | null) => {
  if (!path) return null;
  const { data } = await admin().storage.from(OUT).createSignedUrl(path, 60 * 30);
  return data?.signedUrl ?? null;
};

/** Genera una imagen, la guarda en estudio-avatar/{uid}/ah/{pid}/… y devuelve la ruta (o null). */
async function generar(uid: string, pid: string, nombre: string, prompt: string, refs: string[], plan: Plan): Promise<string | null> {
  const modelo = modeloImagen(plan.modo);
  const img = await apimartImage(prompt, "9:16", refs, modelo);
  if (!img) return null;
  const usd = img.cost ?? IMAGEN_USD[modelo];
  await logCost(uid, `apimart:${modelo}:ah`, usd, 1);
  await sumarCosto(pid, usd);
  const ext = img.mime === "image/png" ? "png" : img.mime === "image/webp" ? "webp" : "jpg";
  const path = `${uid}/ah/${pid}/${nombre}.${ext}`;
  const bytes = Uint8Array.from(atob(img.b64), (c) => c.charCodeAt(0));
  const up = await admin().storage.from(OUT).upload(path, bytes, { contentType: img.mime, upsert: true });
  if (up.error) { console.error("storage:", up.error.message); return null; }
  return path;
}

async function ver(uid: string, pid: string) {
  const db = admin();
  const { data: p } = await db.from("ah_proyectos").select("*").eq("id", pid).eq("user_id", uid).maybeSingle();
  if (!p) return null;
  const { data: es } = await db.from("ah_escenas").select("idx,datos,imagen,estado,intentos,version,error").eq("proyecto_id", pid).order("idx");
  const escenas = await Promise.all((es ?? []).map(async (e) => ({ ...e, url: await firmarOut(e.imagen) })));
  return {
    id: p.id, idea: p.idea, opciones: p.opciones, plan: p.plan, created_at: p.created_at, reembolsado: p.reembolsado,
    personaje: { estado: p.personaje_estado, intentos: p.personaje_intentos, url: await firmarOut(p.personaje_img) },
    escenas,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let txId: string | null = null;
  try {
    const who = await caller(req);
    if (!who) return json({ error: "Inicia sesión para crear tu video." }, 401);
    const raw = await req.text();
    if (raw.length > 6000) return json({ error: "La solicitud es demasiado grande." }, 413);
    const body = raw ? JSON.parse(raw) : {};
    const db = admin();
    const open = await switchOpen(who);

    if (body.action === "config") return json({ open });
    if (!open) return json({ error: "Video IA Perfecto llega pronto.", pronto: true }, 503);

    if (body.action === "lista") {
      const { data } = await db.from("ah_proyectos").select("id,idea,plan->>titulo,created_at,personaje_estado").eq("user_id", who.id).order("created_at", { ascending: false }).limit(12);
      return json({ items: data ?? [] });
    }

    if (body.action === "ver") {
      const pid = uuid(body.proyecto);
      const v = pid ? await ver(who.id, pid) : null;
      return v ? json({ proyecto: v }) : json({ error: "Proyecto no encontrado." }, 404);
    }

    // ---------- crear: agentes 01–05 ----------
    if (body.action === "crear") {
      const idea = typeof body.idea === "string" ? body.idea.replace(/\s+/g, " ").trim() : "";
      if (idea.length < 8) return json({ error: "Cuéntanos tu idea en una frase (al menos unas palabras)." }, 400);
      if (idea.length > 600) return json({ error: "Tu idea es muy larga: resúmela en una o dos frases." }, 400);
      const conCara = !!body.cara;
      const caraUrl = conCara ? await firmarPropia(who.id, body.cara) : null;
      if (conCara && !caraUrl) return json({ error: "Tu foto no es válida. Súbela de nuevo." }, 400);
      const o: Opciones = {
        modo: isModo(body.modo) ? body.modo : "auto", duracion: isDuracion(body.duracion) ? body.duracion : 30,
        voz: isVoz(body.voz) ? body.voz : "off", plantilla: isPlantilla(body.plantilla) ? body.plantilla : "libre", conCara,
      };
      if (!Deno.env.get("GEMINI_API_KEY") || !Deno.env.get("APIMART_API_KEY")) return json({ error: "Video IA Perfecto llega pronto.", pronto: true }, 503);

      const g = await charge(FN, who.id, ACCION_STORYBOARD, `Video IA Perfecto · ${idea.slice(0, 60)}`, MAX_HOUR, MAX_DAY);
      if (g instanceof Response) return g;
      txId = g.txId;

      let plan: Plan | { error: string } = { error: "sin plan" };
      let usd = 0;
      for (let i = 0; i < 2 && "error" in plan; i++) {
        try {
          const r = await gemini(PLAN_SYSTEM, planPrompt(idea, o), 8000);
          usd += r.usd;
          plan = parsePlan(r.text, o);
        } catch (e) { console.error("plan:", e instanceof Error ? e.message : e); }
      }
      await logCost(who.id, `gemini:${MODEL}:ah-plan`, usd, 0);
      if ("error" in plan) { await refund(txId, `plan: ${plan.error}`); txId = null; return json({ error: "No pudimos armar tu storyboard. Te devolvimos los créditos.", refunded: true }, 502); }

      const { data: p, error } = await db.from("ah_proyectos").insert({
        user_id: who.id, idea, opciones: o, plan: { titulo: plan.titulo, modo: plan.modo, estilo: plan.estilo, brief: plan.brief, personaje: plan.personaje },
        cara_ref: conCara ? body.cara : null, credit_tx_id: txId, costo_usd: usd,
      }).select("id").single();
      if (error || !p) { console.error("insert:", error?.message); await refund(txId, "guardar proyecto"); txId = null; return json({ error: "No se pudo guardar. Te devolvimos los créditos." }, 500); }
      const filas = plan.escenas.map((e, idx) => ({ proyecto_id: p.id, idx, user_id: who.id, datos: e, prompt: prompt6C(plan as Plan, e, conCara) }));
      const { error: e2 } = await db.from("ah_escenas").insert(filas);
      if (e2) { console.error("escenas:", e2.message); await db.from("ah_proyectos").delete().eq("id", p.id); await refund(txId, "guardar escenas"); txId = null; return json({ error: "No se pudo guardar. Te devolvimos los créditos." }, 500); }
      return json({ proyecto: await ver(who.id, p.id), billing: { charged: g.charged, balance: g.balance } }, 200, billingHeaders(g));
    }

    // ---------- imagen: personaje (agente 06) o escena (agente 07) ----------
    if (body.action === "imagen") {
      const pid = uuid(body.proyecto);
      const { data: p } = pid ? await db.from("ah_proyectos").select("*").eq("id", pid).eq("user_id", who.id).maybeSingle() : { data: null };
      if (!p) return json({ error: "Proyecto no encontrado." }, 404);
      const plan = p.plan as Plan;
      const conCara = !!p.cara_ref;
      const cara = conCara ? await firmarPropia(who.id, p.cara_ref) : null;

      if (body.cual === "personaje") {
        if (p.personaje_estado === "lista" || p.personaje_estado === "generando") return json({ proyecto: await ver(who.id, p.id) });
        if (p.personaje_intentos >= MAX_INTENTOS) return json({ error: "El personaje no salió. Ya te devolvimos los créditos." }, 409);
        const { data: tomado } = await db.from("ah_proyectos").update({ personaje_estado: "generando", personaje_intentos: p.personaje_intentos + 1 })
          .eq("id", p.id).in("personaje_estado", ["pendiente", "error"]).select("id").maybeSingle();
        if (!tomado) return json({ proyecto: await ver(who.id, p.id) });
        const path = await generar(who.id, p.id, "personaje", promptPersonaje(plan, conCara), cara ? [cara] : [], plan);
        if (!path) {
          const ultimo = p.personaje_intentos + 1 >= MAX_INTENTOS;
          await db.from("ah_proyectos").update({ personaje_estado: "error", ...(ultimo && !p.reembolsado ? { reembolsado: true } : {}) }).eq("id", p.id);
          if (ultimo && !p.reembolsado) { await refund(p.credit_tx_id, "personaje no salió"); return json({ error: "El personaje no salió. Te devolvimos los créditos.", refunded: true }, 502); }
          return json({ error: "El personaje no salió a la primera. Vuelve a intentarlo (es gratis)." }, 502);
        }
        await db.from("ah_proyectos").update({ personaje_img: path, personaje_estado: "lista", updated_at: new Date().toISOString() }).eq("id", p.id);
        return json({ proyecto: await ver(who.id, p.id) });
      }

      const idx = Number(body.cual);
      if (!Number.isInteger(idx) || idx < 0 || idx > 11) return json({ error: "Escena inválida." }, 400);
      if (p.personaje_estado !== "lista") return json({ error: "Primero sale tu personaje." }, 409);
      const { data: e } = await db.from("ah_escenas").select("*").eq("proyecto_id", p.id).eq("idx", idx).maybeSingle();
      if (!e) return json({ error: "Escena no encontrada." }, 404);
      if (e.estado === "lista" || e.estado === "generando") return json({ proyecto: await ver(who.id, p.id) });
      if (e.intentos >= MAX_INTENTOS) return json({ error: "Esta escena no salió. Usa «Cambiar solo…» para rehacerla de otra forma." }, 409);
      const { data: tomada } = await db.from("ah_escenas").update({ estado: "generando", intentos: e.intentos + 1 })
        .eq("proyecto_id", p.id).eq("idx", idx).in("estado", ["pendiente", "error"]).select("idx").maybeSingle();
      if (!tomada) return json({ proyecto: await ver(who.id, p.id) });
      const ref = await firmarOut(p.personaje_img);
      const refs = [ref, cara].filter((u): u is string => !!u);
      const path = await generar(who.id, p.id, `${(e.datos as Escena).id}-v${e.version}`, e.prompt, refs, plan);
      await db.from("ah_escenas").update(path
        ? { imagen: path, estado: "lista", error: null, updated_at: new Date().toISOString() }
        : { estado: "error", error: "La imagen no salió.", updated_at: new Date().toISOString() }).eq("proyecto_id", p.id).eq("idx", idx);
      return path ? json({ proyecto: await ver(who.id, p.id) }) : json({ error: "Esta escena no salió. Vuelve a intentarlo (es gratis)." }, 502);
    }

    // ---------- cambiar solo… ----------
    if (body.action === "cambiar") {
      const pid = uuid(body.proyecto), idx = Number(body.escena);
      if (!pid || !Number.isInteger(idx) || !isCampo(body.campo)) return json({ error: "Elige la escena y qué quieres cambiar." }, 400);
      const { data: p } = await db.from("ah_proyectos").select("*").eq("id", pid).eq("user_id", who.id).maybeSingle();
      if (!p) return json({ error: "Proyecto no encontrado." }, 404);
      if (p.personaje_estado !== "lista") return json({ error: "Primero sale tu personaje." }, 409);
      const { data: e } = await db.from("ah_escenas").select("*").eq("proyecto_id", p.id).eq("idx", idx).maybeSingle();
      if (!e) return json({ error: "Escena no encontrada." }, 404);
      if (e.estado === "generando") return json({ error: "Esa escena se está haciendo. Espera unos segundos." }, 409);
      const deseo = typeof body.deseo === "string" ? body.deseo : "";
      const campo: Campo = body.campo;
      const plan = p.plan as Plan;

      const g = await charge(FN, who.id, ACCION_CAMBIO, `Video IA Perfecto · cambiar ${CAMPOS[campo].etiqueta}`, MAX_HOUR, MAX_DAY);
      if (g instanceof Response) return g;
      txId = g.txId;

      let nueva: Escena | { error: string } = { error: "sin cambio" };
      try {
        const r = await gemini(CAMBIO_SYSTEM, cambioPrompt(e.datos as Escena, campo, deseo), 800);
        await logCost(who.id, `gemini:${MODEL}:ah-cambio`, r.usd, 0);
        await sumarCosto(p.id, r.usd);
        nueva = aplicarCambio(e.datos as Escena, campo, r.text);
      } catch (err) { console.error("cambio:", err instanceof Error ? err.message : err); }
      if ("error" in nueva) { await refund(txId, "cambio sin respuesta"); txId = null; return json({ error: "No pudimos hacer el cambio. Te devolvimos los créditos.", refunded: true }, 502); }

      const conCara = !!p.cara_ref;
      const prompt = prompt6C({ ...plan, escenas: [] }, nueva, conCara);
      const [ref, antes, cara] = await Promise.all([firmarOut(p.personaje_img), firmarOut(e.imagen), conCara ? firmarPropia(who.id, p.cara_ref) : Promise.resolve(null)]);
      const refs = [ref, antes, cara].filter((u): u is string => !!u);
      const version = e.version + 1;
      await db.from("ah_escenas").update({ estado: "generando" }).eq("proyecto_id", p.id).eq("idx", idx);
      const path = await generar(who.id, p.id, `${nueva.id}-v${version}`, antes ? prompt.replace(/\. No text, no watermark, no distortion\.$/, `.${soloCambia(campo)} No text, no watermark, no distortion.`) : prompt, refs, plan);
      if (!path) {
        await db.from("ah_escenas").update({ estado: e.imagen ? "lista" : "error" }).eq("proyecto_id", p.id).eq("idx", idx);
        await refund(txId, "imagen del cambio"); txId = null;
        return json({ error: "El cambio no salió. Te devolvimos los créditos.", refunded: true }, 502);
      }
      await db.from("ah_escenas").update({ datos: nueva, prompt, imagen: path, estado: "lista", version, error: null, updated_at: new Date().toISOString() })
        .eq("proyecto_id", p.id).eq("idx", idx);
      return json({ proyecto: await ver(who.id, p.id), billing: { charged: g.charged, balance: g.balance } }, 200, billingHeaders(g));
    }

    return json({ error: "Acción desconocida." }, 400);
  } catch (e) {
    console.error("metodo-ah:", e instanceof Error ? e.message : e);
    if (txId) await refund(txId, "excepción");
    return json({ error: "Algo falló. Si se te cobró, te devolvimos los créditos." }, 500);
  }
});
