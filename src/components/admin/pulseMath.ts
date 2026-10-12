/**
 * Cuentas del "Pulso del negocio" (Admin → Resumen): ventas del mes, créditos vendidos frente a
 * gastados, costo de la IA y margen. Lógica pura (sin Supabase) para poder probarla.
 *
 * De dónde sale cada número:
 * - Suscripciones: admin_business_report → mrr_usd (activas o con pago atrasado, a precio de lista).
 *   Whop todavía no manda eventos de pago, así que es un ESTIMADO, no lo cobrado de verdad.
 * - Packs: filas de credit_transactions con action = 'recharge' y etiqueta "Recarga … (Whop)" (las
 *   pone whop-webhook). Las recargas internas de prueba ("no es venta") no cuentan.
 * - Otras ventas de Whop: whop_product_sales (productos que no dan acceso a SUPERNOVA).
 * - Costo de IA: admin_ai_costs (ai_usage) desde el día 1 del mes.
 */

// La página "Prueba 9 de 10" la crea otro agente (R2-10). El enlace (menú y Resumen) solo aparece
// cuando su archivo existe; la ruta en App.tsx debe ser esta.
export const PRUEBA_9_DE_10_PATH = "/admin/prueba-9-de-10";
export const HAS_PRUEBA_9_DE_10 = Object.keys(import.meta.glob("/src/pages/admin/AdminPrueba9de10.tsx")).length > 0;

/** Crédito más barato que vendemos (Pack 250 con cashback): base de la regla ×5 del manual. */
export const CREDIT_FLOOR_USD = 0.008;
/** Créditos que trae cada mes un plan PRO o Comunidad (src/lib/plans.ts). */
export const PLAN_MONTHLY_CREDITS = 2000;

/** Packs de Whop: el nombre es el que escribe whop-webhook en la etiqueta ("Recarga <name> (Whop)").
 *  Precios de src/pages/CreditsPage.tsx. media = saldo aparte de video con avatar. */
export const PACKS: { re: RegExp; name: string; usd: number; credits: number; media?: boolean }[] = [
  { re: /boost\s*500/i, name: "Boost 500", usd: 10, credits: 500 },
  { re: /power\s*2[.,]?000/i, name: "Power 2.000", usd: 20, credits: 2000 },
  { re: /nuclear\s*4[.,]?500/i, name: "Nuclear 4.500", usd: 39, credits: 4500 },
  { re: /pack\s*100\b/i, name: "Pack 100", usd: 100, credits: 12000 },
  { re: /pack\s*250\b/i, name: "Pack 250", usd: 250, credits: 30000 },
  { re: /media\s*starter/i, name: "Media inicial", usd: 10, credits: 50, media: true },
  { re: /media\s*pro/i, name: "Media mediano", usd: 29.99, credits: 150, media: true },
  { re: /media\s*scale/i, name: "Media grande", usd: 69.99, credits: 400, media: true },
];

/** Un pack vendido por Whop a partir de la etiqueta de su recarga. null si no es una venta. */
export function packFromLabel(label: string | null | undefined) {
  const l = String(label ?? "");
  if (!/^recarga/i.test(l) || !/\(whop\)/i.test(l)) return null;
  return PACKS.find((p) => p.re.test(l)) ?? null;
}

export type Tx = {
  user_id: string | null;
  action: string | null;
  cost: number | null;
  label: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
};
export type OtherSale = { amount: number | null; event: string | null; status: string | null };

export type PulseInput = {
  /** Transacciones de crédito del mes (todas). */
  txs: Tx[];
  /** user_id de los admins: su uso no es de clientes. */
  adminIds: Set<string>;
  /** Ingreso mensual estimado de suscripciones (admin_business_report.mrr_usd). */
  subsUsd: number;
  /** Suscripciones que pagan (PRO + Comunidad): cada una recibe 2.000 créditos al mes. */
  payingSubs: number;
  otherSales: OtherSale[];
  /** Costo de IA del mes (admin_ai_costs.total_usd) y la parte sin usuario (catálogo, crons). */
  aiTotalUsd: number;
  aiBackgroundUsd: number;
};

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const isTrue = (v: unknown) => v === true || v === "true";

