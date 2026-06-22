import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { toast } from "sonner";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppStatusBar from "@/components/PWA/AppStatusBar";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import { MailPreviewProvider } from "./components/Mail/MailPreviewProvider";

const Index = lazy(() => import("./pages/Index"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Login = lazy(() => import("./pages/Login"));
const ChatAssistant = lazy(() => import("./components/Chat/ChatAssistant"));

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
          <MailPreviewProvider>
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
                <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Lädt…</div>}>
                  <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route
                      path="/"
                      element={
                        <ProtectedRoute>
                          <Index />
                        </ProtectedRoute>
                      }
                    />
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </ErrorBoundary>
            </div>
            <ErrorBoundary level="route">
              <Suspense fallback={null}>
                <ChatAssistant />
              </Suspense>
            </ErrorBoundary>
          </BrowserRouter>
          </MailPreviewProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
