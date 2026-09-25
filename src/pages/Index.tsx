import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { LowCreditBanner } from "@/components/LowCreditBanner";
import { OnboardingTour } from "@/components/OnboardingTour";
import { FloatingWinnerButton } from "@/components/FloatingWinnerButton";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useVersionCheck, updateIsReady } from "@/hooks/useVersionCheck";
import { useFeatureAccess } from "@/lib/features";
import { useProducts } from "@/contexts/ProductContext";
import { JourneyProvider } from "@/contexts/JourneyContext";
import { StageBar, NextStepCard } from "@/components/journey/StageBar";

// Carga diferida: cada pantalla es su propio chunk → la primera carga solo
// baja el Dashboard, el resto llega bajo demanda al navegar.
// El asistente de ayuda trae react-markdown (~100 KB): se descarga aparte, sin frenar el Inicio.
const HelpAssistant = lazy(() => import("@/components/HelpAssistant").then(m => ({ default: m.HelpAssistant })));
const DashboardPage = lazy(() => import("@/pages/DashboardPage").then(m => ({ default: m.DashboardPage })));
const WinningAdsPage = lazy(() => import("@/pages/WinningAdsPage").then(m => ({ default: m.WinningAdsPage })));
const OfertasPage = lazy(() => import("@/pages/OfertasPage").then(m => ({ default: m.OfertasPage })));
const KitsPage = lazy(() => import("@/pages/KitsPage").then(m => ({ default: m.KitsPage })));
const OraculoPage = lazy(() => import("@/pages/OraculoPage").then(m => ({ default: m.OraculoPage })));
const GeneradoresPage = lazy(() => import("@/pages/GeneradoresPage").then(m => ({ default: m.GeneradoresPage })));
const MediaStudioPage = lazy(() => import("@/pages/MediaStudioPage").then(m => ({ default: m.MediaStudioPage })));
const MercadoPage = lazy(() => import("@/pages/MercadoPage").then(m => ({ default: m.MercadoPage })));
const MandalaPage = lazy(() => import("@/pages/MandalaPage").then(m => ({ default: m.MandalaPage })));
const PersonajePage = lazy(() => import("@/pages/PersonajePage").then(m => ({ default: m.PersonajePage })));
const HooksPage = lazy(() => import("@/pages/HooksPage").then(m => ({ default: m.HooksPage })));
const BrainPage = lazy(() => import("@/pages/BrainPage").then(m => ({ default: m.BrainPage })));
const CreditsPage = lazy(() => import("@/pages/CreditsPage").then(m => ({ default: m.CreditsPage })));
const CrearPage = lazy(() => import("@/pages/CrearPage").then(m => ({ default: m.CrearPage })));
const PricingPage = lazy(() => import("@/pages/PricingPage").then(m => ({ default: m.PricingPage })));
const MyBusinessPage = lazy(() => import("@/pages/MyBusinessPage").then(m => ({ default: m.MyBusinessPage })));
const ValidationPage = lazy(() => import("@/pages/ValidationPage").then(m => ({ default: m.ValidationPage })));
const LaunchPlanPage = lazy(() => import("@/pages/LaunchPlanPage").then(m => ({ default: m.LaunchPlanPage })));
const RecoveryPage = lazy(() => import("@/pages/RecoveryPage").then(m => ({ default: m.RecoveryPage })));
const ContentPage = lazy(() => import("@/pages/ContentPage").then(m => ({ default: m.ContentPage })));
const ProductsPage = lazy(() => import("@/pages/ProductsPage").then(m => ({ default: m.ProductsPage })));
const ProductBuilderPage = lazy(() => import("@/pages/ProductBuilderPage"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 text-primary animate-spin" />
    </div>
  );
}

