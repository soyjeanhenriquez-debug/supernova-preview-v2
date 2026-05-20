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
    marketReading: 'Sin validación de mercado. Nadie está escalando esto.',
    userAction: 'Ignora este anuncio.',
    moneyWindow: 'Sin señal de dinero.',
  };
  if (heatScore < 20) return {
    level: 2, fires: '🔥', label: 'TESTING',
    color: '#6B7280', glowColor: 'rgba(107,114,128,0.15)',
    isPulsing: false, isNuclear: false,
    marketReading: 'Alguien lo está probando. Aún no hay señal de dinero real.',
    userAction: 'Ponlo en watchlist. Vuelve en 7 días.',
    moneyWindow: 'Demasiado pronto para saber.',
  };
  if (heatScore < 60) return {
    level: 3, fires: '🔥🔥', label: 'CALENTANDO',
    color: '#F59E0B', glowColor: 'rgba(245,158,11,0.2)',
    isPulsing: false, isNuclear: false,
    marketReading: 'El anunciante está viendo retorno. Empieza a escalar.',
    userAction: 'Analiza el mecanismo. Prepara tu versión.',
    moneyWindow: 'Tienes 2-3 semanas antes de saturación.',
  };
  if (heatScore < 150) return {
    level: 4, fires: '🔥🔥🔥', label: 'HOT',
    color: '#F97316', glowColor: 'rgba(249,115,22,0.25)',
    isPulsing: false, isNuclear: false,
    marketReading: 'Dinero real fluyendo. El mercado está comprando.',
    userAction: 'SOFISTÍCALO ahora. La ventana está abierta.',
    moneyWindow: 'Esta semana puedes lanzar tu versión.',
  };
  if (heatScore < 400) return {
    level: 5, fires: '🔥🔥🔥🔥', label: 'ON FIRE',
    color: '#EF4444', glowColor: 'rgba(239,68,68,0.3)',
    isPulsing: true, isNuclear: false,
    marketReading: 'Escala masiva. El ángulo está siendo validado por el mercado.',
    userAction: 'Entra con diferenciación. El ángulo funciona.',
    moneyWindow: 'El dinero está aquí AHORA.',
  };
  return {
    level: 6, fires: '🔥🔥🔥🔥🔥', label: '☢️ NUCLEAR',
    color: '#F97316', glowColor: 'rgba(249,115,22,0.5)',
    isPulsing: true, isNuclear: true,
    marketReading: 'FENÓMENO DE MERCADO. Millones fluyendo en este ángulo ahora mismo.',
    userAction: 'CLONA ESTO HOY. No mañana. HOY.',
    moneyWindow: '⚡ Máxima urgencia. Este ángulo está en llamas.',
  };
}

export function getMarketSignal(uniquePages: number, allPageNames: string[]): MarketSignal {
  if (uniquePages <= 1) return {
    type: 'solo_operator', badge: '👤 UN VENDEDOR',
    explanation: 'Una operación escalando su winner personal.',
    opportunity: 'Entra con diferenciación de producto o ángulo.',
    cloneRisk: 'medium',
  };
  const firstWords = allPageNames.map(n => (n || '').toLowerCase().split(/[\s\-_]/)[0]);
  const uniqueFirstWords = new Set(firstWords).size;
  const nameVariety = allPageNames.length ? uniqueFirstWords / allPageNames.length : 1;

  if (uniquePages <= 3 || nameVariety < 0.5) return {
    type: 'multi_account', badge: '⚡ MULTI-CUENTA',
    explanation: 'Un vendedor profesional escalando con múltiples páginas.',
    opportunity: 'Este vendedor sabe lo que hace. Estudia su ángulo.',
    cloneRisk: 'medium',
  };
  if (uniquePages <= 6 || nameVariety < 0.8) return {
    type: 'multi_seller', badge: '🌍 MULTI-VENDEDOR',
    explanation: 'Diferentes vendedores encontraron que este ángulo convierte.',
    opportunity: 'El ÁNGULO está probado. El riesgo de clonar es mínimo.',
    cloneRisk: 'low',
  };
  return {
    type: 'market_phenomenon', badge: '☢️ FENÓMENO DE MERCADO',
    explanation: 'El mercado entero está validando este ángulo. No es un vendedor — es una tendencia.',
    opportunity: '⚡ MÁXIMA OPORTUNIDAD — Cualquiera que entre con este ángulo convierte.',
    cloneRisk: 'low',
  };
}

export function getVelocityWindow(duplicates: number, daysActive: number) {
  const velocity = duplicates / Math.max(1, daysActive);
  if (velocity >= 5) return { ratio: velocity, label: '🚀 EXPLOSIVO', urgency: 'critical' as const, timeToAct: 'Actúa HOY — está explotando ahora mismo' };
  if (velocity >= 2) return { ratio: velocity, label: '⚡ ESCALANDO', urgency: 'high' as const, timeToAct: 'Esta semana es tu ventana' };
  if (velocity >= 0.5) return { ratio: velocity, label: '📈 CRECIENDO', urgency: 'medium' as const, timeToAct: 'Tienes este mes para prepararte' };
  if (velocity >= 0.1) return { ratio: velocity, label: '➡️ ESTABLE', urgency: 'low' as const, timeToAct: 'Evergreen — funciona cuando quieras entrar' };
  return { ratio: velocity, label: '📉 MADURO', urgency: 'low' as const, timeToAct: 'El peak ya pasó — úsalo con cautela' };
}

export function temperatureFromLevel(level: TemperatureLevel): Pick<Temperature, 'fires' | 'label' | 'color'> {
  const map: Record<TemperatureLevel, Pick<Temperature, 'fires' | 'label' | 'color'>> = {
    1: { fires: '🩶', label: 'FRÍO', color: '#374151' },
    2: { fires: '🔥', label: 'TESTING', color: '#6B7280' },
    3: { fires: '🔥🔥', label: 'CALENTANDO', color: '#F59E0B' },
    4: { fires: '🔥🔥🔥', label: 'HOT', color: '#F97316' },
    5: { fires: '🔥🔥🔥🔥', label: 'ON FIRE', color: '#EF4444' },
    6: { fires: '🔥🔥🔥🔥🔥', label: '☢️ NUCLEAR', color: '#F97316' },
  };
  return map[level];
}
