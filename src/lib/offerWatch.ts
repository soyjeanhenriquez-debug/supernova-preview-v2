// Vigilancia de ofertas seguidas: lo que devuelve get_offer_watch() y cómo se cuenta al
// usuario. Las alertas las calcula el servidor (detect_offer_events); aquí solo se
// traducen a frases cortas, sin promesas.

export type WatchEventKind = "escala" | "baja" | "se_apaga" | "vuelve" | "precio" | "upsell" | "bump";

export interface WatchEvent {
  kind: WatchEventKind;
  on: string; // YYYY-MM-DD
  detail: Record<string, unknown>;
}

export interface WatchPoint { d: string; n: number }

export interface OfferWatch {
  offer_id: string;
  checked_on: string | null;
  live_active_ads: number | null;
  live_capped: boolean;
  history: WatchPoint[];
  events: WatchEvent[];
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function money(v: unknown, cur: unknown): string {
  const n = num(v);
  if (n == null) return "—";
  const c = typeof cur === "string" && cur ? ` ${cur}` : "";
  return `${n.toLocaleString("es", { maximumFractionDigits: 2 })}${c}`;
}

/** Tono: "good" = señal de que le funciona, "bad" = señal de que no, "info" = cambio neutro. */
export function describeEvent(e: WatchEvent): { text: string; tone: "good" | "bad" | "info" } {
  const d = e.detail ?? {};
  switch (e.kind) {
    case "escala":
      return { tone: "good", text: `Escala: pasó de ${num(d.antes) ?? "?"} a ${num(d.ahora) ?? "?"} anuncios activos` };
    case "baja":
      return { tone: "bad", text: `Baja: pasó de ${num(d.antes) ?? "?"} a ${num(d.ahora) ?? "?"} anuncios activos` };
    case "se_apaga":
      return { tone: "bad", text: `Se apagó: tenía ${num(d.antes) ?? "?"} anuncios activos y hoy no tiene ninguno` };
    case "vuelve":
      return { tone: "good", text: `Volvió a anunciar: ${num(d.ahora) ?? "?"} anuncios activos` };
    case "precio":
      return { tone: "info", text: `Cambió el precio: ${money(d.antes, d.moneda_antes)} → ${money(d.ahora, d.moneda)}` };
    case "upsell":
      return d.ahora === true
        ? { tone: "info", text: "Agregó un upsell (oferta extra después de pagar)" }
        : { tone: "info", text: "Quitó el upsell (oferta extra después de pagar)" };
    case "bump":
      return { tone: "info", text: `Cambió los order bumps (extras en el pago): ${num(d.antes) ?? "?"} → ${num(d.ahora) ?? "?"}` };
    default:
      return { tone: "info", text: "Cambio en la oferta" };
  }
}

export function parseWatch(rows: unknown): Map<string, OfferWatch> {
  const out = new Map<string, OfferWatch>();
  if (!Array.isArray(rows)) return out;
  for (const r of rows as Record<string, unknown>[]) {
    const id = String(r.offer_id ?? "");
    if (!id) continue;
    out.set(id, {
      offer_id: id,
      checked_on: typeof r.checked_on === "string" ? r.checked_on : null,
      live_active_ads: num(r.live_active_ads),
      live_capped: r.live_capped === true,
      history: Array.isArray(r.history)
        ? (r.history as Record<string, unknown>[])
            .filter((p) => typeof p.d === "string" && num(p.n) != null)
            .map((p) => ({ d: String(p.d), n: Number(p.n) }))
        : [],
      events: Array.isArray(r.events) ? (r.events as WatchEvent[]).filter((e) => e && typeof e.kind === "string") : [],
    });
  }
  return out;
}

/** "hoy", "ayer", "hace 3 días", a partir de YYYY-MM-DD (fecha UTC del servidor). */
export function daysAgo(ymd: string, now = new Date()): string {
  const t = Date.parse(`${ymd}T00:00:00Z`);
  if (!Number.isFinite(t)) return "";
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const n = Math.round((today - t) / 86_400_000);
  if (n <= 0) return "hoy";
  if (n === 1) return "ayer";
  return `hace ${n} días`;
}
