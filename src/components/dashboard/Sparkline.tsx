interface Props { values: number[]; className?: string; color?: string; height?: number; }

export function Sparkline({ values, className, color = "hsl(var(--primary))", height = 30 }: Props) {
  if (!values.length) return <div style={{ height }} className={className} />;
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const w = 100, h = height;
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  const area = `0,${h} ${points} ${w},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} style={{ width: "100%", height, display: "block" }}>
      <polygon points={area} fill={color} fillOpacity="0.08" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
