import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { SocialProof } from "@/components/landing/SocialProof";
import { Insight } from "@/components/landing/Insight";
import { MinerEngine, BuilderEngine } from "@/components/landing/Engines";
import { VslSection } from "@/components/landing/VslSection";
import { FinalCta } from "@/components/landing/FinalCta";

/**
 * Landing pública de SUPERNOVA — estética Dark Luxury.
 * Solo se muestra a visitantes anónimos; el dashboard no se toca.
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[#0B0B0C] text-[#F5F5F7] antialiased">
      <Navbar />
      <main>
        <Hero />
        <SocialProof />
        <Insight />
        <MinerEngine />
        <BuilderEngine />
        <VslSection />
        <FinalCta />
      </main>
      <footer className="border-t border-[#ffffff10] py-10 text-center font-[Inter,sans-serif] text-xs tracking-[0.2em] text-[#86868B]">
        © SUPERNOVA 2026
      </footer>
    </div>
  );
}
