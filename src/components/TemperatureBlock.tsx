import { calculateTemperature, getMarketSignal, getVelocityWindow } from '@/lib/temperature-system';

interface TemperatureBlockProps {
  duplicates: number;
  uniquePages: number;
  daysActive: number;
  allPageNames: string[];
  compact?: boolean;
}

export function TemperatureBlock({
  duplicates,
  uniquePages,
  daysActive,
  allPageNames,
  compact = false,
}: TemperatureBlockProps) {
  const temp = calculateTemperature(duplicates, uniquePages, daysActive, allPageNames);
  const signal = getMarketSignal(uniquePages, allPageNames);
  const velocity = getVelocityWindow(duplicates, daysActive);

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] font-semibold whitespace-nowrap">
        <span>{temp.fires}</span>
        <span style={{ color: temp.color }}>{temp.label}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{signal.badge}</span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border p-3 flex flex-col gap-1.5 ${temp.isPulsing ? 'temp-pulse' : ''}`}
      style={{
        borderColor: temp.color + '55',
        background: temp.glowColor,
      }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">{temp.fires}</span>
          <span className="text-[12px] font-bold tracking-wide" style={{ color: temp.color }}>
            {temp.label}
          </span>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-border bg-background/60 text-foreground/90">
          {signal.badge}
        </span>
      </div>

      <div className="text-[10px] text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5">
        <span className="font-semibold text-foreground/80">{velocity.label}</span>
        <span>· {velocity.ratio.toFixed(1)} dups/día</span>
        <span>· {uniquePages} {uniquePages === 1 ? 'página' : 'páginas'}</span>
        <span>· {daysActive} días</span>
      </div>

      <div className="text-[11px] text-foreground/85 leading-snug">💡 {temp.marketReading}</div>
      <div className="text-[11px] font-semibold leading-snug" style={{ color: temp.color }}>
        → {temp.userAction}
      </div>

      {(temp.isNuclear || signal.type === 'market_phenomenon') && (
        <div className="text-[11px] font-bold mt-1 px-2 py-1 rounded bg-primary/15 border border-primary/30 text-primary">
          ⚡ {signal.opportunity}
        </div>
      )}
    </div>
  );
}
