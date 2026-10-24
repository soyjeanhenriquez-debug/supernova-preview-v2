/**
 * Guardián del Creador · reglas sobre el código (24-oct-2026).
 * Política: "la prioridad es que SUPERNOVA resuelva el trabajo del creador, no que le obligue a aprender
 * cómo funciona la IA". Aquí viven las reglas que se pueden comprobar leyendo el código, sin abrir la app.
 *
 *  · CRÍTICO: rompe el manual (cobros, datos, secretos). Las prueba src/guardian/criticos.test.ts, que corre
 *    antes de cada build (prebuild): si una falla, Vercel no publica.
 *  · MEJORA: jerga técnica en lo que ve la persona. La mide src/guardian/mejoras.test.ts contra una línea
 *    base: no bloquea el deploy, pero `npm test` avisa si aparece jerga nueva.
 * Lo que solo se ve con datos de uso (errores, reembolsos, repeticiones) lo revisa la base: guardian_run_audit().
 */
export type Severidad = "critico" | "importante" | "mejora";
export type Perspectiva = "claridad" | "esfuerzo" | "inteligencia" | "calidad" | "confianza";

export interface Regla {
  id: string;
  severidad: Severidad;
  perspectiva: Perspectiva;
  /** Qué se prohíbe, en palabras de Jean. */
  problema: string;
  patron: RegExp;
  /** Solo se revisan las líneas que además cumplen esto (p. ej. que hablen de winning_ads). */
  siLinea?: RegExp;
  /** Archivos a los que aplica (ruta relativa a la raíz del repo). */
  aplica: (ruta: string) => boolean;
}

export interface Hallazgo { regla: string; ruta: string; linea: number; texto: string }

const esUi = (r: string) => /^src\/(pages|components)\/.+\.tsx$/.test(r) && !/\.test\.tsx$/.test(r);
const esApp = (r: string) => /^src\/.+\.(ts|tsx)$/.test(r) && !/\.test\.(ts|tsx)$/.test(r) && !r.startsWith("src/guardian/");
/** Pantallas que solo ve el admin (depuración): su jerga no la ve un cliente. */
const soloAdmin = (r: string) => r.startsWith("src/pages/admin/") || r.startsWith("src/components/admin/");

export const REGLAS: Regla[] = [
  {
    id: "cobro-desde-navegador", severidad: "critico", perspectiva: "confianza",
    problema: "El navegador no cobra ni devuelve créditos: lo hace el servidor (edge_guard_charge / refund_charge).",
    patron: /\.rpc\(\s*["'`](debit_credits|edge_guard_charge|edge_guard|refund_charge|grant_credits|grant_media_credits|add_credits)["'`]/,
    aplica: esApp,
  },
  {
    id: "conteo-exacto-winning-ads", severidad: "critico", perspectiva: "calidad",
    problema: "Nada de count exact ni select * sobre winning_ads desde el cliente: tumba la base (límite de 8 s).",
    patron: /count:\s*["']exact["']|\.select\(\s*["']\*["']/,
    siLinea: /winning_ads/,
    aplica: esApp,
  },
  {
    id: "secreto-en-el-codigo", severidad: "critico", perspectiva: "confianza",
    problema: "Ningún secreto en el repo: llaves service_role, sk_live, tokens de Meta o de proveedores.",
    patron: /sk_live_[A-Za-z0-9]{8,}|SUPABASE_SERVICE_ROLE_KEY\s*=|eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|access_token=EA[A-Za-z0-9]{20,}/,
    aplica: r => esApp(r) || r === "index.html",
  },
  {
    id: "dolares-por-credito", severidad: "critico", perspectiva: "confianza",
    problema: "Al cliente nunca se le muestra cuántos dólares vale un crédito.",
    patron: /(US\$|USD|\$)\s*[\d.,]+\s*(por|\/|=)\s*(1\s*)?cr[eé]dito/i,
    aplica: r => esUi(r) && !soloAdmin(r),
  },
  {
    id: "promesa-de-ingresos", severidad: "critico", perspectiva: "confianza",
    problema: "Nada de promesas de ingresos con plazo («gana X en 7 días»).",
    patron: /\bgana(r|s)?\s+(US\$|\$)?\s*[\d.,]+\s*(d[oó]lares|usd)?\s*(en|al)\s+\d+\s*(d[ií]as|semanas|horas)/i,
    aplica: r => esUi(r) && !soloAdmin(r),
  },
  {
    id: "jerga-tecnica", severidad: "mejora", perspectiva: "claridad",
    problema: "Texto visible con jerga técnica (endpoint, JSON, webhook, prompt, payload…): la persona no tiene por qué saberla.",
    patron: />[^<{}]*\b(endpoint|JSON|webhook|pipeline|payload|seed|FPS|lipsync|lip-sync|prompt|API key|API)\b[^<{}]*</,
    aplica: r => esUi(r) && !soloAdmin(r),
  },
];

/** Comentarios de una línea: no los ve nadie. */
const esComentario = (l: string) => /^\s*(\/\/|\*|\/\*)/.test(l);

export function revisar(archivos: { ruta: string; texto: string }[], reglas: Regla[] = REGLAS): Hallazgo[] {
  const out: Hallazgo[] = [];
  for (const a of archivos) {
    const aplican = reglas.filter(r => r.aplica(a.ruta));
    if (!aplican.length) continue;
    a.texto.split("\n").forEach((l, i) => {
      if (esComentario(l)) return;
      for (const r of aplican) {
        if (r.siLinea && !r.siLinea.test(l)) continue;
        if (r.patron.test(l)) out.push({ regla: r.id, ruta: a.ruta, linea: i + 1, texto: l.trim().slice(0, 160) });
      }
    });
  }
  return out;
}