// Cada pantalla tiene su dirección (#/ofertas, #/mini-apps…): refrescar te deja
// donde estabas, "atrás" y "adelante" del navegador funcionan dentro de la app
// y se puede guardar un enlace directo. Va en el hash para no tocar el router
// ni los parámetros de retorno de Stripe (?checkout=…).
const PAGE_SLUG: Record<string, string> = {
  "Dashboard": "",
  "Ofertas": "ofertas",
  "Mini Apps": "mini-apps",
  "Buscar Ofertas Winner": "radar",
  "Anuncios Ganadores": "radar",
  "Hooks": "hooks",
  "Mándala": "mandala",
  "Mercado": "mercado",
  "Oráculo": "oraculo",
  "Generadores": "generadores",
  "Media Studio": "media-studio",
  "Proyectos": "proyectos",
  "Créditos": "creditos",
  "Crear": "crear",
  "Precio": "precio",
  "Mi negocio": "mi-negocio",
  "Validar": "validar",
  "Plan": "plan",
  "Contenido": "contenido",
  "Resultados": "resultados",
  "Recuperar": "recuperar",
  "Productos": "productos",
  "Crear producto": "crear-producto",
  "Sin mostrar tu cara": "personaje",
};
const SLUG_PAGE: Record<string, string> = {
  "ofertas": "Ofertas", "mini-apps": "Mini Apps", "radar": "Buscar Ofertas Winner", "hooks": "Hooks", "mandala": "Mándala", "mercado": "Mercado",
  "oraculo": "Oráculo", "generadores": "Generadores", "media-studio": "Media Studio",
  "proyectos": "Proyectos", "creditos": "Créditos", "crear": "Crear", "precio": "Precio", "mi-negocio": "Mi negocio", "validar": "Validar", "plan": "Plan", "contenido": "Contenido", "resultados": "Resultados", "recuperar": "Recuperar", "productos": "Productos",
  "crear-producto": "Crear producto", "personaje": "Sin mostrar tu cara",
};
function pageFromHash(): string {
  // Un hash que no es nuestro (p. ej. el #access_token=… de un enlace de acceso) se ignora.
  let slug = "";
  // Solo el primer tramo decide la pantalla: "#/ofertas/<id>" sigue siendo Ofertas.
  try { slug = decodeURIComponent(window.location.hash.replace(/^#\/?/, "")).split("/")[0]; } catch { /* hash malformado */ }
  return SLUG_PAGE[slug] ?? "Dashboard";
}

const Index = () => {
  const [activePage, setActivePageState] = useState(pageFromHash);

  const setActivePage = useCallback((page: string) => {
    setActivePageState(page);
    const slug = PAGE_SLUG[page];
    if (slug !== undefined) {
      const target = slug ? `#/${slug}` : "";
      if (window.location.hash !== target) {
        window.history.pushState(null, "", `${window.location.pathname}${window.location.search}${target}`);
      }
    }
    window.scrollTo({ top: 0 }); // cada pantalla empieza arriba, no a media página
    // Hay un deploy más nuevo: cambiar de pantalla es el momento seguro para
    // cargarlo (la dirección ya apunta a la pantalla pedida).
    if (updateIsReady()) window.location.reload();
  }, []);

  useVersionCheck();

  useEffect(() => {
    const sync = () => setActivePageState(pageFromHash());
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => { window.removeEventListener("popstate", sync); window.removeEventListener("hashchange", sync); };
  }, []);

  const { canSee, loading: accessLoading } = useFeatureAccess();
  const { productKey } = useProducts();
  const renderPage = () => {
    // Secciones en pausa (src/lib/features.ts): un cliente que llega por un enlace viejo va al inicio.
    if (!canSee(activePage)) return accessLoading ? null : <DashboardPage onNavigate={setActivePage} />;
    switch (activePage) {
      case "Dashboard": return <DashboardPage onNavigate={setActivePage} />;
      case "Ofertas": return <OfertasPage onNavigate={setActivePage} />;
      case "Mini Apps": return <KitsPage onNavigate={setActivePage} />;
      case "Buscar Ofertas Winner": return <WinningAdsPage />;
      case "Anuncios Ganadores": return <WinningAdsPage />;
      case "Oráculo": return <OraculoPage />;
      case "Generadores": return <GeneradoresPage />;
      case "Media Studio": return <MediaStudioPage />;
      case "Mándala": return <MandalaPage key="mandala" onNavigate={setActivePage} />;
      case "Sin mostrar tu cara": return <PersonajePage onNavigate={setActivePage} />;
      case "Resultados": return <MandalaPage key="resultados" onNavigate={setActivePage} initialTab="mis" />;
      case "Mi negocio": return <MyBusinessPage onNavigate={setActivePage} />;
      case "Validar": return <ValidationPage onNavigate={setActivePage} />;
      case "Plan": return <LaunchPlanPage onNavigate={setActivePage} />;
      case "Contenido": return <ContentPage onNavigate={setActivePage} />;
      case "Recuperar": return <RecoveryPage onNavigate={setActivePage} />;
      case "Productos": return <ProductsPage onNavigate={setActivePage} />;
      case "Crear producto": return <ProductBuilderPage onNavigate={setActivePage} />;
      case "Mercado": return <MercadoPage onNavigate={setActivePage} />;
      case "Hooks": return <HooksPage onNavigate={setActivePage} />;
      case "Proyectos": return <BrainPage onNavigate={setActivePage} />;
      case "Créditos": return <CreditsPage />;
      case "Crear": return <CrearPage />;
      case "Precio": return <PricingPage onNavigate={setActivePage} />;
      case "Admin": return <div className="card-surface rounded-xl p-10 text-center"><h3 className="font-display font-bold text-xl">🛡️ Admin Panel</h3><p className="text-sm text-muted-foreground mt-2">Panel administrativo (en construcción)</p></div>;
      default: return <DashboardPage onNavigate={setActivePage} />;
    }
  };

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <JourneyProvider page={activePage}>
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar: fija al hacer scroll (la página entera es la que se desplaza;
          sin esto el menú se iba hacia arriba y quedaba una columna vacía). */}
      <div className="hidden lg:flex sticky top-0 h-screen self-start z-40">
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
        {/* En qué etapa vas y tu siguiente paso, en todas las pantallas. El Inicio ya muestra el
            recorrido completo. Vive fuera del div con key={productKey}: no parpadea al cambiar de producto. */}
        {activePage !== "Dashboard" && <StageBar page={activePage} onNavigate={setActivePage} />}
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
          {/* Si una pantalla falla, el menú sigue vivo y cambiar de pantalla la recupera. */}
          <ErrorBoundary compact resetKey={activePage}>
            <Suspense fallback={<PageLoader />}>
              {/* Cambiar de producto vuelve a montar la pantalla con los datos del nuevo. */}
              <div key={productKey} className="contents">{renderPage()}</div>
            </Suspense>
          </ErrorBoundary>
          {/* Etapa de esta herramienta ya lista → la siguiente a un clic, sin volver al Inicio. */}
          {activePage !== "Dashboard" && <NextStepCard page={activePage} onNavigate={setActivePage} />}
        </main>
      </div>
      {/* Atajo al radar: solo donde se buscan ofertas (Inicio y Ofertas), no encima de las herramientas. */}
      {(activePage === "Dashboard" || activePage === "Ofertas") && <FloatingWinnerButton onClick={() => setActivePage("Buscar Ofertas Winner")} />}
      <Suspense fallback={null}><HelpAssistant /></Suspense>
      <OnboardingTour />
    </div>
    </JourneyProvider>
  );
};

export default Index;
