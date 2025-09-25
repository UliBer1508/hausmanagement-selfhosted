import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const UpdatePrompt = () => {
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [updateSW, setUpdateSW] = useState<() => void>(() => {});
  const { toast } = useToast();

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });

      // Listen for update available
      navigator.serviceWorker.ready.then((registration) => {
        if (registration.waiting) {
          setShowUpdatePrompt(true);
          setUpdateSW(() => () => {
            registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
          });
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setShowUpdatePrompt(true);
                setUpdateSW(() => () => {
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                });
              }
            });
          }
        });
      });
    }
  }, []);

  const handleUpdate = () => {
    updateSW();
    setShowUpdatePrompt(false);
    toast({
      title: "Update wird angewendet",
      description: "Die App wird neu geladen...",
    });
  };

  const handleDismiss = () => {
    setShowUpdatePrompt(false);
  };

  if (!showUpdatePrompt) {
    return null;
  }

  return (
    <Card className="fixed top-4 right-4 w-80 z-50 shadow-xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Update verfügbar</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDismiss}
            className="h-8 w-8"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <CardDescription className="mb-4">
          Eine neue Version der App ist verfügbar. Jetzt aktualisieren?
        </CardDescription>
        <div className="flex gap-2">
          <Button onClick={handleUpdate} className="flex-1">
            <RefreshCw className="w-4 h-4 mr-2" />
            Aktualisieren
          </Button>
          <Button variant="outline" onClick={handleDismiss}>
            Später
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default UpdatePrompt;