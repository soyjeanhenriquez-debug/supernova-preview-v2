import { useState, lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { LowCreditBanner } from "@/components/LowCreditBanner";
import { HelpAssistant } from "@/components/HelpAssistant";
import { OnboardingTour } from "@/components/OnboardingTour";
import { FloatingWinnerButton } from "@/components/FloatingWinnerButton";

// Carga diferida: cada pantalla es su propio chunk → la primera carga solo
// baja el Dashboard, el resto llega bajo demanda al navegar.
const DashboardPage = lazy(() => import("@/pages/DashboardPage").then(m => ({ default: m.DashboardPage })));
const WinningAdsPage = lazy(() => import("@/pages/WinningAdsPage").then(m => ({ default: m.WinningAdsPage })));
const OraculoPage = lazy(() => import("@/pages/OraculoPage").then(m => ({ default: m.OraculoPage })));
const GeneradoresPage = lazy(() => import("@/pages/GeneradoresPage").then(m => ({ default: m.GeneradoresPage })));
const MediaStudioPage = lazy(() => import("@/pages/MediaStudioPage").then(m => ({ default: m.MediaStudioPage })));
const BrainPage = lazy(() => import("@/pages/BrainPage").then(m => ({ default: m.BrainPage })));
const CreditsPage = lazy(() => import("@/pages/CreditsPage").then(m => ({ default: m.CreditsPage })));
const CrearPage = lazy(() => import("@/pages/CrearPage").then(m => ({ default: m.CrearPage })));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 text-primary animate-spin" />
    </div>
  );
}

const Index = () => {
  const [activePage, setActivePage] = useState("Dashboard");

  const renderPage = () => {
    switch (activePage) {
      case "Dashboard": return <DashboardPage onNavigate={setActivePage} />;
      case "Buscar Ofertas Winner": return <WinningAdsPage />;
      case "Anuncios Ganadores": return <WinningAdsPage />;
      case "Oráculo": return <OraculoPage />;
      case "Generadores": return <GeneradoresPage />;
      case "Media Studio": return <MediaStudioPage />;
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
          <Suspense fallback={<PageLoader />}>
            {renderPage()}
          </Suspense>
        </main>
      </div>
      <FloatingWinnerButton onClick={() => setActivePage("Buscar Ofertas Winner")} />
      <HelpAssistant />
      <OnboardingTour />
    </div>
  );
};

export default Index;
