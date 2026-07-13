import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import LandingPage from "./pages/LandingPage";
import SignupPage from "./pages/SignupPage";
import NotFound from "./pages/NotFound";
import { AuthPage } from "./pages/AuthPage";

// La app autenticada y el panel admin viajan en chunks aparte: el visitante
// anónimo solo descarga landing + auth.
const Index = lazy(() => import("./pages/Index"));
const AdminLayout = lazy(() => import("@/components/admin/AdminLayout").then(m => ({ default: m.AdminLayout })));
const AdminOverview = lazy(() => import("@/pages/admin/AdminOverview"));
const AdminStub = lazy(() => import("@/pages/admin/AdminStub").then(m => ({ default: m.AdminStub })));
const AdminUsers = lazy(() => import("@/pages/admin/AdminUsers"));
const AdminKeywords = lazy(() => import("@/pages/admin/AdminKeywords"));
const AdminAgent = lazy(() => import("@/pages/admin/AdminAgent"));
const AdminAccesos = lazy(() => import("@/pages/admin/AdminAccesos"));
const AdminConfig = lazy(() => import("@/pages/admin/AdminConfig"));
const AdminAudit = lazy(() => import("@/pages/admin/AdminAudit"));
const AdminSessions = lazy(() => import("@/pages/admin/AdminSessions"));
const AdminHealth = lazy(() => import("@/pages/admin/AdminHealth"));
import { RequireAccess } from "@/components/RequireAccess";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, loading } = useAuth();

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
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="*" element={<AuthPage />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <RequireAccess>
      <BrowserRouter>
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Navigate to="/" replace />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminOverview />} />
            <Route path="accesos" element={<AdminAccesos />} />
            <Route path="usuarios" element={<AdminUsers />} />
            <Route path="keywords" element={<AdminKeywords />} />
            <Route path="agente" element={<AdminAgent />} />
            <Route path="audit" element={<AdminAudit />} />
            <Route path="sesiones" element={<AdminSessions />} />
            <Route path="salud" element={<AdminHealth />} />
            <Route path="config" element={<AdminConfig />} />
            <Route path="mensajes" element={<AdminStub title="Mensajes & Comunicación" description="Notificaciones, banners y emails a usuarios." />} />
            <Route path="creditos" element={<AdminStub title="Créditos & Planes" description="Configuración de planes, costos y transacciones globales." />} />
            <Route path="analytics" element={<AdminStub title="Analytics" description="Retención, conversión, funnel y comportamiento del producto." />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </RequireAccess>
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
