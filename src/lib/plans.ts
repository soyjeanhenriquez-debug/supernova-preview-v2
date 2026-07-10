/** Escalera de planes SUPERNOVA — checkouts externos (Whop / Skool). */
export const PLANS = {
  pro: {
    name: "SUPERNOVA PRO",
    price: 29,
    period: "/mes",
    checkout: "https://whop.com/checkout/plan_aOgrR07rPdFgp",
    tagline: "El radar completo",
    features: ["Radar de ofertas 24/7", "Tiers MEGA · RISING · SOLID", "2000 créditos/mes", "Generadores de copy"],
  },
  proMax: {
    name: "SUPERNOVA PRO MAX",
    price: 39,
    period: "/mes",
    checkout: "https://whop.com/checkout/plan_VsWbrtokeQOLu",
    tagline: "Radar + arsenal completo",
    features: ["Todo lo de PRO", "Oráculo ilimitado", "Funnels y VSL completos", "Soporte prioritario"],
  },
  comunidad: {
    name: "COMUNIDAD CREATIVOS 10X",
    price: 99,
    period: "/mes",
    checkout: "https://www.skool.com/creativos-10x-6085",
    tagline: "Software + mentoría en vivo",
    features: ["Todo lo de PRO MAX", "Comunidad privada en Skool", "Llamadas y revisiones en vivo"],
  },
} as const;

export type PlanKey = keyof typeof PLANS;

/** Whop permite prellenar el email del comprador vía query param. */
export function checkoutUrl(plan: PlanKey, email?: string) {
  const base = PLANS[plan].checkout;
  if (!email || !base.includes("whop.com")) return base;
  return `${base}?email=${encodeURIComponent(email)}`;
}
