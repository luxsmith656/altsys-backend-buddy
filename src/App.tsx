import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { LocationsProvider } from "@/hooks/useLocations";
import { ThemeProvider } from "@/hooks/useTheme";
import Navbar from "@/components/layout/Navbar";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Register from "./pages/Register";
import MapPage from "./pages/MapPage";
import ChatPage from "./pages/ChatPage";
import OpsAIPage from "./pages/OpsAIPage";
import BookingPage from "./pages/BookingPage";
import AdminDashboard from "./pages/AdminDashboard";
import RangerDashboard from "./pages/RangerDashboard";
import HikerDashboard from "./pages/HikerDashboard";
import ProfilePage from "./pages/ProfilePage";
import DashboardRedirect from "./pages/DashboardRedirect";
import GuideDashboard from "./pages/GuideDashboard";
import CentralDashboard from "./pages/CentralDashboard";
import NotificationsPage from "./pages/NotificationsPage";
import Onboarding from "./pages/Onboarding";
import NotFound from "./pages/NotFound";
import RoleRoute from "@/components/auth/RoleRoute";

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
              <Navbar />
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/map" element={<MapPage />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/booking" element={<BookingPage />} />
                <Route path="/ops-ai" element={<RoleRoute allowedRoles={['admin','super_admin','ranger','guide']}><OpsAIPage /></RoleRoute>} />
                <Route path="/admin" element={<RoleRoute allowedRoles={['admin', 'super_admin']}><AdminDashboard /></RoleRoute>} />
                <Route path="/central" element={<RoleRoute allowedRoles={['super_admin']}><CentralDashboard /></RoleRoute>} />
                <Route path="/ranger" element={<RoleRoute allowedRoles={['ranger']}><RangerDashboard /></RoleRoute>} />
                <Route path="/hiker" element={<RoleRoute allowedRoles={['hiker']}><HikerDashboard /></RoleRoute>} />
                <Route path="/guide" element={<RoleRoute allowedRoles={['guide']}><GuideDashboard /></RoleRoute>} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/dashboard" element={<DashboardRedirect />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </LocationsProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
