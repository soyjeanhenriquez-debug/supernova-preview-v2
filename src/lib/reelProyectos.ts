// Reel Studio guarda VARIOS reels en curso (27-oct-2026, Jean). Antes había uno solo: empezar otro reemplazaba al
// abierto y lo ya pagado (imágenes, clips, voz) quedaba sin forma de volver a abrirse. Lo producido vive en este
// navegador (IndexedDB, por id del reel); aquí solo va la lista de reels, en localStorage, el más reciente primero.

/** Cuántos reels en curso se guardan. Al pasar, sale el que lleva más tiempo sin tocarse. */
export const MAX_PROYECTOS = 20;

export const keyActual = (uid: string) => `supernova.reelstudio.${uid}`;
export const keyLista = (uid: string) => `supernova.reelstudio.${uid}.proyectos`;

type ConId = { id: string; actualizado?: number };

/** La lista guardada (sin repetidos y con lo más reciente primero). */
export function ordenar<T extends ConId>(list: T[]): T[] {
  const seen = new Set<string>();
  return [...list]
    .filter(p => p && typeof p.id === "string" && !seen.has(p.id) && seen.add(p.id))
    .sort((a, b) => (b.actualizado ?? 0) - (a.actualizado ?? 0));
}

/** Pone (o actualiza) un reel arriba de la lista. `fuera` = el que salió por pasar del máximo. */
export function guardarEnLista<T extends ConId>(list: T[], p: T, now = Date.now()): { list: T[]; fuera: T | null } {
  const next = ordenar([{ ...p, actualizado: now }, ...list.filter(x => x.id !== p.id)]);
  const fuera = next.length > MAX_PROYECTOS ? next[next.length - 1] : null;
  return { list: fuera ? next.slice(0, MAX_PROYECTOS) : next, fuera };
}

export const quitarDeLista = <T extends ConId>(list: T[], id: string): T[] => list.filter(p => p.id !== id);

/** Lee la lista; si solo existe el reel suelto de antes (un único proyecto), lo pasa a la lista. */
export function leerLista<T extends ConId & { origen?: unknown }>(store: Pick<Storage, "getItem">, uid: string): T[] {
  let list: T[] = [];
  try { const v = JSON.parse(store.getItem(keyLista(uid)) ?? "[]"); if (Array.isArray(v)) list = v; } catch { /* lista dañada: se empieza vacía */ }
  try {
    const actual = JSON.parse(store.getItem(keyActual(uid)) ?? "null") as T | null;
    // El reel abierto se escribe en cada cambio; la lista, un instante después. Si difieren, manda el abierto.
    if (actual?.id && actual.origen) {
      const prev = list.find(p => p.id === actual.id);
      list = [{ ...actual, actualizado: actual.actualizado ?? prev?.actualizado ?? 0 }, ...list.filter(p => p.id !== actual.id)];
    }
  } catch { /* sin reel suelto */ }
  return ordenar(list);
}
