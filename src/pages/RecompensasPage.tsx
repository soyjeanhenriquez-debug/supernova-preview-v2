import { useState } from "react";
import { BadgeDollarSign, Check, Copy, ExternalLink, Gift, Instagram, Music2, X, Youtube } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { REWARDS, REWARD_HOOKS, REWARD_MATERIALS, REWARD_RULES_NO, REWARD_RULES_YES, usd } from "@/lib/rewards";

/**
 * "Gana con tu contenido" (07-oct-2026): los dos caminos para ganar publicando. El bono por publicar
 * (créditos, en Contenido) y la campaña de Whop (dólares por vistas por clips de SUPERNOVA o de Jean).
 * Abierta también en la vitrina: cualquiera puede hacer clips. Nada se cobra ni se paga aquí.
 */
const PLATFORM_ICON = { Instagram, YouTube: Youtube, TikTok: Music2 } as const;

export function RecompensasPage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const [copied, setCopied] = useState<number | null>(null);
  const copy = async (text: string, i: number) => {
    try { await navigator.clipboard.writeText(text); setCopied(i); setTimeout(() => setCopied(null), 1500); }
    catch { toast.error("No se pudo copiar"); }
  };
  const example = (views: number) => usd(Math.min(REWARDS.maxPerClip, (views / 1000) * REWARDS.perThousand));
  const capViews = Math.round((REWARDS.maxPerClip / REWARDS.perThousand) * 1000);
  const minViews = Math.round((REWARDS.minPayout / REWARDS.perThousand) * 1000);

  const JoinButton = ({ className = "" }: { className?: string }) => REWARDS.whopUrl ? (
    <a href={REWARDS.whopUrl} target="_blank" rel="noopener noreferrer" className={`btn-primary-nova inline-flex items-center justify-center gap-1.5 rounded-xl px-5 h-10 text-[13px] font-semibold ${className}`}>
      Unirme en Whop <ExternalLink className="w-3.5 h-3.5" />
    </a>
  ) : (
    <span className={`inline-flex items-center justify-center rounded-xl border border-border px-5 h-10 text-[13px] font-medium text-muted-foreground ${className}`}>La campaña abre pronto</span>
  );

  return (
    <div className="max-w-[1100px] mx-auto space-y-8 py-4">
      <PageHeader
        icon={<BadgeDollarSign className="w-6 h-6 text-primary" />}
        title="Gana con tu contenido"
        line="Haz clips sobre SUPERNOVA o sobre Jean y cobra por cada 1.000 vistas. Whop cuenta las vistas y te paga."
        right={<JoinButton />}
      />

      {/* Dos caminos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-card/40 p-5 flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5"><Gift className="w-3.5 h-3.5" /> Si usas la app</span>
          <h2 className="font-display font-semibold text-[17px] text-foreground">Publica lo que creaste</h2>
          <p className="text-[13px] text-muted-foreground">Un carrusel o un video que hiciste con SUPERNOVA, ya publicado: 50 créditos por post, uno al día.</p>
          <button onClick={() => onNavigate("Contenido")} className="mt-auto self-start text-[12px] font-semibold text-primary hover:underline">Ir a Contenido →</button>
        </div>
        <div className="rounded-2xl border border-primary/40 bg-card/40 p-5 flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-[0.14em] text-primary flex items-center gap-1.5"><BadgeDollarSign className="w-3.5 h-3.5" /> Si haces clips</span>
          <h2 className="font-display font-semibold text-[17px] text-foreground">Clips de SUPERNOVA o de Jean</h2>
          <p className="text-[13px] text-muted-foreground">Edita clips con el material de abajo, publícalos y envía el enlace en Whop. Cobras en dólares por las vistas.</p>
          <span className="mt-auto text-[12px] text-muted-foreground">No necesitas tener plan.</span>
        </div>
      </div>

      {/* Pagos por red, como en Whop */}
      <section className="space-y-3">
        <h2 className="font-display font-semibold text-[17px] text-foreground">Cuánto se paga</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {REWARDS.platforms.map(p => {
            const Icon = PLATFORM_ICON[p];
            return (
              <div key={p} className="rounded-2xl border border-border bg-card/40 overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-[14px] font-medium text-foreground"><Icon className="w-4 h-4" strokeWidth={1.7} /> {p}</div>
                <div className="grid grid-cols-3 divide-x divide-border">
                  {[["Por cada 1.000 vistas", REWARDS.perThousand], ["Pago mínimo", REWARDS.minPayout], ["Máximo por clip", REWARDS.maxPerClip]].map(([label, v]) => (
                    <div key={label as string} className="px-3 py-3">
                      <p className="text-[10px] leading-tight text-muted-foreground">{label}</p>
                      <p className="mt-1.5 font-display font-semibold text-[15px] text-foreground">{usd(v as number)}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[12px] text-muted-foreground max-w-3xl">
          Así se calcula: un clip con 20.000 vistas suma {example(20000)}; desde {capViews.toLocaleString("es-ES")} vistas se queda en {usd(REWARDS.maxPerClip)}. Un clip empieza a cobrarse desde {minViews.toLocaleString("es-ES")} vistas.
          Lo que recibes depende de las vistas reales que cuente Whop: no hay un pago asegurado.
        </p>
      </section>

      {/* Pasos */}
      <section className="space-y-3">
        <h2 className="font-display font-semibold text-[17px] text-foreground">Cómo funciona</h2>
        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ["Únete a la campaña", "Entra en Whop y conecta las cuentas donde vas a publicar."],
            ["Toma el material", "Elige un video del kit y un gancho de la lista."],
            ["Edita y publica", "Clip vertical, subtítulos y el aviso #publicidad."],
            ["Envía el enlace", "En Whop toca \"Enviar clip\". Ellos cuentan las vistas y pagan."],
          ].map(([t, d], i) => (
            <li key={t} className="rounded-2xl border border-border bg-card/40 p-4">
              <span className="text-[11px] font-semibold text-primary">Paso {i + 1}</span>
              <p className="mt-1 text-[14px] font-medium text-foreground">{t}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Kit */}
      <section className="space-y-3">
        <h2 className="font-display font-semibold text-[17px] text-foreground">Material para tus clips</h2>
        <div className="rounded-2xl border border-border bg-card/40 divide-y divide-border">
          {REWARD_MATERIALS.map(m => (
            <div key={m.title} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-foreground">{m.title}</p>
                <p className="text-[12px] text-muted-foreground">{m.desc}</p>
              </div>
              {m.url
                ? <a href={m.url} target="_blank" rel="noopener noreferrer" className="shrink-0 inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline">Abrir <ExternalLink className="w-3 h-3" /></a>
                : <span className="shrink-0 text-[12px] text-muted-foreground">Pronto</span>}
            </div>
          ))}
        </div>
      </section>

      {/* Ganchos */}
      <section className="space-y-3">
        <div>
          <h2 className="font-display font-semibold text-[17px] text-foreground">Ganchos para abrir tu clip</h2>
          <p className="text-[12px] text-muted-foreground">El gancho es la primera frase: decide si la gente se queda. Cópialo y dilo a tu manera.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {REWARD_HOOKS.map((h, i) => (
            <button key={h} onClick={() => copy(h, i)} className="text-left rounded-xl border border-border bg-card/40 px-4 py-3 flex items-start gap-3 hover:border-foreground/30">
              <span className="flex-1 text-[13px] text-foreground">{h}</span>
              {copied === i ? <Check className="w-4 h-4 text-primary shrink-0" /> : <Copy className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={1.7} />}
            </button>
          ))}
        </div>
      </section>

      {/* Reglas */}
      <section className="space-y-3">
        <h2 className="font-display font-semibold text-[17px] text-foreground">Qué se aprueba y qué no</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ul className="rounded-2xl border border-border bg-card/40 p-4 space-y-2">
            {REWARD_RULES_YES.map(r => <li key={r} className="flex gap-2 text-[13px] text-foreground"><Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />{r}</li>)}
          </ul>
          <ul className="rounded-2xl border border-border bg-card/40 p-4 space-y-2">
            {REWARD_RULES_NO.map(r => <li key={r} className="flex gap-2 text-[13px] text-foreground"><X className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />{r}</li>)}
          </ul>
        </div>
        <p className="text-[12px] text-muted-foreground">Un clip que rompe una regla se rechaza y no se paga.</p>
      </section>

      <div className="rounded-2xl border border-border bg-card/40 p-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] text-foreground">¿Listo para tu primer clip?</p>
        <JoinButton />
      </div>
    </div>
  );
}
