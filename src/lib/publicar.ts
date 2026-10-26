/**
 * Para publicar (26-oct-2026, pedido de Jean): casillas al día en hora de República Dominicana (UTC−4, sin
 * horario de verano). Plan base de 3: 12:30 reel · 18:30 carrusel · 21:00 reel. Se puede crecer a 5 o 10 al día
 * y agregar casillas sueltas. Lógica pura: planes, casillas del día, la siguiente libre, redes y avance.
 * Las piezas viven en content_items (slot_at, media_tipo, media_paths, caption, pub_estado, pub_redes, pub_hechas)
 * y sus archivos en el bucket privado «publicaciones». Programar en Upload-Post lo hace el servidor («publicar»).
 */
export type MediaTipo = "reel" | "carrusel";
export type PubEstado = "borrador" | "listo" | "programado" | "publicado" | "error";
export type Casilla = { hora: string; tipo: MediaTipo; extra?: boolean };
export type Plan = 3 | 5 | 10;
export type Hecha = { at: string; por: string | null };
export type Ajustes = { plan: Plan; extras: Record<string, Casilla[]>; vista: "hoy" | "semana"; redes: RedId[] };

/**
 * Los planes. El de 3 es el acordado con Jean; las horas de 5 y 10 son un punto de partida para medir con las
 * métricas reales y mover después. Un carrusel por cada 3–5 reels, como en el plan base.
 */
export const PLANES: Record<Plan, Casilla[]> = {
  3: [{ hora: "12:30", tipo: "reel" }, { hora: "18:30", tipo: "carrusel" }, { hora: "21:00", tipo: "reel" }],
  5: [
    { hora: "08:00", tipo: "reel" }, { hora: "12:30", tipo: "reel" }, { hora: "15:30", tipo: "reel" },
    { hora: "18:30", tipo: "carrusel" }, { hora: "21:00", tipo: "reel" },
  ],
  10: [
    { hora: "07:00", tipo: "reel" }, { hora: "08:30", tipo: "reel" }, { hora: "10:00", tipo: "carrusel" },
    { hora: "11:30", tipo: "reel" }, { hora: "12:30", tipo: "reel" }, { hora: "14:30", tipo: "reel" },
    { hora: "16:30", tipo: "reel" }, { hora: "18:30", tipo: "carrusel" }, { hora: "20:00", tipo: "reel" },
    { hora: "21:00", tipo: "reel" },
  ],
};
/** El plan base (se mantiene el nombre de la v1). */
export const CASILLAS: Casilla[] = PLANES[3];

export type RedId = "instagram" | "tiktok" | "youtube" | "facebook";
/** Redes de contenido corto. `carrusel`: si acepta carruseles de fotos por Upload-Post. */
export const REDES: { id: RedId; corto: string; nombre: string; carrusel: boolean }[] = [
  { id: "instagram", corto: "IG", nombre: "Instagram", carrusel: true },
  { id: "tiktok", corto: "TikTok", nombre: "TikTok", carrusel: false },
  { id: "youtube", corto: "Shorts", nombre: "YouTube Shorts", carrusel: false },
  { id: "facebook", corto: "FB", nombre: "Facebook", carrusel: true },
];
export const AJUSTES_BASE: Ajustes = { plan: 3, extras: {}, vista: "hoy", redes: REDES.map(r => r.id) };

/** RD no cambia de hora en el año. */
export const OFFSET_RD = "-04:00";

export const ESTADO_PUB: Record<PubEstado, { label: string; cls: string }> = {
  borrador: { label: "Borrador", cls: "border-border text-muted-foreground" },
  listo: { label: "Listo para programar", cls: "border-primary/50 text-primary" },
  programado: { label: "Programado", cls: "border-sky-500/50 text-sky-400" },
  publicado: { label: "Publicado", cls: "border-emerald-500/50 text-emerald-400" },
  error: { label: "No se pudo programar", cls: "border-destructive/50 text-destructive" },
};

/** "2026-10-26" en RD para un instante dado. */
export function diaRD(d: Date): string {
  const rd = new Date(d.getTime() - 4 * 3600_000);
  return rd.toISOString().slice(0, 10);
}

/** El instante (ISO con zona de RD) de una casilla de un día "AAAA-MM-DD". */
export const instante = (dia: string, hora: string) => new Date(`${dia}T${hora}:00${OFFSET_RD}`).toISOString();

