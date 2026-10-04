/**
 * Guardado local (IndexedDB) de "Producir video": todo lo que ya se pagó (voz, imagen, animación)
 * se guarda aquí en cuanto llega, para que recargar la página no pierda nada ni vuelva a cobrar.
 * Nada de esto sube al servidor (plan Free: 1 GB de almacenamiento y 50 MB por archivo); el video
 * final se descarga. Si el navegador no deja usar IndexedDB (modo privado), todo sigue funcionando
 * en memoria y la pantalla avisa que el avance no se guarda.
 */

export type PieceStatus = "pending" | "working" | "done" | "failed";

export type SceneState = {
  n: string;
  visual: string;
  narration: string;
  voice: PieceStatus;
  image: PieceStatus;
  /** "none" = esta escena no se anima. */
  clip: PieceStatus | "none";
  /** Trabajo de video-studio (se sigue consultando aunque se recargue la página). */
  jobId?: string | null;
  /** Duración real de la voz, en segundos (para capítulos y montaje). */
  voiceSec?: number;
  error?: string | null;
};

export type ProductionMeta = {
  id: string;
  uid: string;
  /** Fila en yt_productions (si la migración ya está aplicada). */
  serverId?: string | null;
  title: string;
  topic?: string;
  thumbnail?: string;
  format: "16:9" | "9:16" | "3:4";
  style: string;
  voice: string;
  lang: string;
  pct: number;
  subtitles: boolean;
  scenes: SceneState[];
  /** Créditos cobrados por el servidor en esta producción (solo para mostrar). */
  spent: number;
  createdAt: number;
  updatedAt: number;
};

export type MediaKind = "voice" | "image" | "clip";

const DB = "supernova-yt";
const PRODS = "productions";
const MEDIA = "media";
let dbp: Promise<IDBDatabase | null> | null = null;
const memProds = new Map<string, ProductionMeta>();
const memMedia = new Map<string, Blob>();

function open(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise(resolve => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(PRODS)) db.createObjectStore(PRODS, { keyPath: "id" }).createIndex("uid", "uid");
        if (!db.objectStoreNames.contains(MEDIA)) db.createObjectStore(MEDIA);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}

/** true si el avance se guarda en el navegador (si no, solo vive mientras la pestaña esté abierta). */
export async function storeAvailable(): Promise<boolean> { return !!(await open()); }

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | null> {
  return open().then(db => new Promise<T | null>(resolve => {
    if (!db) return resolve(null);
    try {
      const t = db.transaction(store, mode);
      const r = fn(t.objectStore(store));
      t.oncomplete = () => resolve(r ? (r.result as T) : null);
      t.onerror = () => resolve(null);
      t.onabort = () => resolve(null);
    } catch { resolve(null); }
  }));
}

const mediaKey = (prodId: string, idx: number, kind: MediaKind) => `${prodId}/${idx}/${kind}`;

export async function saveProduction(p: ProductionMeta): Promise<void> {
  const copy: ProductionMeta = { ...p, scenes: p.scenes.map(s => ({ ...s })), updatedAt: Date.now() };
  memProds.set(p.id, copy);
  await tx(PRODS, "readwrite", s => s.put(copy));
}

export async function getProduction(id: string): Promise<ProductionMeta | null> {
  const r = await tx<ProductionMeta>(PRODS, "readonly", s => s.get(id));
  return r ?? memProds.get(id) ?? null;
}

/** Producciones del usuario, la más reciente primero. */
export async function listProductions(uid: string, limit = 6): Promise<ProductionMeta[]> {
  const r = await tx<ProductionMeta[]>(PRODS, "readonly", s => s.index("uid").getAll(uid));
  const all = r ?? [...memProds.values()].filter(p => p.uid === uid);
  return all.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
}

export async function putMedia(prodId: string, idx: number, kind: MediaKind, blob: Blob): Promise<void> {
  const k = mediaKey(prodId, idx, kind);
  memMedia.set(k, blob);
  await tx(MEDIA, "readwrite", s => s.put(blob, k));
}

export async function getMedia(prodId: string, idx: number, kind: MediaKind): Promise<Blob | null> {
  const k = mediaKey(prodId, idx, kind);
  const r = await tx<Blob>(MEDIA, "readonly", s => s.get(k));
  return r ?? memMedia.get(k) ?? null;
}

/** Borra una producción y todos sus archivos del navegador. */
export async function deleteProduction(id: string): Promise<void> {
  memProds.delete(id);
  for (const k of [...memMedia.keys()]) if (k.startsWith(`${id}/`)) memMedia.delete(k);
  await tx(PRODS, "readwrite", s => s.delete(id));
  await tx(MEDIA, "readwrite", s => s.delete(IDBKeyRange.bound(`${id}/`, `${id}/￿`)));
}

/**
 * Al reabrir una producción: lo que estaba "trabajando" sin resultado vuelve a "pendiente" (no se
 * cobra solo: el usuario toca "Continuar"). Las animaciones con trabajo en video-studio siguen.
 */
export function resumeState(p: ProductionMeta): ProductionMeta {
  return {
    ...p,
    scenes: p.scenes.map(s => ({
      ...s,
      voice: s.voice === "working" ? "pending" : s.voice,
      image: s.image === "working" ? "pending" : s.image,
      clip: s.clip === "working" && !s.jobId ? "pending" : s.clip,
    })),
  };
}

/** ¿Qué falta? Sirve para el botón "Continuar" y para saber si ya se puede armar el video. */
export function progressOf(p: Pick<ProductionMeta, "scenes">) {
  let done = 0, total = 0, failed = 0, pending = 0, clipsWorking = 0;
  for (const s of p.scenes) {
    for (const st of [s.voice, s.image, s.clip]) {
      if (st === "none") continue;
      total++;
      if (st === "done") done++;
      else if (st === "failed") failed++;
      else if (st === "pending") pending++;
    }
    if (s.clip === "working") clipsWorking++;
  }
  const ready = p.scenes.length > 0 && p.scenes.every(s => s.voice === "done" && s.image === "done");
  return { done, total, failed, pending, clipsWorking, ready };
}
