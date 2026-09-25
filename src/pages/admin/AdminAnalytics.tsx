import { Activity, AlertTriangle, ExternalLink, Filter, Flame, PlayCircle } from "lucide-react";

/**
 * Admin → Analytics: accesos directos a PostHog (us.posthog.com), donde viven las grabaciones,
 * los mapas de calor, los errores y los embudos. La medición está en src/lib/analytics.ts
 * (solo en el dominio oficial, sin grabar admins, con lo escrito oculto).
 */
const PH = "https://us.posthog.com";
const LINKS = [
  { icon: PlayCircle, title: "Grabaciones de sesión", desc: "Mira cómo usa la app cada persona, como un video. Filtra por correo, pantalla o si hubo un error.", href: `${PH}/replay/home` },
  { icon: Flame, title: "Mapas de calor", desc: "Dónde tocan, qué ignoran y hasta dónde bajan en cada pantalla y en la landing.", href: `${PH}/heatmaps` },
  { icon: AlertTriangle, title: "Errores en vivo", desc: "Qué se rompe, en qué pantalla y a cuántas personas. Cada error trae la grabación del momento.", href: `${PH}/error_tracking` },
  { icon: Filter, title: "Embudos", desc: "De cada 100 que entran, cuántos eligen oferta, clonan y terminan cada etapa. Así se ve dónde se caen.", href: `${PH}/insights` },
  { icon: Activity, title: "Actividad en vivo", desc: "Lo que está pasando ahora mismo: vistas, clics y eventos del negocio.", href: `${PH}/activity/explore` },
];

const EVENTS = [
  ["gemelo_oferta_elegida", "Tocó una oferta en \"¿Qué quieres vender?\""],
  ["gemelo_clonar", "Pasó a \"Tu negocio gemelo\""],
  ["gemelo_guardado", "Guardó su gemelo (etapa 1 lista)"],
  ["etapa_completada", "Terminó una etapa (propiedad \"etapa\": 1 a 6)"],
  ["$pageview", "Cambió de pantalla (la dirección dice cuál: #/ofertas, #/validar…)"],
  ["$exception", "Error en el navegador"],
];

export default function AdminAnalytics() {
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">Cómo usan SUPERNOVA tus clientes. Los datos están en PostHog: entra con tu cuenta (asistentedigitalizados@gmail.com).</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {LINKS.map(l => (
          <a key={l.title} href={l.href} target="_blank" rel="noopener noreferrer"
            className="group rounded-2xl border border-border bg-card p-5 hover:border-foreground/25 transition-colors">
            <div className="flex items-center justify-between">
              <l.icon className="w-5 h-5 text-primary" />
              <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
            </div>
            <p className="font-display text-[16px] font-semibold text-foreground mt-3">{l.title}</p>
            <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">{l.desc}</p>
          </a>
        ))}
      </div>
      <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Eventos que manda la app</h2>
        <div className="divide-y divide-border/60">
          {EVENTS.map(([k, v]) => (
            <div key={k} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-2.5">
              <code className="text-[12px] font-mono text-primary sm:w-56 shrink-0">{k}</code>
              <span className="text-[13px] text-foreground/85">{v}</span>
            </div>
          ))}
        </div>
        <p className="text-[12px] text-muted-foreground">Tus sesiones de admin no se graban. En las grabaciones, todo lo que se escribe sale oculto.</p>
      </section>
    </div>
  );
}
