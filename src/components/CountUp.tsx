import { useEffect, useRef, useState } from "react";

interface Props { value: number; duration?: number; className?: string; format?: (n: number) => string; }

export function CountUp({ value, duration = 800, className, format }: Props) {
  const [n, setN] = useState(0);
  const start = useRef<number | null>(null);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    start.current = null;
    const from = 0;
    const to = value;
    const step = (t: number) => {
      if (start.current === null) start.current = t;
      const elapsed = t - start.current;
      const p = Math.min(1, elapsed / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(from + (to - from) * eased));
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value, duration]);

  return <span className={className}>{format ? format(n) : n.toLocaleString()}</span>;
}
