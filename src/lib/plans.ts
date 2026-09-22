/**
 * Planes SUPERNOVA: solo dos (decisión de Jean, 22-sep-2026) — PRO y Comunidad. PRO MAX se
 * quitó: dos opciones claras deciden mejor que tres, y prometía un "Oráculo ilimitado" que
 * la app no tiene. Checkouts externos (Whop / Skool).
 */
export const PLANS = {
  pro: {
    name: "SUPERNOVA PRO",
    price: 29.99,
    period: "/mes",
    checkout: "https://whop.com/checkout/plan_ukBjctlEKufto",
    tagline: "Todo el software, para vender tú solo",
    // Solo lo que la app hace hoy. El video con avatar va aparte (Media Credits): no se promete aquí.
    features: [
      "3 negocios ganadores elegidos para ti cada día",
      "Veredicto de venta de cada oferta: qué copiar y qué cambiar",
      "Radar de anuncios que llevan semanas pagando",
      "Generadores de copy, hooks y guiones",
      "2.000 créditos cada mes",
    ],
  },
  comunidad: {
    name: "COMUNIDAD CREATIVOS 10X",
    price: 99,
    period: "/mes",
    checkout: "https://www.skool.com/creativos-10x-6085",
    tagline: "El software + acompañamiento en vivo",
    features: ["Todo lo de PRO", "Comunidad privada en Skool", "Llamadas y revisiones en vivo"],
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

// Cupón de fundador: vive en Whop (solo plan PRO), primer mes a $19,99. Cierra el 30-sep-2026
// a medianoche de RD; pasada esa hora ni se muestra ni se añade al enlace del checkout.
const FOUNDER_ENDS = new Date("2026-10-01T00:00:00-04:00").getTime();
export const founderOfferActive = () => Date.now() < FOUNDER_ENDS;
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
  const promo = founderOfferActive() ? FOUNDER_PROMO[plan] : undefined;
  if (promo) params.set("promoCode", promo);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
