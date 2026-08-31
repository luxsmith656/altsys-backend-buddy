import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Suspense } from "react";
import { AuthProvider } from "@/hooks/useAuth";
import { useAuth } from "@/hooks/useAuth";
import { LocationsProvider } from "@/hooks/useLocations";
import { ThemeProvider } from "@/hooks/useTheme";
import Navbar from "@/components/layout/Navbar";
import GlobalAIAssistant from "@/components/booking/GlobalAIAssistant";
import NotFound from "./pages/NotFound";
import RoleRoute from "@/components/auth/RoleRoute";
import ErrorBoundary from "@/components/common/ErrorBoundary";
import { APP_ROUTES, type AppRouteDefinition } from "@/app/routes";
import { useEffect } from "react";
import { startSyncEngine } from "@/lib/tracking/syncEngine";
import { useKaliContext } from "@/hooks/useKaliContext";
import KaliContextPanel from "@/components/kali/KaliContextPanel";

function OfflineSyncBoot() {
  useEffect(() => { startSyncEngine(); }, []);
  return null;
}

function AppKaliGuidance() {
  const { user, role } = useAuth();
  const location = useLocation();
  const { insights } = useKaliContext({ role: role ?? 'guest' });

  if (location.pathname === '/booking' || location.pathname === '/hiker') return null;
  if (!user && !['/', '/map', '/chat'].includes(location.pathname)) return null;

  return <KaliContextPanel role={role ?? 'guest'} insights={insights} />;
}

function RoutedPage({ route }: { route: AppRouteDefinition }) {
  const Page = route.component;
  const page = (
    <div className="contents" data-route-page={route.pageKey}>
      <Page />
    </div>
  );

  return route.allowedRoles ? <RoleRoute allowedRoles={route.allowedRoles}>{page}</RoleRoute> : page;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,   // 5 min — prevents refetch on every tab switch
      gcTime: 10 * 60 * 1000,     // 10 min cache retention
      refetchOnWindowFocus: false, // Don't refetch when switching browser tabs
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <LocationsProvider>
              <OfflineSyncBoot />
              <Navbar />
              <ErrorBoundary>
                <Routes>
                  {APP_ROUTES.map((route) => (
                    <Route
                      key={route.path}
                      path={route.path}
                      element={
                        <Suspense fallback={<div className="min-h-screen pt-24 px-4 text-center text-sm text-muted-foreground">Loading page...</div>}>
                          <RoutedPage route={route} />
                        </Suspense>
                      }
                    />
                  ))}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </ErrorBoundary>
              <AppKaliGuidance />
              <GlobalAIAssistant />
            </LocationsProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
