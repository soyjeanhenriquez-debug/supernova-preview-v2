import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { LowCreditBanner } from "@/components/LowCreditBanner";
import { OnboardingTour } from "@/components/OnboardingTour";
import { AgeCountryGate } from "@/components/AgeCountryGate";
import { FloatingWinnerButton } from "@/components/FloatingWinnerButton";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useVersionCheck, updateIsReady } from "@/hooks/useVersionCheck";
import { useFeatureAccess } from "@/lib/features";
import { useProducts } from "@/contexts/ProductContext";
import { JourneyProvider } from "@/contexts/JourneyContext";
import { NextStepCard } from "@/components/journey/StageBar";
import { HIDDEN_PAGES } from "@/lib/tools";
import { GlobalSearch } from "@/components/GlobalSearch";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { useVitrina } from "@/contexts/VitrinaContext";
import { LockedToolPage } from "@/components/LockedToolPage";
import { TutorialButton } from "@/components/TutorialButton";
import { tutorialFor } from "@/lib/tutorials";
import { PAGE_SLUG, SLUG_PAGE } from "@/lib/pageSlugs";

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
const ImageStudioPage = lazy(() => import("@/pages/ImageStudioPage").then(m => ({ default: m.ImageStudioPage })));
const VideoStudioPage = lazy(() => import("@/pages/VideoStudioPage").then(m => ({ default: m.VideoStudioPage })));
const YouTubeRadarPage = lazy(() => import("@/pages/YouTubeRadarPage").then(m => ({ default: m.YouTubeRadarPage })));
const YouTubeCreatorPage = lazy(() => import("@/pages/YouTubeCreatorPage").then(m => ({ default: m.YouTubeCreatorPage })));
const IdeasPage = lazy(() => import("@/pages/IdeasPage").then(m => ({ default: m.IdeasPage })));
const OrderBumpPage = lazy(() => import("@/pages/OrderBumpPage").then(m => ({ default: m.OrderBumpPage })));
const AprendePage = lazy(() => import("@/pages/AprendePage").then(m => ({ default: m.AprendePage })));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 text-primary animate-spin" />
    </div>
  );
}

