import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * "Mi negocio" (tabla business_profile): lo que vende cada usuario, guardado una vez y usado en
 * todas las herramientas (Mándala, Generadores, ejemplos con IA). Una fila por usuario.
 */
export type BusinessType = "infoproducto" | "ecommerce" | "servicios" | "afiliado" | "otro";
export type CopyLevel = 1 | 2 | 3;
/** Un escenario de la calculadora de precio (src/pages/PricingPage.tsx). */
export type PriceScenario = {
  id: string; price: number; salesPerDay: number; adCostPerSale: number; feePct: number; feeFixed: number;
  refundPct: number; taxPct: number; unitCost: number; fixedMonthly: number;
};
export type Pricing = { currency: string; scenarios: PriceScenario[]; chosen?: string | null };
/** Etapas del recorrido marcadas a mano como hechas (las que no tienen datos propios). */
export type Journey = { done?: Record<string, boolean> };
export type BusinessProfile = {
  business_type: BusinessType | null;
  copy_level: CopyLevel;
  pricing: Pricing | null;
  journey: Journey | null;
  product: string; who: string; promise: string; price: string; proof: string; store_url: string;
};
export const EMPTY_PROFILE: BusinessProfile = {
  business_type: null, copy_level: 2, pricing: null, journey: null,
  product: "", who: "", promise: "", price: "", proof: "", store_url: "",
};

/** Tono de los anuncios: lo elige cada usuario en "Mi negocio" y lo respetan todas las herramientas. */
export const COPY_LEVELS: { id: CopyLevel; label: string; desc: string }[] = [
  { id: 1, label: "Suave", desc: "Tranquilo e informativo. Casi nunca te rechazan un anuncio." },
  { id: 2, label: "Persuasivo", desc: "Respuesta directa clásica: dolor, deseo, prueba y llamada fuerte." },
  { id: 3, label: "Agresivo", desc: "Máxima persuasión dentro de las reglas: curiosidad, emoción y ganchos que frenan el scroll." },
];

export const BUSINESS_TYPES: { id: BusinessType; label: string }[] = [
  { id: "infoproducto", label: "Curso o producto digital" },
  { id: "ecommerce", label: "Tienda online / Shopify" },
  { id: "servicios", label: "Servicios o agencia" },
  { id: "afiliado", label: "Afiliado" },
  { id: "otro", label: "Otro" },
];

/** Ejemplos de la ficha según el tipo de negocio (antes de que llegue el de la IA). */
export const PROFILE_EXAMPLES: Record<"default" | "ecommerce", Record<"product" | "who" | "promise" | "price" | "proof", string>> = {
  default: {
    product: "Curso de repostería para vender desde casa",
    who: "Mamás que quieren un ingreso extra sin salir de casa",
    promise: "Hacer y vender sus primeros postres en 30 días",
    price: "27",
    proof: "Garantía de 7 días · o déjalo vacío si aún no tienes",
  },
  ecommerce: {
    product: "Corrector de postura ajustable (se usa bajo la ropa)",
    who: "Personas que pasan muchas horas sentadas frente a la computadora",
    promise: "Recordarte sentarte derecho desde el primer día de uso",
    price: "29",
    proof: "Envío gratis, pago contra entrega y cambio en 30 días",
  },
};

// Tabla nueva, aún no está en los tipos generados de Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as any).from("business_profile");

export const profileReady = (p: BusinessProfile) =>
  p.product.trim().length > 2 && p.who.trim().length > 2 && p.promise.trim().length > 2;

/** Texto de la ficha para mandarlo a la IA. */
export function profileText(p: BusinessProfile) {
  const type = BUSINESS_TYPES.find(t => t.id === p.business_type)?.label;
  return [
    type && `Tipo de negocio: ${type}${p.business_type === "ecommerce" ? " (productos físicos con envío)" : ""}`,
    `Producto: ${p.product}`, `Para quién: ${p.who}`, `Resultado que promete: ${p.promise}`,
    p.price && `Precio: ${p.price} USD`, p.proof && `Prueba o garantía: ${p.proof}`,
    p.store_url && `Tienda: ${p.store_url}`,
  ].filter(Boolean).join("\n");
}

/**
 * Instrucciones de tono para la IA. El nivel 3 es persuasión de respuesta directa a fondo, pero
 * los límites de abajo valen en TODOS los niveles: son los que hacen que Meta cierre la cuenta
 * publicitaria entera (no solo el anuncio) y los que pueden dañar a alguien enfermo.
 */
