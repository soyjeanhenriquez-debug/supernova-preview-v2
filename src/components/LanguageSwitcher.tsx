import { Globe, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LANGS = [
  { code: "es", label: "Español", short: "ES" },
  { code: "en", label: "English", short: "EN" },
  { code: "pt", label: "Português", short: "PT" },
] as const;

interface Props {
  variant?: "default" | "ghost";
  showCode?: boolean;
}

export function LanguageSwitcher({ variant = "default", showCode = true }: Props) {
  const { i18n, t } = useTranslation();
  const current = (i18n.resolvedLanguage || i18n.language || "es").slice(0, 2);
  const active = LANGS.find((l) => l.code === current) ?? LANGS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("lang.label")}
        className={`flex items-center gap-1.5 h-8 px-2.5 rounded-full text-[11px] font-medium tracking-wide transition-colors border ${
          variant === "ghost"
            ? "border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/60"
            : "border-border bg-card/60 text-muted-foreground hover:text-foreground hover:border-foreground/30"
        }`}
      >
        <Globe className="w-[13px] h-[13px]" strokeWidth={1.8} />
        {showCode && <span className="tabular-nums">{active.short}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {LANGS.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => i18n.changeLanguage(l.code)}
            className="flex items-center justify-between gap-3 text-[13px]"
          >
            <span className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-muted-foreground tabular-nums w-6">
                {l.short}
              </span>
              {l.label}
            </span>
            {current === l.code && <Check className="w-3.5 h-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
