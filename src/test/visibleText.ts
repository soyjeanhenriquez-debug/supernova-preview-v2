/**
 * Utilidad de pruebas (R2-15, 12-oct-2026): saca los TEXTOS QUE VE LA PERSONA de los .tsx de la app
 * para revisar las reglas del manual (sin "clonar", sin "vídeo", sin voseo, sin dólares por crédito,
 * sin promesas). Usa el compilador de TypeScript, así que los comentarios nunca cuentan.
 *
 * Qué se toma:
 *  - texto JSX (lo que va entre etiquetas),
 *  - textos entre comillas o de plantilla (`...`) que parecen frases (no clases de Tailwind, ni claves,
 *    ni nombres de eventos, ni rutas).
 * Qué se salta:
 *  - imports/exports, tipos literales, nombres de propiedades, `case "Pantalla":`,
 *  - atributos JSX técnicos (className, key, id, href, src…),
 *  - argumentos de llamadas técnicas (localStorage, supabase .from/.rpc/.eq, track, eventos…).
 * No es perfecto: es una red. Si salta un falso positivo, se agrega a la lista ALLOW de la prueba con
 * el motivo, no se apaga la regla.
 */
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

export interface VisibleString { file: string; line: number; text: string }

const ROOT = path.resolve(__dirname, "..", "..");

const TECH_ATTRS = new Set([
  "className", "key", "id", "type", "href", "src", "to", "name", "role", "htmlFor", "variant", "size", "rel",
  "target", "method", "accept", "autoComplete", "inputMode", "pattern", "viewBox", "d", "fill", "stroke",
  "xmlns", "style", "as", "align", "side", "mode", "initialMode", "page", "lang", "dir", "tabIndex",
  "data-testid", "data-tour", "data-state", "strokeWidth", "strokeLinecap", "strokeLinejoin", "points",
  "transform", "gradientUnits", "offset", "stopColor", "x", "y", "cx", "cy", "r", "rx", "ry", "x1", "x2",
  "y1", "y2", "width", "height", "min", "max", "step", "loading", "decoding", "preload", "crossOrigin",
  "allow", "sandbox", "download", "form", "enterKeyHint", "capture", "orientation", "sideOffset", "initialTab",
  "stage", "tone", "icon", "tool", "kind", "storageKey", "value", "defaultValue",
]);

const TECH_CALLS = /(^|\.)(getItem|setItem|removeItem|addEventListener|removeEventListener|dispatchEvent|from|rpc|select|eq|neq|in|is|gte|lte|gt|lt|order|limit|ilike|like|match|or|filter|contains|invoke|track|getElementById|querySelector|querySelectorAll|createElement|setAttribute|getAttribute|getPropertyValue|cn|clsx|startsWith|endsWith|includes|split|replace|replaceAll|join|indexOf|test|toLocaleString|toLocaleDateString|toLocaleTimeString|NumberFormat|DateTimeFormat|get|has|delete|set|channel|on|storage|upload|download|createSignedUrl|createSignedUrls|list|remove|update|upsert|insert|single|maybeSingle|fetch|URL|URLSearchParams|append|Error|import|require|matchMedia|postMessage|open|keys|lazy|navigate|emit|log|warn|error|info|debug|toString|padStart|padEnd|localeCompare|onAuthStateChange|getSession|signInWithOtp|signInWithPassword|exec|requestAnimationFrame|setTimeout|toBlob|toDataURL|fillText|measureText|font|load|check|loadFont|FontFace)$/;

const looksTechnical = (s: string): boolean => {
  const t = s.trim();
  if (!t) return true;
  // Una sola "palabra" en minúsculas con guiones, puntos o barras: clave, evento, ruta o id.
  if (!/\s/.test(t) && /^[a-z0-9_\-.:/#?=&%@[\]()+*,$]+$/.test(t)) return true;
  // Rutas y URLs.
  if (/^(https?:|mailto:|tel:|\/|#\/|data:)/.test(t)) return true;
  // Lista de clases de Tailwind: todos los trozos sin mayúsculas ni acentos y al menos uno con guion.
  const parts = t.split(/\s+/);
  if (parts.every(p => /^[a-z0-9:\-[\]/.%#_()!&>~*=,'"]+$/.test(p)) && parts.some(p => p.includes("-"))) return true;
  return false;
};

function calleeName(call: ts.CallExpression | ts.NewExpression): string {
  const e = call.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return "";
}

function skipStringLiteral(node: ts.Node): boolean {
  let p = node.parent;
  if (!p) return true;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p)) return true;
  if (ts.isLiteralTypeNode(p)) return true;
  if ((ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isPropertySignature(p) || ts.isMethodDeclaration(p)) && p.name === node) return true;
  if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true;
  if (ts.isCaseClause(p)) return true;
  // a === "x", a !== "x": comparaciones con claves internas.
  if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.InKeyword].includes(p.operatorToken.kind)) return true;
  // Atributo JSX técnico: className="…", key="…"…
  if (ts.isJsxAttribute(p)) return TECH_ATTRS.has(p.name.getText());
  // Dentro de una expresión JSX de un atributo técnico: className={cond ? "a" : "b"}.
  for (let q: ts.Node | undefined = p; q; q = q.parent) {
    if (ts.isJsxAttribute(q)) return TECH_ATTRS.has(q.name.getText());
    if (ts.isCallExpression(q) || ts.isNewExpression(q)) {
      if (TECH_CALLS.test(calleeName(q))) return true;
      break;
    }
    if (ts.isBlock(q) || ts.isSourceFile(q) || ts.isJsxElement(q) || ts.isJsxSelfClosingElement(q)) break;
  }
  return false;
}

export function visibleStrings(file: string): VisibleString[] {
  const src = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: VisibleString[] = [];
  const rel = path.relative(ROOT, file);
  const push = (node: ts.Node, text: string) => {
    const t = text.replace(/\s+/g, " ").trim();
    if (!t || looksTechnical(t)) return;
    out.push({ file: rel, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, text: t });
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) push(node, node.text);
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) { if (!skipStringLiteral(node)) push(node, node.text); }
    else if (ts.isTemplateExpression(node)) {
      if (!skipStringLiteral(node)) {
        // Las partes fijas de la plantilla; lo de ${…} se reemplaza por "X" para que la frase siga leyéndose.
        const text = node.head.text + node.templateSpans.map(s => "X" + s.literal.text).join("");
        push(node, text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** Todos los .tsx (sin pruebas) de las carpetas dadas, relativas a la raíz del proyecto. */
export function appFiles(dirs: string[] = ["src/pages", "src/components"]): string[] {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "ui") walk(p); }
      else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name)) files.push(p);
    }
  };
  for (const d of dirs) walk(path.join(ROOT, d));
  return files.sort();
}

export const projectRoot = ROOT;

/** Busca una regla en todos los textos visibles. */
export function findVisible(rule: RegExp, files = appFiles()): VisibleString[] {
  const hits: VisibleString[] = [];
  for (const f of files) for (const s of visibleStrings(f)) { rule.lastIndex = 0; if (rule.test(s.text)) hits.push(s); }
  return hits;
}
