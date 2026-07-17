// SUPERNOVA — Winner Detection Engine
// Detects real winning ads using behavioral signals: days active, scaling (duplicates), volume.

export interface FBAd {
  id: string;
  page_id?: string;
  page_name?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string | null;
  impressions?: { lower_bound?: string; upper_bound?: string };
  publisher_platforms?: string[];
}

export interface WinnerSignal {
  type: string;
  label: string;
  weight: number;
  positive: boolean;
}

export interface WinnerAd {
  ad: FBAd;
  winnerScore: number;
  daysActive: number;
  duplicateCount: number;
  isConfirmedWinner: boolean;
  signals: WinnerSignal[];
  offerType: string;
  cloneability: "high" | "medium" | "low";
  tier: "mega" | "rising" | "solid" | "skip";
  tierLabel: string;
  tierColor: string;
  tierIcon: string;
}

// ============================================================
// PASO 1: AGRUPAR POR ANUNCIANTE
// ============================================================
export function groupAdsByAdvertiser(ads: FBAd[]): Map<string, FBAd[]> {
  const groups = new Map<string, FBAd[]>();
  ads.forEach((ad) => {
    const key = ad.page_id || ad.page_name || "unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ad);
  });
  return groups;
}

// ============================================================
// PASO 2: SIMILITUD DE COPY (Jaccard)
// ============================================================
function calculateCopySimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) return 0;
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter((w) => w.length > 4));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter((w) => w.length > 4));
  if (words1.size === 0 || words2.size === 0) return 0;
  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  return intersection.size / union.size;
}

export function detectDuplicates(ads: FBAd[]): Map<string, number> {
  const duplicateCounts = new Map<string, number>();
  const groups = groupAdsByAdvertiser(ads);

  groups.forEach((advertiserAds) => {
    if (advertiserAds.length < 2) {
      advertiserAds.forEach((ad) => duplicateCounts.set(ad.id, 1));
      return;
    }
    advertiserAds.forEach((ad, i) => {
      const adText = ad.ad_creative_bodies?.[0] || "";
      let similarCount = 1;
      advertiserAds.forEach((otherAd, j) => {
        if (i === j) return;
        const otherText = otherAd.ad_creative_bodies?.[0] || "";
        const similarity = calculateCopySimilarity(adText, otherText);
        if (similarity > 0.3) similarCount++;
      });
      duplicateCounts.set(ad.id, similarCount);
    });
  });
  return duplicateCounts;
}

