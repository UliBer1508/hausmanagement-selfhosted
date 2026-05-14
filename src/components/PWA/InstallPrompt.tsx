import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { CloseButton } from '@/components/ui/close-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, X, Monitor } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Platform = 'ios' | 'android' | 'windows' | 'mac' | 'linux' | 'other';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'mac';
  if (/Linux/i.test(ua)) return 'linux';
  return 'other';
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: window-controls-overlay)').matches ||
    // @ts-expect-error iOS Safari
    window.navigator.standalone === true
  );
}

const InstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [platform] = useState<Platform>(() => detectPlatform());
  const [showManualHint, setShowManualHint] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isStandalone()) return;

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // iOS / Desktop-Browser ohne beforeinstallprompt: nach kurzer Wartezeit Hinweis zeigen
    const dismissed = localStorage.getItem('install-hint-dismissed');
    const timer = window.setTimeout(() => {
      if (!dismissed && (platform === 'ios' || platform === 'windows' || platform === 'mac')) {
        setShowManualHint(true);
        setShowPrompt(true);
      }
    }, 4000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.clearTimeout(timer);
    };
  }, [platform]);

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
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setDeferredPrompt(null);
    setShowManualHint(false);
    localStorage.setItem('install-hint-dismissed', '1');
  };

  if (!showPrompt || (!deferredPrompt && !showManualHint)) {
    return null;
  }

  const manualInstructions: Record<Platform, string | null> = {
    windows:
      'In Microsoft Edge oder Chrome: Adressleiste → Symbol „App installieren" anklicken — oder Menü ⋯ → „Apps" → „Diese Site als App installieren".',
    mac: 'In Chrome/Edge: Adressleiste → Symbol „App installieren". In Safari: Teilen → „Zum Dock hinzufügen".',
    ios: 'Tippe in Safari auf „Teilen" und wähle „Zum Home-Bildschirm".',
    android: null,
    linux: 'In Chrome/Edge: Adressleiste → Symbol „App installieren" oder Menü ⋯ → „Apps" → „Diese Site als App installieren".',
    other: null,
  };

  const hint = manualInstructions[platform];

  return (
    <Card className="fixed bottom-4 right-4 w-80 z-50 shadow-xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {platform === 'windows' || platform === 'mac' || platform === 'linux' ? (
              <Monitor className="w-5 h-5 text-primary" />
            ) : (
              <Download className="w-5 h-5 text-primary" />
            )}
            <CardTitle className="text-lg">App installieren</CardTitle>
          </div>
          <CloseButton onClick={handleDismiss} label="Hinweis schließen" />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <CardDescription className="mb-4">
          Installiere den Steinbock Chalets Manager als eigenständige App – schnellerer Zugriff, eigenes Fenster und Offline-Funktionen.
          {showManualHint && hint ? (
            <span className="block mt-2 text-xs text-muted-foreground">{hint}</span>
          ) : null}
        </CardDescription>
        <div className="flex gap-2">
          {deferredPrompt ? (
            <Button onClick={handleInstall} className="flex-1">
              <Download className="w-4 h-4 mr-2" />
              Installieren
            </Button>
          ) : (
            <Button onClick={handleDismiss} className="flex-1">
              Verstanden
            </Button>
          )}
          <Button variant="outline" onClick={handleDismiss}>
            Später
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default InstallPrompt;