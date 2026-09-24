import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ProductProvider } from "@/contexts/ProductContext";
import NotFound from "./pages/NotFound";

// Landing de React, registro y login también bajo demanda: quien ya tiene sesión no los necesita
// (antes arrastraban framer-motion, ~128 KB, a la primera descarga de todos).
const LandingPage = lazy(() => import("./pages/LandingPage"));
const SignupPage = lazy(() => import("./pages/SignupPage"));
const AuthPage = lazy(() => import("./pages/AuthPage").then(m => ({ default: m.AuthPage })));

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
const AdminMercado = lazy(() => import("@/pages/admin/AdminMercado"));
const AdminHealth = lazy(() => import("@/pages/admin/AdminHealth"));
const UnsubscribePage = lazy(() => import("@/pages/UnsubscribePage"));
import { RequireAccess } from "@/components/RequireAccess";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Datos recién pedidos se reutilizan 1 min y no se vuelven a pedir al cambiar de pestaña.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false } },
});

/**
 * La portada del dominio es la landing de fundadores (HTML estático, ver vite.config.ts).
 * Si alguien sin sesión llega a "/" navegando DENTRO de la app (logo, "← Volver"), se
 * recarga la página para que el servidor entregue esa landing. En desarrollo no hay
 * landing estática en la raíz: ahí se sigue viendo la landing de React.
 */
function StaticHome() {
  if (import.meta.env.PROD) {
    window.location.replace("/" + window.location.search);
    return <div className="min-h-screen bg-background" />;
  }
  return <LandingPage />;
}

/** Liga la visita a la landing (test A/B, localStorage "sn_ab_v1") con la cuenta, una sola vez. */
function useClaimLandingVisit(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;
    try {
      const ab = JSON.parse(localStorage.getItem("sn_ab_v1") || "null");
      if (!ab?.id || ab.claimed) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).rpc("claim_landing_visitor", { p_visitor: ab.id }).then(({ error }: { error: unknown }) => {
        if (!error) localStorage.setItem("sn_ab_v1", JSON.stringify({ ...ab, claimed: true }));
      });
    } catch { /* sin almacenamiento */ }
  }, [userId]);
}

function AppRoutes() {
  const { user, loading } = useAuth();
  useClaimLandingVisit(user?.id);

  // La baja del correo funciona con o sin sesión y sin pasar por el muro de
  // acceso: quien llega desde su correo debe poder darse de baja con un clic.
  if (window.location.pathname === "/unsub") {
    return <Suspense fallback={<div className="min-h-screen bg-background" />}><UnsubscribePage /></Suspense>;
  }

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
    // Un enlace de correo caducado vuelve a "/" con el error en la URL. Antes caía en la
    // landing sin explicación (el primer usuario real pensó que la app estaba rota): ahora
    // va al login, que explica qué pasó y deja entrar con contraseña.
    const authLinkError = /error_code=|error=access_denied/.test(window.location.hash + window.location.search);
    return (
      <BrowserRouter>
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
          <Routes>
            <Route path="/" element={authLinkError ? <AuthPage /> : <StaticHome />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="*" element={<AuthPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    );
  }

  return (
    <RequireAccess>
      <BrowserRouter>
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <Routes>
          {/* La app vive en /app ("/" es la landing pública). "/" se mantiene por si se
              navega ahí desde dentro sin recargar. */}
          <Route path="/" element={<Index />} />
          <Route path="/app" element={<Index />} />
          <Route path="/auth" element={<Navigate to="/app" replace />} />
          <Route path="/signup" element={<Navigate to="/app" replace />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminOverview />} />
            <Route path="accesos" element={<AdminAccesos />} />
            <Route path="usuarios" element={<AdminUsers />} />
            <Route path="keywords" element={<AdminKeywords />} />
            <Route path="agente" element={<AdminAgent />} />
            <Route path="audit" element={<AdminAudit />} />
            <Route path="sesiones" element={<AdminSessions />} />
            <Route path="salud" element={<AdminHealth />} />
            <Route path="mercado" element={<AdminMercado />} />
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
      <ErrorBoundary>
        <AuthProvider>
          <ProductProvider>
            <AppRoutes />
          </ProductProvider>
        </AuthProvider>
      </ErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
