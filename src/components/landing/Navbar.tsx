import { Link } from "react-router-dom";

/** Navbar fijo con desenfoque de cristal y CTA rectangular. */
export function Navbar() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-[#ffffff10] bg-[#0B0B0C]/60 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          to="/"
          className="font-[Inter,sans-serif] text-sm font-semibold uppercase tracking-[0.18em] text-[#F5F5F7] sm:tracking-[0.3em]"
        >
          Supernova
        </Link>
        <div className="flex items-center gap-3 sm:gap-6">
          {/* Quien ya pagó entra por aquí. Antes estaba oculto en el móvil (hidden sm:block). */}
          <Link
            to="/auth"
            className="border border-[#ffffff20] px-3 py-2.5 font-[Inter,sans-serif] text-xs font-medium uppercase tracking-[0.12em] sm:px-4 sm:tracking-[0.18em] text-[#F5F5F7] transition-colors duration-300 hover:border-[#C5A880]/60 hover:text-[#C5A880]"
          >
            Ingresar
          </Link>
          <Link
            to="/signup"
            className="border border-[#C5A880]/70 px-3 py-2.5 font-[Inter,sans-serif] text-xs font-medium uppercase tracking-[0.12em] sm:px-5 sm:tracking-[0.18em] text-[#C5A880] transition-all duration-500 hover:bg-[#C5A880] hover:text-black"
          >
            3 días gratis
          </Link>
        </div>
      </nav>
    </header>
  );
}
