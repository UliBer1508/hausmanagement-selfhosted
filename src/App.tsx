import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { toast } from "sonner";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppStatusBar from "@/components/PWA/AppStatusBar";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import ChatAssistant from "./components/Chat/ChatAssistant";
import ErrorBoundary from "./components/ErrorBoundary";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 min
      gcTime: 5 * 60 * 1000, // 5 min
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0, // Mutations sind nicht idempotent (z.B. Löschen)
    },
  },
  queryCache: new QueryCache({
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unbekannter Fehler";
      console.error("[QueryCache]", error);
      toast.error("Daten konnten nicht geladen werden", { description: message });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unbekannter Fehler";
      console.error("[MutationCache]", error);
      // Komponenten setzen meistens eigene Toasts; hier nur Logging
    },
  }),
});

const App = () => {
  
  return (
    <ErrorBoundary level="root">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <AppStatusBar />
          <BrowserRouter
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true,
            }}
          >
            <div className="pt-12">
              <ErrorBoundary level="route">
                <Routes>
                  <Route path="/" element={<Index />} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </ErrorBoundary>
            </div>
            <ErrorBoundary level="route">
              <ChatAssistant />
            </ErrorBoundary>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
