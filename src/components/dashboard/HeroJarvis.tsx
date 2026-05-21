import { useEffect, useState } from "react";
import { Globe, Languages, Radio } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";

function greetKey() {
  const h = new Date().getHours();
  if (h < 6) return "night";
  if (h < 13) return "morning";
  if (h < 20) return "afternoon";
  return "evening";
}

function hoursToday() {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.floor((+now - +midnight) / 3600000));
}

interface Props { firstName: string; }

export function HeroJarvis({ firstName }: Props) {
  const { t } = useTranslation();
  const [hours, setHours] = useState(hoursToday());
  const [adsToday, setAdsToday] = useState<number | null>(null);
  const [maxTemp, setMaxTemp] = useState<number>(0);
  const [activeKeywords, setActiveKeywords] = useState<number | null>(null);

  useEffect(() => {
    const iv = window.setInterval(() => setHours(hoursToday()), 60_000 * 30);
    return () => window.clearInterval(iv);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sinceToday = new Date(); sinceToday.setHours(0, 0, 0, 0);
      const [{ count: cAds }, { data: temp }, { count: cKw }] = await Promise.all([
        supabase.from("winning_ads").select("id", { count: "exact", head: true })
          .gte("scraped_at", sinceToday.toISOString()),
        supabase.from("temperature_snapshots").select("temperature_level")
          .gte("recorded_at", sinceToday.toISOString())
          .order("temperature_level", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("master_keyword_state").select("id", { count: "exact", head: true })
          .eq("is_paused", false),
      ]);
      if (cancelled) return;
      setAdsToday(cAds ?? 0);
      setMaxTemp((temp as any)?.temperature_level ?? 0);
      setActiveKeywords(cKw ?? 0);
    })();
    return () => { cancelled = true; };
  }, []);

  const fires = "🔥".repeat(Math.max(0, Math.min(6, maxTemp)));
  const greet = t(`greeting.${greetKey()}`);

  return (
    <header className="grid lg:grid-cols-5 gap-6 items-stretch">
      {/* Izquierda 60% */}
      <div className="lg:col-span-3 space-y-4">
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">{greet}</div>
        <h2 className="font-display font-semibold text-[40px] md:text-[52px] leading-[1.02] tracking-[-0.035em] text-foreground">
          {firstName ? t("greeting.welcomeBack", { name: firstName }) : `${greet}.`}
        </h2>
        <div className="flex items-center gap-2 text-[14px] text-primary font-medium animate-jarvis-fade">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          JARVIS · <span className="tabular-nums font-bold">{hours}h</span> {t("common.today")}
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Pill icon={<Globe className="w-3 h-3" />}>
            {activeKeywords ?? "—"} keywords
          </Pill>
          <Pill icon={<Languages className="w-3 h-3" />}>4 idiomas</Pill>
          <Pill icon={<span className="live-dot" />}>LIVE</Pill>
        </div>
      </div>

      {/* Derecha 40% */}
      <div className="lg:col-span-2">
        <div className="card-surface rounded-2xl p-6 border-primary/30 border-2 animate-pulse-amber h-full">
          <div className="flex items-center gap-2 mb-1">
            <Radio className="w-4 h-4 text-primary" />
            <span className="text-[12px] font-bold uppercase tracking-wider text-foreground">{t("topbar.jarvisActive")}</span>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground mb-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            {t("common.online")}
          </div>
          <div className="text-[11px] text-muted-foreground mb-5">Meta Ads Library · TikTok · 4 mercados</div>
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border">
            <MiniStat label="Procesados" value={adsToday === null ? "—" : adsToday.toLocaleString()} />
            <MiniStat label="Temperatura" value={fires || "—"} mono />
          </div>
        </div>
      </div>
    </header>
  );
}

function Pill({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/60 border border-border text-[11px] font-medium text-foreground/90">
      {icon}{children}
    </span>
  );
}

function MiniStat({ label, value, mono }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mb-1">{label}</div>
      <div className={`text-[18px] font-semibold text-foreground ${mono ? "font-mono tracking-wider" : "tabular-nums"}`}>{value}</div>
    </div>
  );
}
