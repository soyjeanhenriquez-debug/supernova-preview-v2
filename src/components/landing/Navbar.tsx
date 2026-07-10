import { Link } from "react-router-dom";

/** Navbar fijo con desenfoque de cristal y CTA rectangular. */
export function Navbar() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-[#ffffff10] bg-[#0B0B0C]/60 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link
          to="/"
          className="font-[Inter,sans-serif] text-sm font-semibold uppercase tracking-[0.3em] text-[#F5F5F7]"
        >
          Supernova
        </Link>
        <div className="flex items-center gap-6">
          <Link
            to="/auth"
            className="hidden font-[Inter,sans-serif] text-xs uppercase tracking-[0.18em] text-[#86868B] transition-colors duration-300 hover:text-[#C5A880] sm:block"
          >
            Iniciar sesión
          </Link>
          <Link
            to="/signup"
            className="border border-[#C5A880]/70 px-5 py-2.5 font-[Inter,sans-serif] text-xs font-medium uppercase tracking-[0.18em] text-[#C5A880] transition-all duration-500 hover:bg-[#C5A880] hover:text-black"
          >
            Empezar
          </Link>
        </div>
      </nav>
    </header>
  );
}
