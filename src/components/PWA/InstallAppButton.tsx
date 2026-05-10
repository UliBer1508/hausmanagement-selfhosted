import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Share } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Button to install the PWA on supported browsers.
 * - Chrome/Edge/Android: triggers the native beforeinstallprompt
 * - iOS Safari: shows manual instructions ("Teilen → Zum Home-Bildschirm")
 * Hidden when the app is already running standalone.
 */
export const InstallAppButton = () => {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari
      // @ts-expect-error legacy iOS API
      window.navigator.standalone === true);

  const isIos =
    typeof window !== "undefined" &&
    /iphone|ipad|ipod/i.test(window.navigator.userAgent);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (isStandalone) return null;

  const handleClick = async () => {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
    } else if (isIos) {
      setShowIosHint(true);
    } else {
      setShowIosHint(true);
    }
  };

  // Show button if we have a deferred prompt OR user is on iOS (manual install path)
  const visible = !!deferred || isIos;
  if (!visible) return null;

  return (
    <>
      <Button onClick={handleClick} variant="outline" size="sm" className="gap-2">
        <Download className="h-4 w-4" />
        App installieren
      </Button>

      <Dialog open={showIosHint} onOpenChange={setShowIosHint}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share className="h-5 w-5" /> App auf dem Home-Bildschirm
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-2">
              <p>So installierst du die App auf iPhone/iPad:</p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Tippe unten in Safari auf <strong>Teilen</strong> (Quadrat mit Pfeil).</li>
                <li>Wähle <strong>„Zum Home-Bildschirm"</strong>.</li>
                <li>Bestätige mit <strong>„Hinzufügen"</strong>.</li>
              </ol>
              <p className="text-xs text-muted-foreground pt-2">
                Funktioniert nur in Safari, nicht in Chrome auf iOS.
              </p>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
};