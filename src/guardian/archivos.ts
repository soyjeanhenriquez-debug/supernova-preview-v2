// Solo para pruebas (node): lee el código de la app para el Guardián del Creador.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = join(__dirname, "..", "..");

function recorrer(dir: string, out: string[]) {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n.startsWith(".")) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) recorrer(p, out);
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
}

export function archivosApp(): { ruta: string; texto: string }[] {
  const lista: string[] = [];
  recorrer(join(RAIZ, "src"), lista);
  lista.push(join(RAIZ, "index.html"));
  return lista.map(p => ({ ruta: relative(RAIZ, p).split("\\").join("/"), texto: readFileSync(p, "utf8") }));
}
