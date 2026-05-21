import { Coins, Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCredits } from "@/hooks/useCredits";
import { CountUp } from "@/components/CountUp";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

interface TopBarProps {
  activePage: string;
  onOpenMobileNav?: () => void;
}

export function TopBar({ activePage, onOpenMobileNav }: TopBarProps) {
  const { balance, limit } = useCredits();
  const { t, i18n } = useTranslation();
  const low = balance < 100;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const locale = i18n.resolvedLanguage === "en" ? "en-US" : i18n.resolvedLanguage === "pt" ? "pt-BR" : "es-ES";
  const dateStr = now.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" });

  return (
    <header className="flex items-center justify-between gap-3 px-4 md:px-8 py-3.5 border-b border-border/70 bg-background/70 backdrop-blur-xl sticky top-0 z-30">
      <div className="flex items-center gap-3 min-w-0">
        {onOpenMobileNav && (
          <button
            onClick={onOpenMobileNav}
            aria-label="Menu"
            className="lg:hidden -ml-1 w-9 h-9 rounded-full border border-border/70 text-muted-foreground hover:text-foreground hover:border-foreground/30 flex items-center justify-center transition-colors"
          >
            <Menu className="w-[15px] h-[15px]" strokeWidth={1.8} />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="font-display font-semibold text-[15px] md:text-[16px] text-foreground tracking-[-0.01em] truncate">
            {activePage}
          </h1>
          <p className="text-[11px] text-muted-foreground/80 tracking-tight capitalize hidden sm:block">
            {dateStr}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div
          className={`flex items-center gap-2 h-8 px-3 rounded-full border text-[11px] font-medium transition-colors ${
            low
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-border bg-card/60 text-foreground hover:border-foreground/30"
          }`}
          title={`${balance} / ${limit} ${t("common.credits")}`}
        >
          <Coins className={`w-[13px] h-[13px] ${low ? "text-destructive" : "text-primary"}`} strokeWidth={1.8} />
          <span className="tabular-nums font-semibold"><CountUp value={balance} /></span>
          <span className="text-muted-foreground/70 hidden sm:inline">/ {limit.toLocaleString()}</span>
        </div>

        <LanguageSwitcher />

        <div className="hidden md:flex items-center gap-2 h-8 px-3 rounded-full bg-success/10 border border-success/30 text-[10px] font-semibold tracking-[0.18em] text-success">
          <span className="live-dot" />
          ⚡ {t("topbar.jarvisActive")}
        </div>
      </div>
    </header>
  );
}
