import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { DashboardPage } from "@/pages/DashboardPage";
import { RealCampaignsPage } from "@/pages/RealCampaignsPage";
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
