import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { DashboardPage } from "@/pages/DashboardPage";
import { RealCampaignsPage } from "@/pages/RealCampaignsPage";
import { AudiencesPage } from "@/pages/AudiencesPage";
import { CreativesPage } from "@/pages/CreativesPage";
import { WinningAdsPage } from "@/pages/WinningAdsPage";
import { SpyPage } from "@/pages/SpyPage";
import { ChatPage } from "@/pages/ChatPage";
import { GeneradoresPage } from "@/pages/GeneradoresPage";

const Index = () => {
  const [activePage, setActivePage] = useState("Dashboard");

  const renderPage = () => {
    switch (activePage) {
      case "Dashboard": return <DashboardPage />;
      case "Campañas": return <RealCampaignsPage />;
      case "Anuncios Ganadores": return <WinningAdsPage />;
      case "Espía": return <SpyPage />;
      case "Generadores": return <GeneradoresPage />;
      case "Chat IA": return <ChatPage />;
      case "Audiencias": return <AudiencesPage />;
      case "Creatividades": return <CreativesPage />;
      case "Reportes":
        return (
          <div className="flex items-center justify-center h-64">
            <div className="text-center space-y-2">
              <div className="text-4xl">📊</div>
              <div className="font-display font-semibold text-foreground">Reportes</div>
              <div className="text-sm text-muted-foreground">Módulo en desarrollo</div>
            </div>
          </div>
        );
      case "Configuración":
        return (
          <div className="flex items-center justify-center h-64">
            <div className="text-center space-y-2">
              <div className="text-4xl">⚙️</div>
              <div className="font-display font-semibold text-foreground">Configuración</div>
              <div className="text-sm text-muted-foreground">Módulo en desarrollo</div>
            </div>
          </div>
        );
      default: return <DashboardPage />;
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar activePage={activePage} />
        <main className="flex-1 p-6 lg:p-8 overflow-auto">
          {renderPage()}
        </main>
      </div>
    </div>
  );
};

export default Index;
