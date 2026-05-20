import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { AuthPage } from "./pages/AuthPage";
import { AdminLayout } from "@/components/admin/AdminLayout";
import AdminOverview from "@/pages/admin/AdminOverview";
import { AdminStub } from "@/pages/admin/AdminStub";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminKeywords from "@/pages/admin/AdminKeywords";
import AdminAgent from "@/pages/admin/AdminAgent";
import AdminAccesos from "@/pages/admin/AdminAccesos";
import PendingAccessPage from "./pages/PendingAccessPage";
import { useAccessStatus } from "@/hooks/useAccessStatus";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, loading } = useAuth();
  const access = useAccessStatus();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl gradient-brand animate-pulse-glow flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  if (access === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (access === "pending") {
    return <PendingAccessPage />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminOverview />} />
          <Route path="accesos" element={<AdminAccesos />} />
          <Route path="usuarios" element={<AdminUsers />} />
          <Route path="keywords" element={<AdminKeywords />} />
          <Route path="agente" element={<AdminAgent />} />
          <Route path="mensajes" element={<AdminStub title="Mensajes & Comunicación" description="Notificaciones, banners y emails a usuarios." />} />
          <Route path="creditos" element={<AdminStub title="Créditos & Planes" description="Configuración de planes, costos y transacciones globales." />} />
          <Route path="analytics" element={<AdminStub title="Analytics" description="Retención, conversión, funnel y comportamiento del producto." />} />
          <Route path="config" element={<AdminStub title="Configuración del Sistema" description="Branding, APIs, búsqueda automática y mantenimiento." />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
