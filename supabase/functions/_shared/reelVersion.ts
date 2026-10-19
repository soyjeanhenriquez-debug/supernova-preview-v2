// SUPERNOVA — Escribe la versión de un Reel y la revisa antes de entregarla (Jean, 19-oct-2026).
//
// El validador del 90 % de texto de ESPEJO se retiró: ahora ESPEJO es fidelidad creativa y se revisa
// por sentido (contentQa.ts): tema, tesis, mecanismo del gancho, estructura, intención emocional, nada
// ajeno y redacción original. Los demás modos tienen sus propios puntos. Una generación y, si hay una
// falla crítica y queda tiempo, UNA corrección. Si sigue fallando en lo crítico, no se entrega.
import { HONESTY_RULES } from "./honesty.ts";
import type { CtaPolicy, Objetivo } from "./brandDna.ts";
import { cleanVersion, promptB, referenciaTexto, versionPieza, type Base, type BriefB, type Nivel, type Version } from "./reelLayers.ts";
import { cleanJudge, correctionNote, criticas, failMessage, judgePrompt, localChecks, revision, type Check, type Pieza } from "./contentQa.ts";

export type VersionResult = { version: Version | null; reason: string };
type Generate = (prompt: string, temperature: number) => Promise<unknown>;

export const isSpanish = (idioma: string) => /^(es(?:$|[-_])|español\b|espanol\b|spanish\b)/i.test(idioma.trim());

export interface QaInput {
  objetivo: Objetivo; policy: CtaPolicy;
  /** Nombres de las ofertas de la persona (no pueden aparecer fuera de VENDER). */
  ofertas: string[];
  /** P8 sin autorizar: no puede aparecer. Vacío si está autorizada. */
  privada: string;
  /** Estilo de comunicación de la persona (dato para revisar el tono). */
  estilo: string;
}

/** Revisa una versión: chequeos fijos siempre; la revisión semántica si queda tiempo. */
export function reviewVersion(base: Base, nivel: Nivel, v: Version, qa: QaInput, generate: Generate, remainingMs: () => number) {
  return reviewPieza(base, nivel, versionPieza(v), qa, generate, remainingMs);
}

/** Lo mismo para cualquier pieza (Reel o carrusel). */
export async function reviewPieza(base: Base, nivel: Nivel, pieza: Pieza, qa: QaInput, generate: Generate, remainingMs: () => number): Promise<{ checks: Check[]; semantica: boolean }> {
  const local = localChecks({
    modo: nivel, policy: qa.policy, pieza, ofertas: qa.ofertas, privada: qa.privada,
    original: base.transcripcion.map(t => t.texto).join(" "), originalEnEspanol: isSpanish(base.idioma),
  });
  if (remainingMs() < 15_000) return { checks: local, semantica: false };
  try {
    const out = await generate(judgePrompt({ modo: nivel, objetivo: qa.objetivo, policy: qa.policy, referencia: referenciaTexto(base), pieza, estilo: qa.estilo }), 0.1);
    const judged = cleanJudge(out, nivel);
    return judged ? { checks: [...local, ...judged], semantica: true } : { checks: local, semantica: false };
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") throw e;
    return { checks: local, semantica: false };
  }
}

/**
 * Una generación, su revisión y, solo si hay una falla crítica y queda tiempo, UNA corrección.
 * Devuelve la mejor versión sin fallas críticas, o null con el motivo para la persona.
 */
export async function writeReelVersion(base: Base, nivel: Nivel, brief: BriefB, ctx: string, qa: QaInput, options: {
  generate: Generate;
  remainingMs: () => number;
}): Promise<VersionResult> {
  const prompt = promptB(base, nivel, brief, ctx) + "\n\n" + HONESTY_RULES;
  const parse = (out: unknown) => cleanVersion(out, nivel, brief.palabra || base.cta.palabra, base.estructura.length);
  const temp = nivel === "espejo" ? 0.4 : nivel === "inspiracion" ? 0.8 : 0.6;
  const first = parse(await options.generate(prompt, temp));
  if (!first) return { version: null, reason: "La IA no pudo escribir tu versión. No se cobró esta versión: inténtalo de nuevo." };
  const r1 = await reviewVersion(base, nivel, first, qa, options.generate, options.remainingMs);
  const pack = (v: Version, checks: Check[], corregida: boolean, semantica: boolean): Version => ({ ...v, revision: revision(checks, corregida, semantica) });
  if (!criticas(r1.checks).length) return { version: pack(first, r1.checks, false, r1.semantica), reason: "" };
  if (options.remainingMs() < 40_000) return { version: null, reason: failMessage(r1.checks) };

  const second = parse(await options.generate([prompt, correctionNote(r1.checks), `Intento anterior: ${JSON.stringify(first)}`].join("\n\n"), Math.min(temp, 0.4)));
  if (!second) return { version: null, reason: failMessage(r1.checks) };
  const r2 = await reviewVersion(base, nivel, second, qa, options.generate, options.remainingMs);
  if (!criticas(r2.checks).length) return { version: pack(second, r2.checks, true, r2.semantica), reason: "" };
  return { version: null, reason: failMessage(r2.checks) };
}
