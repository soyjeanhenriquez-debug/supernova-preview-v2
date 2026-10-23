/**
 * Qué modelo conviene para cada caso (decisión de Jean, 20-oct-2026). Inteligencia interna: la app
 * le aconseja a la persona QUÉ MODELO elegir, nunca por qué proveedor pasa (ni fal, ni APIMart, ni
 * Higgsfield, ni ninguna API). Se actualiza aquí cuando cambian los modelos.
 *
 * Imagen:  realista (avatar, UGC, anuncio, creativo de foto) → GPT Image 2
 *          creativa (animada, ilustrada, editar una imagen)  → Nano Banana Pro
 * Video:   la persona habla a cámara (labios)                → Omni
 *          sin hablar (voz en off, B-roll, producto, paisaje) → Grok
 *
 * Cada caso lleva una lista en orden de preferencia: la pantalla recomienda el primero que tenga
 * disponible. Así, el día que Omni o Grok entren a un selector, la recomendación cambia sola.
 */
export type ImageCase = "realista" | "creativa";
export type VideoCase = "habla" | "sin-hablar";
export type ModelCase = ImageCase | VideoCase;

type Rule = { want: string; why: string; prefer: RegExp[] };

export const MODEL_RULES: Record<ModelCase, Rule> = {
  realista: {
    want: "GPT Image 2",
    why: "es la que da más realismo: avatares, anuncios estilo cliente (UGC) y fotos que parecen reales",
    prefer: [/gpt.?image.?2/i, /nano.?banana.?pro/i, /nano.?banana/i],
  },
  creativa: {
    want: "Nano Banana Pro",
    why: "va mejor para estilos creativos o animados y para editar una imagen que ya tienes",
    prefer: [/nano.?banana.?pro/i, /nano.?banana/i, /gpt.?image/i],
  },
  habla: {
    want: "Omni",
    why: "es la que mejor sincroniza los labios cuando la persona habla a cámara",
    // Sin Omni en la lista no se recomienda otro: cualquiera de los que hablan sirve y no se empuja al más caro.
    prefer: [/omni/i],
  },
  "sin-hablar": {
    want: "Grok",
    why: "da muy buenos resultados en escenas sin diálogo: voz en off, tomas de apoyo (B-roll), producto, paisajes y movimientos de cámara",
    prefer: [/grok/i, /kling.?2\.5/i, /kling/i],
  },
};

type Named = { id: string; label: string };

/** El modelo que se recomienda para este caso entre los que hay en el selector (o null si ninguno encaja). */
export function bestFor<T extends Named>(c: ModelCase, models: T[]): T | null {
  for (const re of MODEL_RULES[c].prefer) {
    const hit = models.find(m => re.test(m.label) || re.test(m.id));
    if (hit) return hit;
  }
  return null;
}

/**
 * El consejo para mostrar junto al selector. `ok` = ya eligió el recomendado.
 * Si el ideal (Omni, Grok…) aún no está en la lista, recomienda el más parecido que sí está.
 */
export function adviceFor<T extends Named>(c: ModelCase, models: T[], currentId: string | null | undefined) {
  const best = bestFor(c, models);
  if (!best) return null;
  const rule = MODEL_RULES[c];
  const ideal = rule.prefer[0].test(best.label) || rule.prefer[0].test(best.id);
  const text = ideal
    ? `Para esto te conviene ${best.label}: ${rule.why}.`
    : `Para esto te conviene ${best.label}, el más indicado de los que tienes aquí.`;
  return { best, ok: best.id === currentId, text };
}

/** Etiqueta corta para el botón de un modelo de imagen ("Lo más real" / "Creativo y animado"), o null. */
export function imageTag(m: Named): string | null {
  if (MODEL_RULES.realista.prefer[0].test(m.label) || MODEL_RULES.realista.prefer[0].test(m.id)) return "Lo más real";
  if (MODEL_RULES.creativa.prefer[0].test(m.label) || MODEL_RULES.creativa.prefer[0].test(m.id)) return "Creativo y animado";
  return null;
}

/** La misma regla en texto, para el asistente de ayuda. Sin proveedores ni APIs. */
export const MODEL_GUIDE = `QUÉ MODELO ELEGIR (si preguntan cuál usar o eligen uno que no encaja con lo que quieren hacer; nunca nombres proveedores, APIs ni dónde se procesa, solo el modelo): imagen realista (avatar, anuncio estilo cliente o UGC, creativo que debe parecer foto real) → **GPT Image 2**; imagen creativa, animada, ilustrada o editar una imagen que ya tienes → **Nano Banana Pro**. Video donde la persona habla a cámara → **Omni** (sincroniza mejor los labios); video sin hablar (voz en off después, tomas de apoyo o B-roll, producto, paisajes, movimientos de cámara) → **Grok**. Si ese modelo no está en el selector de esa pantalla, recomienda el que la pantalla marque como recomendado.`;