// ============================================================
// PASO 3: WINNER SCORE
// ============================================================
export function calculateWinnerScore(ad: FBAd, duplicateCount: number) {
  const signals: WinnerSignal[] = [];
  let score = 0;

  // Días activo
  const startDate = ad.ad_delivery_start_time ? new Date(ad.ad_delivery_start_time) : new Date();
  const daysActive = Math.max(0, Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

  let daysScore = 0;
  if (daysActive >= 90) daysScore = 35;
  else if (daysActive >= 60) daysScore = 30;
  else if (daysActive >= 30) daysScore = 24;
  else if (daysActive >= 14) daysScore = 16;
  else if (daysActive >= 7) daysScore = 10;
  else if (daysActive >= 3) daysScore = 5;
  else daysScore = 1;
  score += daysScore;
  signals.push({
    type: "days_active",
    label: daysActive >= 30 ? `🔥 ${daysActive} días activo` : daysActive >= 7 ? `✅ ${daysActive} días activo` : `⚠️ ${daysActive} días activo`,
    weight: daysScore,
    positive: daysActive >= 7,
  });

  // Repeticiones
  let dupScore = 0;
  if (duplicateCount >= 10) dupScore = 30;
  else if (duplicateCount >= 7) dupScore = 25;
  else if (duplicateCount >= 5) dupScore = 20;
  else if (duplicateCount >= 3) dupScore = 14;
  else if (duplicateCount >= 2) dupScore = 7;
  else dupScore = 2;
  score += dupScore;
  signals.push({
    type: "duplicates",
    label: duplicateCount >= 5 ? `🚀 ${duplicateCount} versiones escalando` : duplicateCount >= 3 ? `📈 ${duplicateCount} versiones activas` : `📊 ${duplicateCount} versión`,
    weight: dupScore,
    positive: duplicateCount >= 3,
  });

  // Impresiones
  const impLower = parseInt(ad.impressions?.lower_bound || "0");
  let impScore = 0;
  if (impLower >= 10000000) impScore = 20;
  else if (impLower >= 5000000) impScore = 17;
  else if (impLower >= 1000000) impScore = 14;
  else if (impLower >= 500000) impScore = 10;
  else if (impLower >= 100000) impScore = 6;
  else if (impLower >= 10000) impScore = 3;
  else impScore = 1;
  score += impScore;
  if (impLower > 0) {
    signals.push({
      type: "impressions",
      label: impLower >= 1000000 ? `👁️ ${(impLower / 1000000).toFixed(1)}M+ impresiones` : `👁️ ${(impLower / 1000).toFixed(0)}K+ impresiones`,
      weight: impScore,
      positive: impLower >= 100000,
    });
  }

  // Multi-plataforma
  const platforms = ad.publisher_platforms || [];
  const platformScore = platforms.length >= 2 ? 10 : platforms.length === 1 ? 5 : 0;
  score += platformScore;
  if (platforms.length > 0) {
    signals.push({
      type: "platforms",
      label: platforms.includes("facebook") && platforms.includes("instagram") ? "📱 FB + Instagram" : `📱 ${platforms[0]}`,
      weight: platformScore,
      positive: platforms.length >= 2,
    });
  }

  // Copy quality
  const bodyText = ad.ad_creative_bodies?.[0] || "";
  const copyScore = bodyText.length > 500 ? 5 : bodyText.length > 200 ? 3 : bodyText.length > 50 ? 1 : 0;
  score += copyScore;

  // Bonus sin fecha de fin
  if (!ad.ad_delivery_stop_time) {
    score += 2;
    signals.push({ type: "no_end_date", label: "♾️ Sin fecha de fin", weight: 2, positive: true });
  }

  const normalizedScore = Math.min(100, Math.round(score * 1.1));
  return { score: normalizedScore, signals, daysActive };
}

// ============================================================
// PASO 4: CLASIFICAR TIER
// ============================================================
export function classifyAd(score: number, daysActive: number, duplicates: number) {
  const isConfirmedWinner = daysActive >= 7 && duplicates >= 3 && score >= 50;
  const tier: "mega" | "rising" | "solid" | "skip" =
    score >= 80 ? "mega" : score >= 60 ? "rising" : score >= 40 ? "solid" : "skip";
  const tierConfig = {
    mega: { tierLabel: "MEGA WINNER", tierColor: "#F59E0B", tierIcon: "🏆" },
    rising: { tierLabel: "RISING STAR", tierColor: "#3B82F6", tierIcon: "📈" },
    solid: { tierLabel: "SOLID", tierColor: "#10B981", tierIcon: "✅" },
    skip: { tierLabel: "SKIP", tierColor: "#6B7280", tierIcon: "⚫" },
  };
  const cloneability: "high" | "medium" | "low" =
    tier === "mega" || tier === "rising" ? "high" : tier === "solid" ? "medium" : "low";
  return { tier, ...tierConfig[tier], isConfirmedWinner, cloneability };
}

function detectOfferType(text: string): string {
  const t = text.toLowerCase();
  if (/shipping|envío|frete/.test(t)) return "ecommerce";
  if (/webinar|masterclass|curso|course|aula/.test(t)) return "lead_magnet";
  if (/ebook|pdf|guía|guide|download|descarga/.test(t)) return "lead_magnet";
  if (/app|software|herramienta|tool|plataforma/.test(t)) return "saas";
  if (/coaching|consultoría|consulting|servicio|service/.test(t)) return "service";
  if (/secreto|secret|método|method|sistema|system/.test(t)) return "infoproducto";
  return "unknown";
}

// ============================================================
// PROCESAR
// ============================================================
export function processAdsIntoWinners(
  ads: FBAd[],
  filters: { minDays?: number; minDuplicates?: number; onlyConfirmed?: boolean } = {},
): WinnerAd[] {
  const { minDays = 7, minDuplicates = 3, onlyConfirmed = false } = filters;
  const duplicateCounts = detectDuplicates(ads);

  const processed: WinnerAd[] = ads.map((ad) => {
    const duplicateCount = duplicateCounts.get(ad.id) || 1;
    const { score, signals, daysActive } = calculateWinnerScore(ad, duplicateCount);
    const classification = classifyAd(score, daysActive, duplicateCount);
    const adText = (ad.ad_creative_bodies?.[0] || "") + " " + (ad.ad_creative_link_titles?.[0] || "");
    const offerType = detectOfferType(adText);
    return {
      ad,
      winnerScore: score,
      daysActive,
      duplicateCount,
      isConfirmedWinner: classification.isConfirmedWinner,
      signals,
      offerType,
      cloneability: classification.cloneability,
      tier: classification.tier,
      tierLabel: classification.tierLabel,
      tierColor: classification.tierColor,
      tierIcon: classification.tierIcon,
    };
  });

  return processed
    .filter((w) => {
      if (w.tier === "skip") return false;
      if (w.daysActive < minDays) return false;
      if (w.duplicateCount < minDuplicates) return false;
      if (onlyConfirmed && !w.isConfirmedWinner) return false;
      return true;
    })
    .sort((a, b) => b.winnerScore - a.winnerScore);
}

// Map DB row -> FBAd
export function dbRowToFBAd(row: unknown): FBAd {
  return {
    id: row.id,
    page_id: row.page_id || undefined,
    page_name: row.page_name || row.advertiser || undefined,
    ad_creative_bodies: [row.ad_body || row.ad_description || ""],
    ad_creative_link_titles: [row.ad_title || ""],
    ad_delivery_start_time: row.delivery_start_time || row.scraped_at,
    ad_delivery_stop_time: row.delivery_stop_time,
    impressions: {
      lower_bound: row.impressions_lower ? String(row.impressions_lower) : "0",
      upper_bound: row.impressions_upper ? String(row.impressions_upper) : "0",
    },
    publisher_platforms: Array.isArray(row.publisher_platforms) ? row.publisher_platforms : [],
  };
}

export const OFFER_TYPE_LABEL: Record<string, string> = {
  ecommerce: "🛒 Ecommerce",
  lead_magnet: "🎯 Lead Magnet",
  saas: "💻 SaaS",
  service: "🤝 Servicio",
  infoproducto: "📚 Infoproducto",
  unknown: "❓ Otro",
};
