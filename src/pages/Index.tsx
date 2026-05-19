import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { DashboardPage } from "@/pages/DashboardPage";
import { WinningAdsPage } from "@/pages/WinningAdsPage";
import { OraculoPage } from "@/pages/OraculoPage";
import { ChatPage } from "@/pages/ChatPage";
import { GeneradoresPage } from "@/pages/GeneradoresPage";
import { AgentsPage } from "@/pages/AgentsPage";
import { BrainPage } from "@/pages/BrainPage";
import { CreditsPage } from "@/pages/CreditsPage";
import { CrearPage } from "@/pages/CrearPage";

const Index = () => {
  const [activePage, setActivePage] = useState("Dashboard");

  const renderPage = () => {
    switch (activePage) {
      case "Dashboard": return <DashboardPage onNavigate={setActivePage} />;
      case "Buscar Ofertas Winner": return <WinningAdsPage />;
      case "Anuncios Ganadores": return <WinningAdsPage />;
      case "Agentes DR": return <AgentsPage />;
      case "Chat IA": return <ChatPage />;
      case "Generadores": return <GeneradoresPage />;
      case "Proyectos": return <BrainPage />;
      case "Créditos": return <CreditsPage />;
      case "Crear": return <CrearPage />;
      case "Admin": return <div className="card-surface rounded-xl p-10 text-center"><h3 className="font-display font-bold text-xl">🛡️ Admin Panel</h3><p className="text-sm text-muted-foreground mt-2">Panel administrativo (en construcción)</p></div>;
      default: return <DashboardPage onNavigate={setActivePage} />;
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
