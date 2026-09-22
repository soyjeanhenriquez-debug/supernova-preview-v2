/** Escalera de planes SUPERNOVA — checkouts externos (Whop / Skool). */
export const PLANS = {
  pro: {
    name: "SUPERNOVA PRO",
    price: 29.99,
    period: "/mes",
    checkout: "https://whop.com/checkout/plan_ukBjctlEKufto",
    tagline: "El radar completo",
    features: ["Radar de ofertas 24/7", "Tiers MEGA · RISING · SOLID", "2000 créditos/mes", "Generadores de copy"],
  },
  proMax: {
    name: "SUPERNOVA PRO MAX",
    price: 39.99,
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

/**
 * Separa "Todo lo de PRO" (lo que el plan hereda) de lo que añade. Feedback del primer
 * usuario real: en los planes 2 y 3 quiere ver primero, resaltado, que incluye el plan
 * anterior, y después solo lo nuevo — no una lista plana donde todo pesa igual.
 */
export function planFeatureParts(plan: PlanKey): { inherits: string | null; extras: string[] } {
  const f = PLANS[plan].features as readonly string[];
  if (f.length && /^todo lo de/i.test(f[0])) return { inherits: f[0], extras: f.slice(1) };
  return { inherits: null, extras: [...f] };
}

// Cupón de fundador: vive en Whop (plan STARTER solamente), primer mes a $19,99. Caduca
// con la campaña — quitar esta línea (o vaciar FOUNDER_PROMO) cuando Jean cierre el cupón.
const FOUNDER_PROMO: Partial<Record<PlanKey, string>> = { pro: "FUNDADOR" };

/**
 * Whop permite prellenar el checkout por URL: el correo del comprador y el código
 * promocional. Sin `promoCode` la persona ve el precio normal y tiene que encontrar
 * sola el botón "Código promocional y detalles" para escribirlo a mano — es la fricción
 * que hacía que la gente llegara al checkout y no completara (visto en producción).
 */
export function checkoutUrl(plan: PlanKey, email?: string) {
  const base = PLANS[plan].checkout;
  if (!base.includes("whop.com")) return base;
  const params = new URLSearchParams();
  if (email) params.set("email", email);
  const promo = FOUNDER_PROMO[plan];
  if (promo) params.set("promoCode", promo);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