function pageFromHash(): string {
  // Un hash que no es nuestro (p. ej. el #access_token=… de un enlace de acceso) se ignora.
  let slug = "";
  // Solo el primer tramo decide la pantalla: "#/ofertas/<id>" sigue siendo Ofertas.
  try { slug = decodeURIComponent(window.location.hash.replace(/^#\/?/, "")).split("/")[0]; } catch { /* hash malformado */ }
  const page = SLUG_PAGE[slug] ?? "Dashboard";
  // Pantallas ocultas (src/lib/tools.ts): su dirección vieja (#/ideas, #/side-hustle) lleva al Inicio.
  return HIDDEN_PAGES.has(page) ? "Dashboard" : page;
}

const Index = () => {
  const [activePage, setActivePageState] = useState(pageFromHash);
  const activeRef = useRef(activePage);
  activeRef.current = activePage;
  // Abrir una oferta desde el buscador: la dirección #/ofertas/<id> y volver a montar Ofertas
  // (lee la oferta de la dirección al montarse, también si ya estaba abierta).
  const [openNonce, setOpenNonce] = useState(0);

  const setActivePage = useCallback((requested: string) => {
    const page = HIDDEN_PAGES.has(requested) ? "Dashboard" : requested; // pantallas ocultas → Inicio
    // Volver a tocar la pantalla en la que ya estás la monta de nuevo (p. ej. otro generador
    // desde el menú estando ya en Generadores: lee su orden al montarse).
    if (activeRef.current === page) setOpenNonce(n => n + 1);
    activeRef.current = page;
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
  const { locked } = useVitrina();
  const renderPage = () => {
    // Secciones en pausa (src/lib/features.ts): un cliente que llega por un enlace viejo va al inicio.
    if (!canSee(activePage)) return accessLoading ? null : <DashboardPage onNavigate={setActivePage} />;
    // Vitrina (sin plan): el Inicio y Aprende se ven; cada herramienta enseña qué hace, con candado.
    if (locked && activePage !== "Dashboard" && activePage !== "Aprende") return <LockedToolPage page={activePage} />;
    switch (activePage) {
      case "Aprende": return <AprendePage onNavigate={setActivePage} />;
      case "Creativos": return <ImageStudioPage key="creativo" initialMode="creativo" />;
      case "Carrusel": return <ImageStudioPage key="carrusel" initialMode="carrusel" />;
      case "Miniaturas": return <ImageStudioPage key="miniatura" initialMode="miniatura" />;
      case "Fotos UGC": return <ImageStudioPage key="foto_ugc" initialMode="foto_ugc" />;
      case "Foto de producto": return <ImageStudioPage key="foto_producto" initialMode="foto_producto" />;
      case "Ideas": return <IdeasPage onNavigate={setActivePage} />;
      case "Video IA": return <VideoStudioPage key="clip" initialMode="clip" />;
      case "Series": return <VideoStudioPage key="serie" initialMode="serie" />;
      case "Video anuncio": return <VideoStudioPage key="anuncio" initialMode="anuncio" />;
      // UGC con IA vive dentro de Influencer IA (05-oct-2026): mismo flujo, sin duplicar.
      case "UGC con IA": return <PersonajePage key="ugc" onNavigate={setActivePage} initialStep={3} />;
      case "Nichos YouTube": return <YouTubeRadarPage onNavigate={setActivePage} />;
      case "Creador YouTube": return <YouTubeCreatorPage onNavigate={setActivePage} />;
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
      case "Order bump": return <OrderBumpPage onNavigate={setActivePage} />;
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
  const [searchOpen, setSearchOpen] = useState(false);
  const openOffer = useCallback((id: string) => {
    window.history.pushState(null, "", `${window.location.pathname}${window.location.search}#/ofertas/${id}`);
    setActivePageState("Ofertas");
    setOpenNonce(n => n + 1);
    window.scrollTo({ top: 0 });
  }, []);

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
        {!locked && <LowCreditBanner onRecharge={() => setActivePage("Créditos")} />}
        <TopBar activePage={activePage} onOpenMobileNav={() => setMobileNavOpen(true)} onSearch={() => setSearchOpen(true)} />
        {/* En qué etapa vas y tu siguiente paso, en todas las pantallas. El Inicio ya muestra el
            recorrido completo. Vive fuera del div con key={productKey}: no parpadea al cambiar de producto. */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 pb-[calc(84px+env(safe-area-inset-bottom))] lg:pb-8 overflow-auto">
          {/* Si una pantalla falla, el menú sigue vivo y cambiar de pantalla la recupera. */}
          {/* Video corto de la herramienta, si ya existe (src/lib/tutorials.ts). */}
          {!locked && tutorialFor(activePage) && <div className="max-w-[1280px] mx-auto flex justify-end mb-3"><TutorialButton page={activePage} /></div>}
          <ErrorBoundary compact resetKey={activePage}>
            <Suspense fallback={<PageLoader />}>
              {/* Cambiar de producto vuelve a montar la pantalla con los datos del nuevo. */}
              <div key={`${productKey}-${openNonce}`} className="contents">{renderPage()}</div>
            </Suspense>
          </ErrorBoundary>
          {/* Etapa de esta herramienta ya lista → la siguiente a un clic, sin volver al Inicio. */}
          {!locked && activePage !== "Dashboard" && <NextStepCard page={activePage} onNavigate={setActivePage} />}
        </main>
      </div>
      {/* Atajo al radar: solo donde se buscan ofertas (Inicio y Ofertas), no encima de las herramientas. */}
      {(activePage === "Dashboard" || activePage === "Ofertas") && <FloatingWinnerButton onClick={() => setActivePage("Buscar Ofertas Winner")} />}
      <MobileBottomNav activePage={activePage} onNavigate={setActivePage} onSearch={() => setSearchOpen(true)} />
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} onNavigate={setActivePage} onOpenOffer={openOffer} />
      {!locked && <Suspense fallback={null}><HelpAssistant /></Suspense>}
      <OnboardingTour />
      {/* Edad y país, una sola vez (se guarda en el servidor): va encima de todo. */}
      <AgeCountryGate />
    </div>
    </JourneyProvider>
  );
};

export default Index;
