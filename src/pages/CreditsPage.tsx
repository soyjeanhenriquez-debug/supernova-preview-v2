import { useEffect, useMemo, useState } from "react";
import { useCredits, CREDIT_COSTS, ACTION_LABEL } from "@/hooks/useCredits";
import { useMediaCredits, MEDIA_COST_PER_VIDEO } from "@/hooks/useMediaCredits";
import { Zap, Coins, Sparkles, AlertTriangle, Video } from "lucide-react";
import { CountUp } from "@/components/CountUp";
import { SubscriptionCard } from "@/components/SubscriptionCard";
import { SupportCard } from "@/components/SupportCard";
import { startCheckout, consumeCheckoutResult } from "@/lib/stripe";
import { formatUsd } from "@/lib/plans";
import { useFeatureAccess } from "@/lib/features";
import { creditEquivalentsLine, VIDEO_AD_TAKES } from "@/components/CreditRing";

// Escalera de recarga (precios y créditos: decisión de Jean; aquí no se tocan números).
// `tagline` dice PARA QUIÉN es cada pack; lo que rinde en piezas se calcula con creditEquivalentsLine.
const PACKS = [
  { id: "boost",   name: "PACK BOOST",   credits: 500,  price: 10, tagline: "Si solo escribes textos: ganchos, mensajes, correos", save: null },
  { id: "power",   name: "PACK POWER",   credits: 2000, price: 20, tagline: "Otro mes entero de créditos: imágenes y anuncios cada semana", save: "50%", popular: true },
  { id: "nuclear", name: "PACK MÁXIMO", credits: 4500, price: 39, tagline: "Si ya produces video y pruebas varios anuncios por semana", save: "57%" },
  // Packs grandes con cashback (10-oct-2026): el regalo llega solo cuando ya usaste los créditos del pack
  // (credit_cashback, servidor). Con el regalo quedan en el piso de la regla de margen.
  { id: "pro100", name: "PACK 100", credits: 12000, price: 100, cashback: 500, tagline: "Para crear todas las semanas: videos, creativos y tu producto", save: "58%", big: true },
  { id: "pro250", name: "PACK 250", credits: 30000, price: 250, cashback: 1250, tagline: "Para quien ya vende y produce anuncios sin parar", save: "58%", big: true },
] as { id: string; name: string; credits: number; price: number; tagline: string; save: string | null; popular?: boolean; cashback?: number; big?: boolean }[];

// Pool separado del de texto: el costo real de video con avatar IA (HeyGen,
// ~$1 USD/min) es órdenes de magnitud mayor al de un generador de texto.
// Nombres visibles distintos de los del plan: "PRO" aquí se confundía con el plan SUPERNOVA PRO.
// (Los id y los productos de Whop no cambian.)
const MEDIA_PACKS = [
  { id: "media-starter", name: "PACK INICIAL", credits: 50,  price: 10, tagline: "Para probar: unos 5 videos", save: null },
  { id: "media-pro",     name: "PACK MEDIANO", credits: 150, price: 29.99, tagline: "Unos 15 videos: para probar varios anuncios cada semana", save: null, popular: true },
  { id: "media-scale",   name: "PACK GRANDE",  credits: 400, price: 69.99, tagline: "Unos 40 videos: para quien ya publica anuncios seguido", save: null },
];

// Nombres de cada acción en palabras simples (la lista técnica vive en useCredits y la usan otras pantallas).
const FRIENDLY_LABEL: Partial<Record<keyof typeof ACTION_LABEL, string>> = {
  search_ads: "Buscar anuncios en vivo en Meta",
  analyze_url: "Revisar una página de venta (básico)",
  chat_message: "Preguntarle algo a la IA (por mensaje)",
  adaptar: "Adaptar un anuncio a tu país",
  ai_intel: "Análisis de un anuncio con IA",
  pillar_assist: "Ayuda de la IA en un paso de tu proyecto",
  sofisticar: "Mejorar una oferta con IA",
  gen_ad_copies: "10 versiones del texto de tu anuncio",
  gen_avatar: "Retrato de tu cliente ideal",
  pain_discovery: "Descubrir qué problema quiere resolver tu cliente",
  blueprint: "Plan completo de un negocio",
  gen_landing: "Crear una página de venta",
  landing_intelligence: "Oráculo completo: analiza la página de un competidor",
  gen_funnel: "Camino de venta completo (video de venta + correos)",
  gen_master_prompt: "Mega-Prompt para replicar un negocio",
  gen_light: "Generador corto (ganchos, textos para redes, mensajes)",
  gen_medium: "Generador medio (correos, guiones, página de venta)",
  gen_heavy: "Generador largo (guion de un video de venta)",
  gen_ad_image: "Imagen para tu anuncio con IA",
  follow_offer: "Seguir una oferta para ver si crece",
  unlock_kit: "Desbloquear una Mini App (negocio listo para copiar)",
};

