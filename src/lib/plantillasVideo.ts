// Plantillas de edición con TU video (30-oct-2026, Jean: «o con las plantillas que precargamos» y «si encuentras
// plantillas de videos ya analizados con Apify, súbelas las que te parezcan interesantes y replicables»).
// Lógica pura: qué plantillas hay, de dónde salen y cómo se ponen en el tiempo los momentos que saca la IA.
import { aRecortado, type Tramo } from "@/lib/recorte";

export type PlantillaId = "dinamico" | "explicador" | "set" | "desfile" | "lista" | "iconos" | "urgencia";

/** Lo que la IA saca de lo que dices (video-subtitles con plan: true). Tiempos del video original. */
export type Momento = { desde: number; tipo: "numero" | "punto" | "caso" | "frase"; titulo: string; detalle: string; valor: string; emoji: string };
/** El momento ya puesto en el video final (sin silencios): desde `t`, durante `dur` segundos. */
export type MomentoFinal = Omit<Momento, "desde"> & { t: number; dur: number };

export const PLANTILLAS: { id: PlantillaId; nombre: string; linea: string; origen: string }[] = [
  { id: "dinamico", nombre: "Reel dinámico", linea: "Un corte cada ~2 s con transición y sonido, subtítulos cortos y B-roll.", origen: "Reel Studio" },
  { id: "explicador", nombre: "Explicador", linea: "Tú hablando y, en cada idea, la cifra o la frase en grande sobre negro.", origen: "Reto · anuncios educativos" },
  { id: "set", nombre: "Set + fichas", linea: "Tú a pantalla completa con zoom lento y fichas verdes con cada paso.", origen: "Reto · «24 horas»" },
  { id: "desfile", nombre: "Desfile de casos", linea: "Una tarjeta por ejemplo, con su etiqueta, y tú en un círculo abajo.", origen: "Reto · «cosas raras»" },
  { id: "lista", nombre: "Lista numerada", linea: "«Estas 5…, la última es la mejor»: cada punto con su número 1/5.", origen: "Reel analizado · «5 herramientas»" },
  { id: "iconos", nombre: "Charla con íconos", linea: "Tú hablando y un ícono que aparece a tu lado en cada idea clave.", origen: "Reel analizado · Dan Martell" },
  { id: "urgencia", nombre: "Letrero de urgencia", linea: "Tu gancho fijo arriba y la cifra en grande cuando la dices.", origen: "Reel analizado · «Faltan 2 meses»" },
];

/** Cuánto se queda cada momento en pantalla, según la plantilla. */
const DURA: Record<PlantillaId, number> = { dinamico: 0, explicador: 2.6, set: 3, desfile: 99, lista: 99, iconos: 1.8, urgencia: 2.2 };

/**
 * Pone los momentos en el video final: los pasa al tiempo sin silencios (los que caen en un corte se mueven al
 * siguiente tramo), quita los que se pisan (menos de 1,2 s entre uno y otro) y no deja ninguno en el cierre.
 * Lista y Urgencia solo usan los momentos que les sirven (puntos; cifras).
 */
export function momentosFinales(ms: Momento[], plantilla: PlantillaId, ts: Tramo[], durFinal: number, cierre: boolean): MomentoFinal[] {
  const usar = plantilla === "lista" ? ms.filter(m => m.tipo === "punto" || m.tipo === "caso")
    : plantilla === "urgencia" ? ms.filter(m => m.valor) : ms;
  const fin = durFinal - (cierre ? 2.6 : 0.4);
  const out: MomentoFinal[] = [];
  for (const m of [...usar].sort((a, b) => a.desde - b.desde)) {
    let t: number | null = ts.length ? aRecortado(m.desde, ts) : m.desde;
    if (t === null) {
      const sig = ts.find(x => x.a > m.desde);
      t = sig ? aRecortado(sig.a, ts) : null;
    }
    if (t === null || t >= fin - 0.8) continue;
    if (out.length && t - out[out.length - 1].t < 1.2) continue;
    const { desde: _d, ...resto } = m;
    out.push({ ...resto, t: Math.round(t * 10) / 10, dur: Math.min(DURA[plantilla], fin - t) });
  }
  return out;
}

/** Las palabras que van en color: la palabra clave de cada subtítulo. */
export const clavesDe = (subs: { clave?: string }[]) => subs.map(s => (s.clave ?? "").trim()).filter(Boolean);
