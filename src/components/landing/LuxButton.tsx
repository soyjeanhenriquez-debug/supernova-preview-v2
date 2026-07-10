import { Link } from "react-router-dom";
import type { ReactNode } from "react";

/**
 * Botón Dark Luxury: rectangular, bordes afilados, sin colores chillones.
 * variant "solid": champagne → invierte a transparente con borde en hover.
 * variant "ghost": borde fino → se rellena suavemente en hover.
 */
export function LuxButton({
  to,
  children,
  variant = "solid",
  className = "",
}: {
  to: string;
  children: ReactNode;
  variant?: "solid" | "ghost";
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center px-8 py-4 text-sm font-medium tracking-[0.14em] uppercase transition-all duration-500 font-[Inter,sans-serif]";
  const styles =
    variant === "solid"
      ? "bg-[#C5A880] text-black border border-[#C5A880] hover:bg-transparent hover:text-[#C5A880] hover:shadow-[0_0_24px_-6px_#C5A88066]"
      : "bg-transparent text-[#F5F5F7] border border-[#ffffff15] hover:border-[#C5A880]/60 hover:text-[#C5A880] hover:shadow-[0_0_24px_-8px_#C5A88044]";
  return (
    <Link to={to} className={`${base} ${styles} ${className}`}>
      {children}
    </Link>
  );
}
