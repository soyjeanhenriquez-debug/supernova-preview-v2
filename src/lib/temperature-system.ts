// SUPERNOVA Temperature System
// Mide qué tan caliente está una oferta en el mercado AHORA MISMO
// Independiente del score matemático existente

export type TemperatureLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface Temperature {
  level: TemperatureLevel;
  fires: string;
  label: string;
  color: string;
  glowColor: string;
  isPulsing: boolean;
  marketReading: string;
  userAction: string;
  moneyWindow: string;
  isNuclear: boolean;
}

export interface MarketSignal {
  type: 'solo_operator' | 'multi_account' | 'multi_seller' | 'market_phenomenon';
  badge: string;
  explanation: string;
  opportunity: string;
  cloneRisk: 'low' | 'medium' | 'high';
}

export function calculateTemperature(
  duplicates: number,
  uniquePages: number,
  daysActive: number,
  _allPageNames: string[]
): Temperature {
  const days = Math.max(1, daysActive);
  const velocity = duplicates / days;

  const pageMultiplier =
    uniquePages >= 10 ? 4.0 :
    uniquePages >= 7  ? 3.5 :
    uniquePages >= 5  ? 3.0 :
    uniquePages >= 3  ? 2.0 :
    uniquePages >= 2  ? 1.5 : 1.0;

  const heatScore = (duplicates * pageMultiplier) + (velocity * 10);

  if (heatScore < 5) return {
    level: 1, fires: '🩶', label: 'FRÍO',
    color: '#374151', glowColor: 'rgba(55,65,81,0)',
    isPulsing: false, isNuclear: false,
    marketReading: 'Nadie lo está copiando ni le está metiendo más dinero todavía.',
    userAction: 'Ignora este anuncio.',
    moneyWindow: 'Sin señal de dinero.',
  };
  if (heatScore < 20) return {
    level: 2, fires: '🔥', label: 'EN PRUEBA',
    color: '#6B7280', glowColor: 'rgba(107,114,128,0.15)',
    isPulsing: false, isNuclear: false,
    marketReading: 'Alguien lo está probando. Aún no hay señal de dinero real.',
    userAction: 'Guárdalo con la estrella y vuelve en 7 días.',
    moneyWindow: 'Demasiado pronto para saber.',
  };
  if (heatScore < 60) return {
    level: 3, fires: '🔥🔥', label: 'CALENTANDO',
    color: '#F59E0B', glowColor: 'rgba(245,158,11,0.2)',
    isPulsing: false, isNuclear: false,
    marketReading: 'Al anunciante le está funcionando: empieza a meterle más dinero.',
    userAction: 'Mira cómo lo vende. Prepara tu versión.',
    moneyWindow: 'Buen momento para preparar tu versión.',
  };
  if (heatScore < 150) return {
    level: 4, fires: '🔥🔥🔥', label: 'CALIENTE',
    color: '#F97316', glowColor: 'rgba(249,115,22,0.25)',
    isPulsing: false, isNuclear: false,
    marketReading: 'Lo sigue pagando con varias copias: señal de que le funciona.',
    userAction: 'Modélalo con tu propia mejora: tu idioma, tu país, tu entrega.',
    moneyWindow: 'Puedes armar tu versión esta semana.',
  };
  if (heatScore < 400) return {
    level: 5, fires: '🔥🔥🔥🔥', label: 'EN LLAMAS',
    color: '#EF4444', glowColor: 'rgba(239,68,68,0.3)',
    isPulsing: true, isNuclear: false,
    marketReading: 'Le meten mucho dinero: el mercado ya confirmó que esta idea vende.',
    userAction: 'La idea funciona: haz tu versión con algo propio.',
    moneyWindow: 'Una de las ideas más probadas del radar.',
  };
  return {
    level: 6, fires: '🔥🔥🔥🔥🔥', label: '☢️ AL ROJO VIVO',
    color: '#F97316', glowColor: 'rgba(249,115,22,0.5)',
    isPulsing: true, isNuclear: true,
    marketReading: 'Muchísimas copias y muchos días pagando: de las pruebas de venta más fuertes del radar.',
    userAction: 'Modela esta idea: lo mismo que vende, en tu versión en español.',
    moneyWindow: 'Prioridad alta para estudiar y modelar.',
  };
}