export function summarizePulse(i: PulseInput) {
  const packs: { name: string; usd: number; credits: number; media: boolean }[] = [];
  let spentClients = 0, spentAdmin = 0, chargesClients = 0, testerFree = 0, testerUses = 0;

  for (const t of i.txs) {
    const cost = n(t.cost);
    if (t.action === "recharge") {
      const p = packFromLabel(t.label);
      if (p) packs.push({ name: p.name, usd: p.usd, credits: n(t.meta?.granted) || p.credits, media: !!p.media });
      continue;
    }
    if (cost > 0) {
      if (isTrue(t.meta?.refunded)) continue; // se devolvió: no es gasto
      if (t.user_id && i.adminIds.has(t.user_id)) spentAdmin += cost;
      else { spentClients += cost; chargesClients++; }
    } else if (cost === 0 && isTrue(t.meta?.tester_free)) {
      testerUses++;
      testerFree += n(t.meta?.list_cost);
    }
  }

  const packsUsd = packs.reduce((s, p) => s + p.usd, 0);
  const otherUsd = i.otherSales
    .filter((s) => !/refund|reembols|fail|chargeback|dispute/i.test(`${s.event ?? ""} ${s.status ?? ""}`))
    .reduce((s, x) => s + n(x.amount), 0);
  const salesUsd = i.subsUsd + packsUsd + otherUsd;

  const soldPlans = i.payingSubs * PLAN_MONTHLY_CREDITS;
  const soldPacks = packs.filter((p) => !p.media).reduce((s, p) => s + p.credits, 0);
  const sold = soldPlans + soldPacks;

  const aiUsersUsd = Math.max(0, i.aiTotalUsd - i.aiBackgroundUsd);
  const marginUsd = salesUsd - i.aiTotalUsd;
  // Lo que valen, al crédito más barato, los créditos que gastaron los clientes, frente a lo que
  // costó su IA: la regla del manual dice ≥ 5×.
  const spentValueUsd = spentClients * CREDIT_FLOOR_USD;

  return {
    sales: { subsUsd: i.subsUsd, packsUsd, otherUsd, totalUsd: salesUsd, packs },
    credits: {
      soldPlans, soldPacks, sold,
      spentClients, spentAdmin, chargesClients,
      testerFree, testerUses,
      usedPct: sold > 0 ? Math.round((spentClients / sold) * 100) : null,
    },
    ai: { totalUsd: i.aiTotalUsd, backgroundUsd: i.aiBackgroundUsd, usersUsd: aiUsersUsd },
    margin: {
      usd: marginUsd,
      pct: salesUsd > 0 ? Math.round((marginUsd / salesUsd) * 100) : null,
      spentValueUsd,
    },
  };
}

export type Pulse = ReturnType<typeof summarizePulse>;

/** Inicio del mes en la hora local del navegador (RD), en ISO. */
export function monthStart(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

/** Días que pedir a las RPC que trabajan "últimos N días" para cubrir desde el día 1. */
export function daysSinceMonthStart(now = new Date()) {
  return Math.max(1, now.getDate());
}

/** Miles con punto y decimales con coma, también en 4 cifras (es-ES escribe "2000" sin punto). */
const group = (int: string) => int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
export const fmtInt = (v: number) => {
  const r = Math.round(v);
  return (r < 0 ? "-" : "") + group(String(Math.abs(r)));
};
export const fmtUsd = (v: number) => {
  const [int, dec] = Math.abs(v).toFixed(2).split(".");
  return `${v < 0 ? "-" : ""}US$${group(int)},${dec}`;
};
