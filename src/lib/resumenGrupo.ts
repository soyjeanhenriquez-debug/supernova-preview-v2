// SUPERNOVA — Resumen diario para el grupo de WhatsApp (28-oct-2026, Jean: opción A).
// Mejor que el de la competencia: días pagando anuncios (la prueba de que vende), cómo vende (WhatsApp o
// página), si lo puedes hacer tú solo y una acción al final. Solo datos reales de la base; nombres ocultos.
// No se envía solo: Jean lo copia desde Admin → Mensajes y lo pega en el grupo (WhatsApp no deja publicar en
// grupos por la API oficial y las no oficiales arriesgan el número).
import { NICHE_LABEL } from "@/lib/offers";

export type OfertaResumen = { niche: string | null; market: string | null; days_active: number | null; active_ads: number | null; canal: string | null; copy_score: number | null };
export type DatosResumen = {
  hoy: number; semana: number; total: number;
  top: OfertaResumen[];
  whatsapp: number; whatsappGanadoras: number;
  nichos: { niche: string; n: number }[];
};

export const ENLACE_GRUPO = "https://supernova-six-eta.vercel.app/?utm_source=whatsapp&utm_medium=grupo&utm_campaign=resumen_diario";

const NICHO_EMOJI: Record<string, string> = {
  salud_fitness: "💪", dinero_negocios: "💸", marketing_ventas: "📈", desarrollo_personal: "🧠", relaciones: "❤️",
  educacion_idiomas: "📚", tecnologia_ia: "🤖", belleza_moda: "💄", hogar_mascotas: "🐾", espiritualidad: "🔮",
  infantil_familia: "🧸", gastronomia_recetas: "🥘", inmobiliaria: "🏠", finanzas_trading: "📊", software_saas: "🧩",
  servicios_locales: "📍", entretenimiento: "🎬", viajes: "✈️", otro: "✨",
};

// Punto de miles siempre (es-ES deja "8300" sin punto en números de 4 cifras).
const num = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
export const bandera = (code: string | null) =>
  code && /^[A-Z]{2}$/i.test(code) ? String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65)) : "🌎";
const nicho = (k: string | null) => (NICHE_LABEL[k ?? "otro"] ?? "Otro").replace(" & ", " y ");

/** "más de 8.300": redondea hacia abajo a la centena (nunca infla la cifra). */
export const masDe = (n: number) => (n >= 1000 ? `más de ${num(Math.floor(n / 100) * 100)}` : num(n));

export function lineaOferta(o: OfertaResumen, i: number): string {
  const partes = [
    `${i + 1}. ${NICHO_EMOJI[o.niche ?? "otro"] ?? "✨"} ${nicho(o.niche)}`,
    bandera(o.market),
    `*${num(o.days_active ?? 0)} ${o.days_active === 1 ? "día" : "días"} pagando*`,
  ];
  if (o.active_ads) partes.push(`${num(o.active_ads)} ${o.active_ads === 1 ? "anuncio activo" : "anuncios activos"}`);
  if (o.canal === "whatsapp") partes.push("💬 vende por WhatsApp");
  else if (o.canal === "pagina") partes.push("🔗 página de ventas");
  if ((o.copy_score ?? 0) >= 4) partes.push("✅ lo haces tú solo");
  return partes.join(" · ");
}

export function resumenGrupo(d: DatosResumen, fecha = new Date()): string {
  const dia = fecha.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  const out = [
    `🔭 *SUPERNOVA · Radar de hoy* (${dia})`,
    "",
    `📥 *${num(d.hoy)} ${d.hoy === 1 ? "negocio nuevo" : "negocios nuevos"}* hoy · ${num(d.semana)} esta semana`,
    `(de ${masDe(d.total)} que revisamos cada día)`,
  ];
  if (d.top.length) {
    out.push("", "⏳ *Los que más tiempo llevan pagando anuncios* (la mejor prueba de que venden):", ...d.top.map(lineaOferta));
    out.push("", "🔒 Nombre, anuncio y análisis completo: dentro de SUPERNOVA");
  }
  if (d.whatsapp > 0) {
    out.push("", `💬 *Venden por WhatsApp:* ${num(d.whatsapp)} negocios${d.whatsappGanadoras ? ` (${num(d.whatsappGanadoras)} entre las 300 ganadoras)` : ""}`);
  }
  if (d.nichos.length) out.push("", `📊 Nichos de la semana: ${d.nichos.slice(0, 3).map(x => `${nicho(x.niche)} (${num(x.n)})`).join(" · ")}`);
  out.push("", "👉 Elige uno y haz tu versión esta semana:", ENLACE_GRUPO);
  return out.join("\n");
}

/** Cuenta los nichos de las ofertas nuevas de la semana (sin "otro"), de más a menos. */
export function contarNichos(niches: (string | null)[]): { niche: string; n: number }[] {
  const m = new Map<string, number>();
  for (const k of niches) if (k && k !== "otro") m.set(k, (m.get(k) ?? 0) + 1);
  return [...m].map(([niche, n]) => ({ niche, n })).sort((a, b) => b.n - a.n);
}

/**
 * El mismo resumen como correo (Admin → Mensajes): saludo con {{nombre}}, *negrita* de WhatsApp → **negrita**,
 * el enlace marcado como correo y firma de Jean. El asunto sale de los datos del día (o uno general).
 */
export function resumenCorreo(texto: string): { subject: string; body: string } {
  const nuevos = texto.match(/\*(\d[\d.]*) negocios? nuevos?\*/)?.[1];
  const dias = texto.match(/\*(\d[\d.]*) días pagando\*/)?.[1];
  const subject = nuevos
    ? `Radar de hoy: ${nuevos} negocios nuevos${dias ? ` y uno que lleva ${dias} días pagando anuncios` : ""}`
    : "Radar de hoy de SUPERNOVA";
  const cuerpo = texto
    .replace(/^🔭 \*SUPERNOVA · Radar de hoy\*.*\n+/, "")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1**$2**")
    .replace("utm_source=whatsapp&utm_medium=grupo", "utm_source=correo&utm_medium=email");
  return { subject, body: `Hola {{nombre}}.\n\nEsto es lo que encontró el radar hoy:\n\n${cuerpo}\n\nJean` };
}