/** "HH:MM" en RD de un instante. */
export function horaRD(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 4 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** Suma días a "AAAA-MM-DD". */
export const sumarDias = (dia: string, n: number) => diaRD(new Date(new Date(`${dia}T12:00:00${OFFSET_RD}`).getTime() + n * 86_400_000));

/** Los 7 días ("AAAA-MM-DD") de la semana que empieza en `desde`. */
export function semana(desde: string): string[] {
  return Array.from({ length: 7 }, (_, i) => sumarDias(desde, i));
}

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Las casillas de un día: las del plan + las extra de ese día, en orden de hora y sin repetir hora. */
export function casillasDelDia(a: Pick<Ajustes, "plan" | "extras">, dia: string): Casilla[] {
  const base = PLANES[a.plan] ?? PLANES[3];
  const extras = (a.extras?.[dia] ?? []).filter(c => HORA_RE.test(c.hora) && (c.tipo === "reel" || c.tipo === "carrusel"));
  const porHora = new Map<string, Casilla>();
  for (const c of base) porHora.set(c.hora, c);
  for (const c of extras) if (!porHora.has(c.hora)) porHora.set(c.hora, { ...c, extra: true });
  return [...porHora.values()].sort((x, y) => x.hora.localeCompare(y.hora));
}

/** Agrega (o quita) una casilla extra a un día. Devuelve los extras nuevos; no toca el resto de días. */
export function conExtra(extras: Ajustes["extras"], dia: string, c: Casilla, quitar = false): Ajustes["extras"] {
  const lista = (extras[dia] ?? []).filter(x => x.hora !== c.hora);
  const nuevo = quitar ? lista : [...lista, { hora: c.hora, tipo: c.tipo }].sort((x, y) => x.hora.localeCompare(y.hora));
  const out = { ...extras };
  if (nuevo.length) out[dia] = nuevo; else delete out[dia];
  return out;
}

/**
 * La siguiente casilla libre de ese tipo desde `ahora` (con 30 min de margen: Upload-Post pide fecha futura).
 * `ocupadas` son los slot_at (ISO) que ya tienen pieza. `casillasDe` da las casillas de cada día (por defecto el
 * plan base). Busca hasta 60 días.
 */
export function siguienteLibre(tipo: MediaTipo, ocupadas: string[], ahora = new Date(), casillasDe: (dia: string) => Casilla[] = () => CASILLAS): string | null {
  const usadas = new Set(ocupadas.map(s => new Date(s).toISOString()));
  const limite = ahora.getTime() + 30 * 60_000;
  for (let d = 0; d < 60; d++) {
    const dia = diaRD(new Date(ahora.getTime() + d * 86_400_000));
    for (const c of casillasDe(dia)) {
      if (c.tipo !== tipo) continue;
      const iso = instante(dia, c.hora);
      if (new Date(iso).getTime() > limite && !usadas.has(iso)) return iso;
    }
  }
  return null;
}

/** Lee lo guardado en publicar_ajustes y lo deja seguro (cualquier valor raro vuelve al plan base). */
export function ajustesDe(row: unknown): Ajustes {
  const r = (row && typeof row === "object" && !Array.isArray(row) ? row : {}) as Partial<Record<keyof Ajustes, unknown>>;
  const plan = r.plan === 5 || r.plan === 10 ? r.plan : 3;
  const extras = r.extras && typeof r.extras === "object" && !Array.isArray(r.extras) ? r.extras as Ajustes["extras"] : {};
  const redes = Array.isArray(r.redes) ? REDES.map(x => x.id).filter(id => (r.redes as unknown[]).includes(id)) : AJUSTES_BASE.redes;
  return { plan, extras, vista: r.vista === "semana" ? "semana" : "hoy", redes: redes.length ? redes : AJUSTES_BASE.redes };
}

type ConRedes = { media_tipo: MediaTipo | null; pub_redes: string[]; pub_hechas?: Record<string, Hecha> | null };

/** Las redes donde va una pieza (los carruseles solo donde se aceptan), en el orden de REDES. */
export function redesDe(p: ConRedes): RedId[] {
  return REDES.filter(r => p.pub_redes.includes(r.id) && (p.media_tipo !== "carrusel" || r.carrusel)).map(r => r.id);
}

/** ¿Se puede marcar esta red para esta pieza? (un carrusel no sale en TikTok ni Shorts). */
export const redPosible = (p: Pick<ConRedes, "media_tipo">, red: RedId) => p.media_tipo !== "carrusel" || !!REDES.find(r => r.id === red)?.carrusel;

/**
 * Un toque en una red: si estaba marcada, se desmarca; si no, queda publicada ahora (y se suma a sus redes).
 * Devuelve lo que hay que guardar: pub_hechas, pub_redes y pub_estado (publicado cuando salió en todas).
 */
export function marcar<T extends ConRedes & { pub_estado: PubEstado; pub_job?: string | null }>(p: T, red: RedId, por: string | null, ahora = new Date()) {
  const hechas = { ...(p.pub_hechas ?? {}) };
  let redes = p.pub_redes;
  if (hechas[red]) delete hechas[red];
  else {
    hechas[red] = { at: ahora.toISOString(), por };
    if (!redes.includes(red)) redes = [...redes, red];
  }
  const destino = redesDe({ ...p, pub_redes: redes });
  const todas = destino.length > 0 && destino.every(r => hechas[r]);
  const pub_estado: PubEstado = todas ? "publicado" : p.pub_estado === "publicado" ? (p.pub_job ? "programado" : "listo") : p.pub_estado;
  return { pub_hechas: hechas, pub_redes: redes, pub_estado };
}

/** Avance: publicaciones hechas de las que tocan (pieza × red), en total y por red. */
export function avance(piezas: ConRedes[]) {
  const porRed = Object.fromEntries(REDES.map(r => [r.id, { hechas: 0, total: 0 }])) as Record<RedId, { hechas: number; total: number }>;
  let hechas = 0, total = 0;
  for (const p of piezas) {
    for (const r of redesDe(p)) {
      total++; porRed[r].total++;
      if (p.pub_hechas?.[r]) { hechas++; porRed[r].hechas++; }
    }
  }
  return { hechas, total, porRed };
}

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "lun 26 oct · 12:30" en hora de RD. */
export function etiquetaCasilla(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 4 * 3600_000);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]} · ${horaRD(iso)}`;
}

/** "lun 26 oct" de un día "AAAA-MM-DD". */
export const etiquetaDia = (dia: string) => etiquetaCasilla(instante(dia, "12:00")).split(" · ")[0];
