import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { DashboardPage } from "@/pages/DashboardPage";
import { WinningAdsPage } from "@/pages/WinningAdsPage";
import { OraculoPage } from "@/pages/OraculoPage";
import { GeneradoresPage } from "@/pages/GeneradoresPage";
import { BrainPage } from "@/pages/BrainPage";
import { CreditsPage } from "@/pages/CreditsPage";
import { CrearPage } from "@/pages/CrearPage";
import { LowCreditBanner } from "@/components/LowCreditBanner";
import { HelpAssistant } from "@/components/HelpAssistant";
import { OnboardingTour } from "@/components/OnboardingTour";
import { FloatingWinnerButton } from "@/components/FloatingWinnerButton";

const Index = () => {
  const [activePage, setActivePage] = useState("Dashboard");

  const renderPage = () => {
    switch (activePage) {
      case "Dashboard": return <DashboardPage onNavigate={setActivePage} />;
      case "Buscar Ofertas Winner": return <WinningAdsPage />;
      case "Anuncios Ganadores": return <WinningAdsPage />;
      case "Oráculo": return <OraculoPage />;
      case "Generadores": return <GeneradoresPage />;
      case "Proyectos": return <BrainPage />;
      case "Créditos": return <CreditsPage />;
      case "Crear": return <CrearPage />;
      case "Admin": return <div className="card-surface rounded-xl p-10 text-center"><h3 className="font-display font-bold text-xl">🛡️ Admin Panel</h3><p className="text-sm text-muted-foreground mt-2">Panel administrativo (en construcción)</p></div>;
      default: return <DashboardPage onNavigate={setActivePage} />;
    }
  };

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">
        <Sidebar activePage={activePage} onNavigate={setActivePage} />
      </div>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setMobileNavOpen(false)} />
          <div className="relative z-10 animate-in slide-in-from-left duration-200">
            <Sidebar
              activePage={activePage}
              onNavigate={setActivePage}
              mobile
              onCloseMobile={() => setMobileNavOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <LowCreditBanner onRecharge={() => setActivePage("Créditos")} />
        <TopBar activePage={activePage} onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
          {renderPage()}
        </main>
      </div>
      <FloatingWinnerButton onClick={() => setActivePage("Buscar Ofertas Winner")} />
      <HelpAssistant />
      <OnboardingTour />
    </div>
  );
};

export default Index;
