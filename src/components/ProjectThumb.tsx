interface Props { seed: string; className?: string; }

// Deterministic hash from string
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h;
}

// Generates 3 hues in the orange/red family from the seed
export function ProjectThumb({ seed, className = "" }: Props) {
  const h = hash(seed || "supernova");
  // Hues constrained: 0-45 (red→orange→amber)
  const h1 = h % 30;                         // 0..29 red
  const h2 = 10 + ((h >> 8) % 30);           // 10..39 red-orange
  const h3 = 25 + ((h >> 16) % 25);          // 25..49 orange-amber
  const s1 = 80 + ((h >> 4) % 15);           // saturation
  const l1 = 45 + ((h >> 12) % 12);
  const rot = (h >> 20) % 360;
  return (
    <div
      className={`brain-thumb ${className}`}
      style={{
        ["--th-c1" as unknown]: `${h1} ${s1}% ${l1}%`,
        ["--th-c2" as unknown]: `${h2} 85% 48%`,
        ["--th-c3" as unknown]: `${h3} 92% 55%`,
      }}
    >
      <div className="brain-thumb-spark" />
      {/* Abstract geometric shapes */}
      <svg
        viewBox="0 0 160 90"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full z-[1] mix-blend-screen opacity-70"
        style={{ transform: `rotate(${rot}deg) scale(1.4)` }}
      >
        <circle cx={(h % 160)} cy={(h >> 4) % 90} r="22" fill={`hsl(${h3} 92% 55% / 0.35)`} />
        <rect
          x={((h >> 8) % 120)}
          y={((h >> 10) % 50)}
          width="40" height="40"
          fill={`hsl(${h1} 90% 50% / 0.25)`}
          transform={`rotate(${(h >> 14) % 90} 80 45)`}
        />
        <line
          x1={(h % 160)} y1="0" x2={((h >> 6) % 160)} y2="90"
          stroke={`hsl(${h2} 90% 55% / 0.4)`} strokeWidth="1"
        />
      </svg>
    </div>
  );
}
