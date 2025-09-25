import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Bookings from "./pages/Bookings";
import BookingsTest from "./pages/BookingsTest";
import ServicePortal from "./pages/ServicePortal";
import ServicePortalOriginal from "./pages/ServicePortalOriginal";
import OriginalDashboard from "./pages/OriginalDashboard";
import Houses from "./pages/Houses";
import Guests from "./pages/Guests";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter 
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true
        }}
      >
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/bookings" element={<Bookings />} />
          <Route path="/bookings-test" element={<BookingsTest />} />
          <Route path="/houses" element={<Houses />} />
          <Route path="/guests" element={<Guests />} />
          <Route path="/service-portal" element={<ServicePortal />} />
          <Route path="/original" element={<ServicePortalOriginal />} />
          <Route path="/original-dashboard" element={<OriginalDashboard />} />
          <Route path="/settings" element={<Settings />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