/** Pantalla donde se gasta cada acción: si está en pausa para el cliente (features.ts), su precio no se muestra. */
const ACTION_PAGE: Partial<Record<keyof typeof ACTION_LABEL, string>> = {
  analyze_url: "Oráculo", landing_intelligence: "Oráculo", gen_avatar: "Oráculo", gen_landing: "Oráculo",
  gen_funnel: "Oráculo", gen_ad_copies: "Oráculo", pain_discovery: "Crear",
  build_piece_std: "Crear producto", build_piece_sonnet: "Crear producto", build_piece_opus: "Crear producto",
  build_piece_fable: "Crear producto", build_piece_gpt: "Crear producto", build_piece_astra: "Crear producto",
};

export function CreditsPage() {
  const { balance, monthly, purchased, limit, renewalDate, history } = useCredits();
  const { balance: mediaBalance, loading: mediaLoading } = useMediaCredits();
  const { canSee } = useFeatureAccess();
  // Anillo: progreso del saldo mensual (los comprados se muestran aparte)
  const pct = (monthly / limit) * 100;

  const renewFormatted = renewalDate.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
  const renewDays = Math.max(0, Math.ceil((renewalDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));

  // Proyección basada en últimos 7 días
  const projection = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = history.filter((h) => new Date(h.date).getTime() > sevenDaysAgo);
    const totalSpent = recent.reduce((s, h) => s + h.cost, 0);
    const avgDaily = totalSpent / 7;
    if (avgDaily <= 0 || history.length === 0) return null;
    return { days: Math.floor(balance / avgDaily), avgDaily: Math.round(avgDaily) };
  }, [history, balance]);

  // Checkout real vía Stripe (cobro principal)
  const [buyingPack, setBuyingPack] = useState<string | null>(null);
  const handleRecharge = async (packId: string) => {
    setBuyingPack(packId);
    const redirected = await startCheckout({ action: "pack", pack_id: packId });
    if (!redirected) setBuyingPack(null);
  };

  useEffect(() => { consumeCheckoutResult(); }, []);

  const scrollToPacks = () => {
    document.getElementById("recharge-packs")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="page-heading font-display text-2xl text-foreground">MIS CRÉDITOS</h2>
        <p className="text-sm text-muted-foreground mt-3 max-w-2xl">
          Un crédito es lo que gasta la IA cada vez que te crea algo: un texto, un análisis, una imagen.
          Mirar ofertas, el radar de anuncios y los ganchos es gratis. Si la IA falla, el crédito vuelve solo.
        </p>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          Para que te hagas una idea: con los {limit.toLocaleString("de-DE")} créditos de tu plan haces {creditEquivalentsLine(limit, { withOr: true })}
          {" "}(un anuncio en video son {VIDEO_AD_TAKES} tomas de 5 segundos).
        </p>
      </div>

      {/* Suscripción self-service (Stripe portal / Whop) */}
      <SubscriptionCard />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="card-surface rounded-xl p-6 flex flex-col items-center justify-center text-center">
          <div className="relative w-44 h-44 flex items-center justify-center">
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" stroke="hsl(var(--secondary))" strokeWidth="8" fill="none" />
              <circle cx="50" cy="50" r="42" stroke="hsl(var(--primary))" strokeWidth="8" fill="none"
                strokeDasharray={`${(pct / 100) * 264} 264`} strokeLinecap="round" />
            </svg>
            <div>
              <div className="text-4xl font-display font-extrabold text-primary"><CountUp value={balance} /></div>
              <div className="text-xs text-muted-foreground">{purchased > 0 ? "disponibles" : `de ${limit.toLocaleString("de-DE")} al mes`}</div>
            </div>
          </div>
          <div className="text-sm text-foreground mt-3">Créditos disponibles</div>
          {balance > 0 && creditEquivalentsLine(balance) && (
            <div className="text-[11px] text-muted-foreground mt-1 max-w-[240px]">Te rinden para {creditEquivalentsLine(balance)}</div>
          )}
          <div className="text-xs text-primary mt-1">
            Los del plan se renuevan {renewDays === 0 ? "hoy" : renewDays === 1 ? "mañana" : `en ${renewDays} días`} ({renewFormatted})
          </div>
          {purchased > 0 && (
            <div className="text-[11px] text-muted-foreground mt-1">
              {monthly.toLocaleString("de-DE")} de tu plan + <span className="text-success font-semibold">{purchased.toLocaleString("de-DE")} comprados</span>
              <div>Se usan primero los de tu plan; los comprados no caducan.</div>
            </div>
          )}

          {/* Proyección de consumo */}
          <ProjectionBadge projection={projection} onRecharge={scrollToPacks} />
        </div>

        <div className="card-surface rounded-xl p-6 lg:col-span-2">
          <h3 className="font-display font-bold text-base mb-3">Cuántos créditos gasta cada cosa</h3>
          <div className="grid sm:grid-cols-2 gap-2">
            {Object.entries(CREDIT_COSTS).filter(([action, cost]) => {
              // gen_media vale lo que diga el catálogo de cada modelo (no 0) y el asistente es gratis:
              // mostrarlos aquí confundía (prueba de Hany, 11-oct-2026).
              if (cost === 0 || action === "chat_message") return false;
              const page = ACTION_PAGE[action as keyof typeof ACTION_LABEL];
              return !page || canSee(page);
            }).map(([action, cost]) => (
              <div key={action} className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/40">
                <span className="text-sm text-foreground">{FRIENDLY_LABEL[action as keyof typeof ACTION_LABEL] ?? ACTION_LABEL[action as keyof typeof ACTION_LABEL]}</span>
                <span className="flex items-center gap-1 text-primary font-bold text-sm">
                  <Zap className="w-3.5 h-3.5" /> {cost}
                </span>
              </div>
            ))}
            {/* Lo que la gente compra de verdad: un anuncio en video son 3 tomas (12-oct-2026). */}
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/40">
              <span className="text-sm text-foreground">Anuncio en video ({VIDEO_AD_TAKES} tomas de 5 segundos)</span>
              <span className="flex items-center gap-1 text-primary font-bold text-sm">
                <Zap className="w-3.5 h-3.5" /> {CREDIT_COSTS.vid_mini_5 * VIDEO_AD_TAKES}
              </span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/40">
              <span className="text-sm text-foreground">Guardar un anuncio</span>
              <span className="text-success font-bold text-xs">GRATIS</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/40">
              <span className="text-sm text-foreground">Preguntarle al asistente qué herramienta usar</span>
              <span className="text-success font-bold text-xs">GRATIS</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/40">
              <span className="text-sm text-foreground">Mirar ofertas, el radar y los ganchos</span>
              <span className="text-success font-bold text-xs">GRATIS</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recarga */}
      <div id="recharge-packs">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="font-display font-bold text-lg">RECARGA TUS CRÉDITOS</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-5 max-w-xl">
          Tu plan trae {limit.toLocaleString("de-DE")} créditos cada mes. Si se te acaban antes de que se renueven, compras un paquete y sigues:
          lo que compras no caduca y se usa después de los del plan.{canSee("Crear producto") ? " Una recarga también activa ya la escritura de tu ebook o curso, sin esperar a que termine tu prueba." : " Es opcional."}
        </p>

        <div className="grid md:grid-cols-3 gap-4">
          {PACKS.filter((p) => !p.big).map((p) => <PackCard key={p.id} pack={p} buying={buyingPack} onBuy={handleRecharge} />)}
        </div>

        <div className="mt-6 mb-3">
          <h4 className="font-display font-bold text-sm text-foreground">Para quien produce todas las semanas</h4>
          <p className="text-[12px] text-muted-foreground mt-1 max-w-xl">
            Los packs grandes traen créditos de regalo (cashback): se te acreditan solos cuando termines de usar los del pack.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {PACKS.filter((p) => p.big).map((p) => <PackCard key={p.id} pack={p} buying={buyingPack} onBuy={handleRecharge} />)}
        </div>
        <p className="text-[11px] text-muted-foreground mt-4 text-center">
          Los créditos que compras no caducan y se suman a los que ya tienes. El pago lo hace Whop; los créditos entran solos a tu cuenta al pagar.
        </p>
      </div>

      <SupportCard />

      {/* Media Credits — pool separado, para dejar clarísimo que es otra economía. En pausa para clientes (src/lib/features.ts). */}
      {canSee("Media Studio") && <div className="border-t-2 border-dashed border-border pt-8">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
          <div className="flex items-center gap-2">
            <Video className="w-4 h-4 text-primary" />
            <h3 className="font-display font-bold text-lg">MEDIA CREDITS · VIDEOS CON UNA PERSONA VIRTUAL</h3>
          </div>
          <div className="card-surface rounded-lg px-4 py-2 text-right">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Tu saldo</div>
            <div className="font-display font-bold text-lg text-primary">{mediaLoading ? "…" : mediaBalance}</div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-5 max-w-xl">
          Van aparte de tus créditos normales, porque crear un video con una persona virtual que habla (hecha con IA) cuesta mucho más.
          Cada video de ~1 minuto gasta {MEDIA_COST_PER_VIDEO} Media Credits y queda listo para subir a Facebook, Instagram o TikTok.
          No vienen incluidos en el plan ni en los 3 días gratis.
        </p>

        <div className="grid md:grid-cols-3 gap-4">
          {MEDIA_PACKS.map((p) => (
            <div key={p.id} className={`card-surface rounded-xl p-6 relative flex flex-col ${p.popular ? "border-primary shadow-[0_0_30px_hsl(var(--primary)/0.15)]" : ""}`}>
              {p.popular && (
                <span className="absolute -top-2 right-4 text-[10px] bg-primary text-primary-foreground px-2 py-0.5 rounded font-bold tracking-widest">
                  ⭐ RECOMENDADO
                </span>
              )}
              <div className="font-display font-extrabold text-lg tracking-wide">{p.name}</div>
              <div className="flex items-baseline gap-2 mt-3">
                <span className="text-3xl font-display font-bold text-primary tabular-nums">{p.credits.toLocaleString("de-DE")}</span>
                <span className="text-xs text-muted-foreground">Media Credits</span>
              </div>
              <div className="flex items-baseline gap-2 mt-3">
                <span className="text-2xl font-display font-bold text-foreground">{formatUsd(p.price)}</span>
                <span className="text-[11px] text-muted-foreground">~{Math.round(p.credits / MEDIA_COST_PER_VIDEO)} videos</span>
              </div>
              <p className="text-[13px] text-muted-foreground mt-3 leading-relaxed flex-1">{p.tagline}</p>
              <button onClick={() => handleRecharge(p.id)} disabled={buyingPack !== null} className="btn-primary-nova w-full py-2.5 rounded-lg text-sm mt-5 disabled:opacity-60">
                {buyingPack === p.id ? "Abriendo el pago…" : `Comprar por ${formatUsd(p.price)} →`}
              </button>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-4 text-center">
          Los Media Credits no caducan y no se mezclan con tus créditos normales.
        </p>
      </div>}

      {/* History */}
      <div className="card-surface rounded-xl">
        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <Coins className="w-4 h-4 text-primary" />
          <h3 className="font-display font-bold text-base">Historial reciente</h3>
        </div>
        {history.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Todavía no has usado créditos. Aquí verás cada uso.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground border-b border-border">
                <th className="px-5 py-2">Fecha</th>
                <th className="px-5 py-2">Acción</th>
                <th className="px-5 py-2 text-right">Créditos</th>
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 20).map((h, i) => (
                <tr key={i} className="border-b border-border/40">
                  <td className="px-5 py-2 text-muted-foreground text-xs">{new Date(h.date).toLocaleString("de-DE")}</td>
                  <td className="px-5 py-2">{h.label}{h.meta && <span className="text-muted-foreground"> · {h.meta.slice(0, 40)}</span>}</td>
                  {/* Recargas (granted) y reembolsos (cost negativo: "la IA falló, el crédito vuelve") suman;
                      antes un reembolso se veía como "--50". */}
                  {h.granted
                    ? <td className="px-5 py-2 text-right text-success font-bold">+{h.granted.toLocaleString("de-DE")}</td>
                    : h.cost < 0
                      ? <td className="px-5 py-2 text-right text-success font-bold">+{Math.abs(h.cost).toLocaleString("de-DE")}</td>
                      : <td className="px-5 py-2 text-right text-primary font-bold">-{h.cost.toLocaleString("de-DE")}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

type Pack = (typeof PACKS)[number];

/** Una tarjeta de pack: créditos, precio, qué te rinde en piezas y para quién es. */
function PackCard({ pack: p, buying, onBuy }: { pack: Pack; buying: string | null; onBuy: (id: string) => void }) {
  const rinde = creditEquivalentsLine(p.credits + (p.cashback ?? 0));
  return (
    <div className={`card-surface rounded-xl p-6 relative flex flex-col ${p.popular ? "border-primary shadow-[0_0_30px_hsl(var(--primary)/0.15)]" : ""}`}>
      {p.popular && (
        <span className="absolute -top-2 right-4 text-[10px] bg-primary text-primary-foreground px-2 py-0.5 rounded font-bold tracking-widest">
          ⭐ RECOMENDADO
        </span>
      )}
      <div className="font-display font-extrabold text-lg tracking-wide">{p.name}</div>
      <div className="flex items-baseline gap-2 mt-3">
        <span className="text-3xl font-display font-bold text-primary tabular-nums">{p.credits.toLocaleString("de-DE")}</span>
        <span className="text-xs text-muted-foreground">créditos</span>
        {p.cashback && <span className="text-xs text-success font-semibold">+{p.cashback.toLocaleString("de-DE")} de regalo</span>}
      </div>
      <div className="flex items-baseline gap-2 mt-3">
        <span className="text-2xl font-display font-bold text-foreground">{formatUsd(p.price)}</span>
        {p.save && <span className="text-[11px] text-success font-semibold">{p.save} más barato por crédito</span>}
      </div>
      {rinde && <p className="text-[12px] text-foreground mt-3">Te rinde para {rinde}</p>}
      {p.cashback && (
        <p className="text-[11px] text-muted-foreground mt-1">Los {p.cashback.toLocaleString("de-DE")} de regalo llegan solos cuando uses los {p.credits.toLocaleString("de-DE")} del pack.</p>
      )}
      <p className="text-[13px] text-muted-foreground mt-3 leading-relaxed flex-1">{p.tagline}</p>
      <button onClick={() => onBuy(p.id)} disabled={buying !== null} className="btn-primary-nova w-full py-2.5 rounded-lg text-sm mt-5 disabled:opacity-60">
        {buying === p.id ? "Abriendo el pago…" : `Comprar por ${formatUsd(p.price)} →`}
      </button>
    </div>
  );
}

function ProjectionBadge({ projection, onRecharge }: { projection: { days: number; avgDaily: number } | null; onRecharge: () => void }) {
  if (!projection) {
    return (
      <div className="mt-4 text-[11px] text-muted-foreground max-w-[220px]">
        Cuando uses la IA, aquí verás para cuántos días te alcanzan tus créditos
      </div>
    );
  }
  const { days } = projection;
  if (days > 14) {
    return <div className="mt-4 text-[12px] text-success font-medium">✅ Al ritmo que vas, te alcanzan para ~{days} días</div>;
  }
  if (days >= 7) {
    return <div className="mt-4 text-[12px] text-warning font-medium">⚡ Al ritmo que vas, te alcanzan para ~{days} días</div>;
  }
  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <div className="text-[12px] text-destructive font-bold animate-pulse flex items-center gap-1">
        <AlertTriangle className="w-3.5 h-3.5" />
        Al ritmo que vas, se te acaban en ~{days} días
      </div>
      <button onClick={onRecharge} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-[11px] font-bold hover:opacity-90">
        Ver paquetes extra →
      </button>
    </div>
  );
}
