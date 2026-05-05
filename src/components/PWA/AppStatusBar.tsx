import { useState, useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Wifi, WifiOff, Smartphone, Globe, Download, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface NavigatorStandalone extends Navigator {
  standalone?: boolean;
}

const AppStatusBar = () => {
  const [isOnline, setIsOnline] = useState(true);
  const [isPWA, setIsPWA] = useState(false);
  const [isMinimized, setIsMinimized] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem('statusbar-minimized') === 'true'
  );
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [showUpdateButton, setShowUpdateButton] = useState(false);
  const updateSWRef = useRef<(() => void) | null>(null);

  const handleMinimize = (value: boolean) => {
    setIsMinimized(value);
    try {
      localStorage.setItem('statusbar-minimized', String(value));
    } catch {
      // ignore
    }
  };

  // Online/Offline Status
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => {
      setIsOnline(true);
      toast({
        title: "Wieder online",
        description: "Verbindung wiederhergestellt",
      });
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      toast({
        title: "Offline",
        description: "Keine Internetverbindung",
        variant: "destructive",
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // PWA Status
  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isIOSStandalone = (window.navigator as NavigatorStandalone).standalone === true;
    setIsPWA(isStandalone || isIOSStandalone);
  }, []);

  // Install Prompt
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowInstallButton(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // Update Prompt
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const checkForUpdates = () => {
        navigator.serviceWorker.getRegistration().then((registration) => {
          if (registration) {
            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    setShowUpdateButton(true);
                    updateSWRef.current = () => {
                      newWorker.postMessage({ type: 'SKIP_WAITING' });
                    };
                  }
                });
              }
            });
          }
        });
      };

      checkForUpdates();
    }
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      toast({
        title: "Installation gestartet",
        description: "Die App wird installiert...",
      });
    }

    setDeferredPrompt(null);
    setShowInstallButton(false);
  };

  const handleUpdate = () => {
    if (updateSWRef.current) {
      updateSWRef.current();
      setShowUpdateButton(false);
      toast({
        title: "Update wird installiert",
        description: "Die App wird neu geladen...",
      });
    }
  };

  if (isMinimized) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-8">
            <div className="flex items-center gap-2">
              <Badge variant={isOnline ? "default" : "destructive"} className="h-5 px-2">
                {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              </Badge>
              <Badge variant="outline" className="h-5 px-2 bg-accent/50">
                {isPWA ? <Smartphone className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
              </Badge>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => handleMinimize(false)}
              className="h-6 px-2"
            >
              <ChevronDown className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-12">
          <div className="flex items-center gap-3">
            {/* Connection Status */}
            <Badge 
              variant={isOnline ? "default" : "destructive"}
              className="gap-1.5"
            >
              {isOnline ? (
                <>
                  <Wifi className="w-3 h-3" />
                  <span className="hidden sm:inline">Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3" />
                  <span className="hidden sm:inline">Offline</span>
                </>
              )}
            </Badge>

            {/* PWA Status */}
            <Badge 
              variant="outline"
              className="gap-1.5 bg-accent/50"
            >
              {isPWA ? (
                <>
                  <Smartphone className="w-3 h-3" />
                  <span className="hidden sm:inline">PWA Modus</span>
                </>
              ) : (
                <>
                  <Globe className="w-3 h-3" />
                  <span className="hidden sm:inline">Web Modus</span>
                </>
              )}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {/* Install Button */}
            {showInstallButton && !isPWA && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleInstall}
                className="gap-2 h-8"
              >
                <Download className="w-3 h-3" />
                <span className="hidden sm:inline">Installieren</span>
              </Button>
            )}

            {/* Update Button */}
            {showUpdateButton && (
              <Button 
                variant="default" 
                size="sm" 
                onClick={handleUpdate}
                className="gap-2 h-8"
              >
                <RefreshCw className="w-3 h-3" />
                <span className="hidden sm:inline">Update</span>
              </Button>
            )}

            {/* Minimize Button */}
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => handleMinimize(true)}
              className="h-8 px-2"
            >
              <ChevronUp className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AppStatusBar;
