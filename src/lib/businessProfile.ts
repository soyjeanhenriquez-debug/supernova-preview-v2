import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProducts } from "@/contexts/ProductContext";
import { notifyJourneyChanged } from "@/contexts/JourneyContext";
import type { Gemelo } from "@/lib/gemelo";

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
export type Journey = { done?: Record<string, boolean>; gemelo?: Gemelo | null };
/** Etapa 2 · Matriz de validación: respuestas verdadero/falso por id de pregunta (src/pages/ValidationPage.tsx). */
export type Validation = { answers: Record<string, boolean>; completed_at?: string | null; score?: number | null };
/** Etapa 4 · Plan de lanzamiento (src/pages/LaunchPlanPage.tsx). due = 'YYYY-MM-DD'. */
export type LaunchTask = {
  id: string; title: string; group: string; due: string | null; done: boolean;
  /** Lo que el usuario hizo DENTRO de SUPERNOVA para esta tarea (todo queda registrado para guiarlo). */
  answer?: string;                  // texto escrito (promesa, garantía, mensaje, ajustes…)
  link?: string;                    // enlace (app, pago, página de venta)
  feedback?: string[];              // opiniones de las personas que probaron
  checks?: Record<string, boolean>; // pasos de una mini lista (píxel, compra de prueba…)
};
export type LaunchPlan = { start: string; tasks: LaunchTask[] };
/** Etapa 6 · Recuperación de ventas por WhatsApp (src/pages/RecoveryPage.tsx). */
export type RecoveryMessage = { day: number; when: string; text: string };
export type Recovery = { messages: RecoveryMessage[]; generated_at?: string | null };
export type BusinessProfile = {
  business_type: BusinessType | null;
  copy_level: CopyLevel;
  pricing: Pricing | null;
  journey: Journey | null;
  validation: Validation | null;
  launch_plan: LaunchPlan | null;
  recovery: Recovery | null;
  product: string; who: string; promise: string; price: string; proof: string; store_url: string;
};
export const EMPTY_PROFILE: BusinessProfile = {
  business_type: null, copy_level: 2, pricing: null, journey: null, validation: null, launch_plan: null, recovery: null,
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

// Campos que la base guarda como JSON (o el tipo de negocio): vacíos = null, no "".
const JSON_KEYS = new Set(["business_type", "pricing", "journey", "validation", "launch_plan", "recovery"]);

// Tabla nueva, aún no está en los tipos generados de Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as any).from("products");

/** Largo máximo del precio (check products_price_check en la base): cabe "US$9/mes · reto de entrada US$5". */
export const PRICE_MAX = 40;

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
  const limits = "LÍMITES EN CUALQUIER TONO: nada de curar, tratar o prevenir enfermedades ni resultados médicos, de ingresos o físicos prometidos; no afirmes atributos personales de quien mira (\"¿Tienes diabetes?\"); no inventes testimonios, médicos, estudios ni cifras; nunca sugieras dejar un tratamiento; la promesa del producto se presenta como lo que enseña o ayuda a lograr (\"aprende a…\"), nunca como un resultado seguro; nada de trucos para esquivar la revisión (letras cambiadas como \"d1abetes\", antes/después de cuerpos, páginas distintas para el revisor).";
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

/**
 * La ficha del PRODUCTO ACTIVO (tabla products; ver src/contexts/ProductContext.tsx). Mismo contrato
 * que antes (profile, savePatch, loaded): las pantallas no saben que hay varios productos; cambiar de
 * producto recarga todo.
 */
export function useBusinessProfile() {
  const { user } = useAuth();
  const { activeId, rename, active } = useProducts();
  const [profile, setProfile] = useState<BusinessProfile>(EMPTY_PROFILE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user || !activeId) return;
    let alive = true;
    setLoaded(false);
    (async () => {
      const { data, error } = await table().select("business_type,copy_level,pricing,journey,validation,launch_plan,recovery,product,who,promise,price,proof,store_url").eq("id", activeId).maybeSingle();
      if (error) console.error("products:", error.message);
      let p: BusinessProfile = { ...EMPTY_PROFILE };
      if (data) {
        p = Object.fromEntries(Object.entries({ ...EMPTY_PROFILE, ...data }).map(([k, v]) => [k, v ?? (JSON_KEYS.has(k) ? null : k === "copy_level" ? 2 : "")])) as BusinessProfile;
      }
      // Producto sin tipo todavía: se deduce de la encuesta de registro (cómo trabaja el usuario).
      if (!p.business_type) {
        const survey = String((user.user_metadata?.onboarding as { sells_what?: string } | undefined)?.sells_what ?? "");
        if (/shopify|tienda|f[ií]sico/i.test(survey)) p.business_type = "ecommerce";
        else if (/infoproducto|curso/i.test(survey)) p.business_type = "infoproducto";
        else if (/servicio|agencia/i.test(survey)) p.business_type = "servicios";
        else if (/afiliado/i.test(survey)) p.business_type = "afiliado";
      }
      if (alive) { setProfile(p); setLoaded(true); }
    })();
    return () => { alive = false; };
  }, [user, activeId]);

  /**
   * Guarda SOLO los campos indicados en el producto activo (y los aplica al estado local). Es el
   * único guardado: así una pantalla con la ficha desactualizada nunca pisa lo que guardó otra.
   * Recorta los textos al tamaño que acepta la base (precio 40, el resto 300).
   * `typing: true` es el autoguardado mientras se escribe: no toca el estado local (si no, el recorte
   * se comería el espacio que acabas de escribir) ni renombra el producto con una palabra a medias.
   */
  const savePatch = useCallback(async (patch: Partial<BusinessProfile>, opts: { typing?: boolean } = {}) => {
    if (!user || !activeId) return false;
    const clean: Record<string, unknown> = { ...patch };
    for (const k of ["product", "who", "promise", "proof", "store_url", "price"] as const) {
      if (typeof clean[k] === "string") clean[k] = (clean[k] as string).trim().slice(0, k === "price" ? PRICE_MAX : 300);
    }
    if (!opts.typing) setProfile(prev => ({ ...prev, ...(clean as Partial<BusinessProfile>) }));
    const { error } = await table().update(clean).eq("id", activeId);
    if (error) { console.error("products:", error.message); return false; }
    notifyJourneyChanged(); // la barra de etapa se recalcula (p. ej. al elegir precio)
    // Un producto con nombre genérico toma el nombre de lo que vende.
    const newName = typeof clean.product === "string" ? (clean.product as string) : "";
    if (!opts.typing && newName && active && /^(mi primer producto|nuevo producto|mi producto)$/i.test(active.name)) rename(activeId, newName.slice(0, 120));
    return true;
  }, [user, activeId, active, rename]);

  return { profile, setProfile, loaded, savePatch, productId: activeId };
}
