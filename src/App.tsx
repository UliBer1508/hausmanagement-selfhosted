import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppStatusBar from "@/components/PWA/AppStatusBar";
import Index from "./pages/Index";
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
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </div>
          <ChatAssistant />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;