export function getMarketSignal(uniquePages: number, allPageNames: string[]): MarketSignal {
  if (uniquePages <= 1) return {
    type: 'solo_operator', badge: '👤 UN VENDEDOR',
    explanation: 'Un solo vendedor haciendo crecer su anuncio ganador.',
    opportunity: 'Entra con un producto o un enfoque distinto al suyo.',
    cloneRisk: 'medium',
  };
  const firstWords = allPageNames.map(n => (n || '').toLowerCase().split(/[\s\-_]/)[0]);
  const uniqueFirstWords = new Set(firstWords).size;
  const nameVariety = allPageNames.length ? uniqueFirstWords / allPageNames.length : 1;

  if (uniquePages <= 3 || nameVariety < 0.5) return {
    type: 'multi_account', badge: '⚡ VARIAS PÁGINAS',
    explanation: 'Un vendedor con experiencia que anuncia desde varias páginas.',
    opportunity: 'Este vendedor sabe lo que hace. Estudia cómo lo vende.',
    cloneRisk: 'medium',
  };
  if (uniquePages <= 6 || nameVariety < 0.8) return {
    type: 'multi_seller', badge: '🌍 VARIOS VENDEDORES',
    explanation: 'Varios vendedores distintos ya comprobaron que esta idea vende.',
    opportunity: 'La idea ya la probaron varios vendedores: modelarla es más seguro.',
    cloneRisk: 'low',
  };
  return {
    type: 'market_phenomenon', badge: '☢️ FENÓMENO DE MERCADO',
    explanation: 'Muchos vendedores distintos pagan por esta idea. No es uno solo: es una tendencia.',
    opportunity: '⚡ Oportunidad alta: muchos ya venden con esta idea. Haz tu versión.',
    cloneRisk: 'low',
  };
}

export function getVelocityWindow(duplicates: number, daysActive: number) {
  const velocity = duplicates / Math.max(1, daysActive);
  if (velocity >= 5) return { ratio: velocity, label: '🚀 EXPLOSIVO', urgency: 'critical' as const, timeToAct: 'Muévete hoy: está creciendo ahora mismo' };
  if (velocity >= 2) return { ratio: velocity, label: '⚡ ESCALANDO', urgency: 'high' as const, timeToAct: 'Esta semana es tu ventana' };
  if (velocity >= 0.5) return { ratio: velocity, label: '📈 CRECIENDO', urgency: 'medium' as const, timeToAct: 'Tienes este mes para prepararte' };
  if (velocity >= 0.1) return { ratio: velocity, label: '➡️ ESTABLE', urgency: 'low' as const, timeToAct: 'Sigue vigente: puedes entrar cuando quieras' };
  return { ratio: velocity, label: '📉 MADURO', urgency: 'low' as const, timeToAct: 'Lo mejor ya pasó: úsalo con cuidado' };
}

export function temperatureFromLevel(level: TemperatureLevel): Pick<Temperature, 'fires' | 'label' | 'color'> {
  const map: Record<TemperatureLevel, Pick<Temperature, 'fires' | 'label' | 'color'>> = {
    1: { fires: '🩶', label: 'FRÍO', color: '#374151' },
    2: { fires: '🔥', label: 'EN PRUEBA', color: '#6B7280' },
    3: { fires: '🔥🔥', label: 'CALENTANDO', color: '#F59E0B' },
    4: { fires: '🔥🔥🔥', label: 'CALIENTE', color: '#F97316' },
    5: { fires: '🔥🔥🔥🔥', label: 'EN LLAMAS', color: '#EF4444' },
    6: { fires: '🔥🔥🔥🔥🔥', label: '☢️ AL ROJO VIVO', color: '#F97316' },
  };
  return map[level];
}
