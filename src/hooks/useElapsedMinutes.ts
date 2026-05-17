import { useEffect, useState } from "react";

export function useElapsedMinutes() {
  const [m, setM] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setM((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  return m;
}
