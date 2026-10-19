// SUPERNOVA — Lee de la base, con el usuario real, lo que una generación necesita de la persona: su ADN,
// sus preferencias editoriales y la oferta elegida (solo en VENDER). Lo que mande el navegador NO se
// confía: del cuerpo solo se toman las elecciones (modo, objetivo, id de la oferta, palabras orientadoras,
// toque personal, intensidad) y se validan aquí. Lo usan reel-analyze y carousel-clone.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.1";
import {
  asIntensidad, asObjetivo, brandContext, cleanConceptos, cleanDna, cleanToque, ctaPolicy, type Modo, type Offer,
} from "./brandDna.ts";
import type { QaInput } from "./reelVersion.ts";
import { json } from "./media.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OFFER_COLS = "id, name, offer_status, product, who, promise, price_amount, price_currency, price_mode, proof, problem, delivers, differentiator, limitations, next_action";

export interface Creator {
  ctx: string; qa: QaInput; offer: Offer | null;
  /** Lo que se guarda con cada generación (A4: el objetivo se guarda con ella). */
  opciones: {
    modo: Modo; objetivo: string; offer_id: string | null; offer_name: string; offer_status: string;
    waitlist_ok: boolean; conceptos: string[]; toque: string; intensidad: string; con_adn: boolean;
  };
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

export async function loadCreator(db: SupabaseClient, uid: string, modo: Modo, body: Record<string, unknown>): Promise<Creator | Response> {
  const objetivo = asObjetivo(modo, body.objetivo);
  const offerId = modo === "adaptacion" && UUID.test(str(body.offer_id)) ? str(body.offer_id) : null;
  const [dnaRes, prefsRes, offersRes] = await Promise.all([
    db.from("brand_dna").select("*").eq("user_id", uid).maybeSingle(),
    db.from("editorial_prefs").select("text").eq("user_id", uid).order("created_at", { ascending: false }).limit(10),
    db.from("products").select(OFFER_COLS).eq("user_id", uid).eq("status", "activo").limit(100),
  ]);
  if (dnaRes.error) console.error("creatorContext: brand_dna", dnaRes.error.message);
  const dna = dnaRes.data ? cleanDna(dnaRes.data) : null;
  const offers = ((offersRes.data ?? []) as Record<string, unknown>[]).map(o => ({
    id: str(o.id), name: str(o.name), offer_status: (str(o.offer_status) || "borrador") as Offer["offer_status"],
    product: str(o.product), who: str(o.who), promise: str(o.promise),
    price_amount: o.price_amount == null ? null : Number(o.price_amount), price_currency: str(o.price_currency) || null,
    price_mode: (str(o.price_mode) || null) as Offer["price_mode"],
    proof: str(o.proof), problem: str(o.problem), delivers: str(o.delivers), differentiator: str(o.differentiator),
    limitations: str(o.limitations), next_action: str(o.next_action),
  }));
  const offer = offerId ? offers.find(o => o.id === offerId) ?? null : null;
  if (offerId && !offer) return json({ error: "No encontramos esa oferta en tu cuenta. Elige otra. No se cobró nada." }, 404);
  const waitlistOk = body.waitlist_ok === true;
  const conceptos = cleanConceptos(body.conceptos);
  const toque = cleanToque(body.toque);
  const intensidad = asIntensidad(body.intensidad);
  const prefs = ((prefsRes.data ?? []) as { text: string }[]).map(p => p.text);
  const ctx = brandContext({ modo, objetivo, dna, offer, waitlistOk, prefs, conceptos, toque, intensidad });
  const policy = modo === "adaptacion" ? ctaPolicy(offer, waitlistOk) : "interes";
  return {
    ctx, offer,
    qa: {
      objetivo, policy,
      // Fuera de VENDER no puede aparecer ninguna oferta; en VENDER, ninguna que no sea la elegida.
      ofertas: offers.filter(o => o.id !== offer?.id).map(o => o.name),
      privada: dna && !dna.formative_editorial_ok ? dna.formative_experiences : "",
      estilo: dna?.communication_style ?? "",
    },
    opciones: {
      modo, objetivo, offer_id: offer?.id ?? null, offer_name: offer?.name ?? "", offer_status: offer?.offer_status ?? "",
      waitlist_ok: waitlistOk, conceptos, toque, intensidad, con_adn: !!dna,
    },
  };
}
