/**
 * Para publicar (26-oct-2026, pedido de Jean): 3 casillas al día en hora de República Dominicana (UTC−4, sin
 * horario de verano): 12:30 reel · 18:30 carrusel · 21:00 reel. Lógica pura: casillas, la siguiente libre y textos.
 * Las piezas viven en content_items (slot_at, media_tipo, media_paths, caption, pub_estado) y sus archivos en el
 * bucket privado «publicaciones». Programar en Upload-Post lo hace el servidor (edge function «publicar»).
 */
export type MediaTipo = "reel" | "carrusel";
export type PubEstado = "borrador" | "listo" | "programado" | "publicado" | "error";
export type Casilla = { hora: string; tipo: MediaTipo };

export const CASILLAS: Casilla[] = [
  { hora: "12:30", tipo: "reel" },
  { hora: "18:30", tipo: "carrusel" },
  { hora: "21:00", tipo: "reel" },
];
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

/** Los 7 días ("AAAA-MM-DD") de la semana que empieza en `desde`. */
export function semana(desde: string): string[] {
  const base = new Date(`${desde}T12:00:00${OFFSET_RD}`);
  return Array.from({ length: 7 }, (_, i) => diaRD(new Date(base.getTime() + i * 86_400_000)));
}

/**
 * La siguiente casilla libre de ese tipo desde `ahora` (con 30 min de margen: Upload-Post pide fecha futura).
 * `ocupadas` son los slot_at (ISO) que ya tienen pieza. Busca hasta 60 días.
 */
export function siguienteLibre(tipo: MediaTipo, ocupadas: string[], ahora = new Date()): string | null {
  const usadas = new Set(ocupadas.map(s => new Date(s).toISOString()));
  const limite = ahora.getTime() + 30 * 60_000;
  for (let d = 0; d < 60; d++) {
    const dia = diaRD(new Date(ahora.getTime() + d * 86_400_000));
    for (const c of CASILLAS) {
      if (c.tipo !== tipo) continue;
      const iso = instante(dia, c.hora);
      if (new Date(iso).getTime() > limite && !usadas.has(iso)) return iso;
    }
  }
  return null;
}

/** "lun 26 oct · 12:30" en hora de RD. */
export function etiquetaCasilla(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 4 * 3600_000);
  const dias = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const hh = String(d.getUTCHours()).padStart(2, "0"), mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${dias[d.getUTCDay()]} ${d.getUTCDate()} ${meses[d.getUTCMonth()]} · ${hh}:${mm}`;
}
