import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppStatusBar from "@/components/PWA/AppStatusBar";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Cleaning from "./pages/Cleaning";
import Bookings from "./pages/Bookings";
import BookingsTest from "./pages/BookingsTest";
import ServicePortal from "./pages/ServicePortal";
import ServicePortalOriginal from "./pages/ServicePortalOriginal";
import OriginalDashboard from "./pages/OriginalDashboard";
import Houses from "./pages/Houses";
import Guests from "./pages/Guests";
import Laundry from "./pages/Laundry";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import ChatAssistant from "./components/Chat/ChatAssistant";

const queryClient = new QueryClient();

const App = () => {
  
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AppStatusBar />
        <BrowserRouter 
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true
          }}
        >
          <div className="pt-12">
            <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/cleaning" element={<Cleaning />} />
            <Route path="/bookings" element={<Bookings />} />
            <Route path="/bookings-test" element={<BookingsTest />} />
            <Route path="/houses" element={<Houses />} />
            <Route path="/guests" element={<Guests />} />
            <Route path="/laundry" element={<Laundry />} />
            <Route path="/service-portal" element={<ServicePortal />} />
            <Route path="/original" element={<ServicePortalOriginal />} />
            <Route path="/original-dashboard" element={<OriginalDashboard />} />
            <Route path="/settings" element={<Settings />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
            </Routes>
          </div>
        </BrowserRouter>
        <ChatAssistant />
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;