export function copyLevelHint(p: BusinessProfile) {
  const limits = "LÍMITES EN CUALQUIER TONO: nada de curar, tratar o prevenir enfermedades ni resultados médicos, de ingresos o físicos prometidos; no afirmes atributos personales de quien mira (\"¿Tienes diabetes?\"); no inventes testimonios, médicos, estudios ni cifras; nunca sugieras dejar un tratamiento; nada de trucos para esquivar la revisión (letras cambiadas como \"d1abetes\", antes/después de cuerpos, páginas distintas para el revisor).";
  if (p.copy_level === 1) {
    return `TONO 1 · SUAVE: informativo y cálido, beneficios en positivo, sin urgencia ni presión, llamada a la acción amable. Pensado para que ninguna plataforma lo rechace.\n${limits}`;
  }
  if (p.copy_level === 3) {
    return `TONO 3 · AGRESIVO (máxima persuasión de respuesta directa, dentro de las políticas): abre con un gancho que rompa el patrón en las primeras 3 palabras; usa estructuras de lead de descubrimiento al estilo brasileño y americano (historia de descubrimiento, enemigo común, mecanismo único con nombre propio, revelación, contraste antes de conocerlo / después), curiosidad fuerte que solo se cierra haciendo clic, emoción intensa (miedo a seguir igual, orgullo, alivio), objeciones destruidas una por una, urgencia y escasez solo si son reales, y llamada a la acción directa y repetida. Formatos que se ven nativos: noticia/advertorial, UGC hablado a cámara, texto sobre la imagen. Para subir el CTR: números concretos (sin inventar), preguntas abiertas que no afirman nada de quien mira, frases de una línea, palabras de poder. Da además 2 variantes del gancho para probar.\n${limits}`;
  }
  return `TONO 2 · PERSUASIVO: respuesta directa clásica: gancho fuerte, dolor con sus palabras, deseo, prueba honesta, oferta clara y llamada a la acción firme.\n${limits}`;
}

/** Reglas extra para la IA cuando el negocio es una tienda de productos físicos. */
export function businessHint(p: BusinessProfile) {
  return p.business_type === "ecommerce"
    ? `NEGOCIO ECOMMERCE (tienda online / Shopify, productos físicos): el anuncio lleva a la página del producto en la tienda, no a una VSL ni a un curso. Muestra el producto en uso, el beneficio que se ve o se siente, y quita el miedo a comprar: envío, tiempo de entrega, cambios o devolución, pago contra entrega si lo ofrece. Las "ventas" son pedidos; piensa en ticket medio (packs de 2-3 unidades, combos) y en recuperar carritos abandonados.`
    : "";
}

export function useBusinessProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<BusinessProfile>(EMPTY_PROFILE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const { data } = await table().select("business_type,copy_level,pricing,journey,product,who,promise,price,proof,store_url").eq("user_id", user.id).maybeSingle();
      let p: BusinessProfile = { ...EMPTY_PROFILE };
      if (data) {
        p = Object.fromEntries(Object.entries({ ...EMPTY_PROFILE, ...data }).map(([k, v]) => [k, v ?? (k === "business_type" || k === "pricing" || k === "journey" ? null : k === "copy_level" ? 2 : "")])) as BusinessProfile;
      } else {
        // Sin ficha todavía: la de la Mándala de este navegador (versión anterior) y el tipo según la encuesta.
        try {
          const old = JSON.parse(localStorage.getItem(`sn_mandala_brief_${user.id}`) || "null");
          if (old && typeof old === "object") p = { ...p, ...old };
        } catch { /* sin almacenamiento */ }
        const survey = String((user.user_metadata?.onboarding as { sells_what?: string } | undefined)?.sells_what ?? "");
        if (/shopify|tienda|f[ií]sico/i.test(survey)) p.business_type = "ecommerce";
        else if (/infoproducto|curso/i.test(survey)) p.business_type = "infoproducto";
        else if (/servicio|agencia/i.test(survey)) p.business_type = "servicios";
        else if (/afiliado/i.test(survey)) p.business_type = "afiliado";
      }
      if (alive) { setProfile(p); setLoaded(true); }
    })();
    return () => { alive = false; };
  }, [user]);

  /** Guarda la ficha completa (upsert). Devuelve false si falló. */
  const save = useCallback(async (p: BusinessProfile) => {
    if (!user) return false;
    const clip = (v: string, n: number) => v.trim().slice(0, n);
    const { error } = await table().upsert({
      user_id: user.id, business_type: p.business_type, copy_level: p.copy_level,
      pricing: p.pricing, journey: p.journey,
      product: clip(p.product, 300), who: clip(p.who, 300), promise: clip(p.promise, 300),
      price: clip(p.price, 30), proof: clip(p.proof, 300), store_url: clip(p.store_url, 300),
      updated_at: new Date().toISOString(),
    });
    return !error;
  }, [user]);

  return { profile, setProfile, loaded, save };
}
