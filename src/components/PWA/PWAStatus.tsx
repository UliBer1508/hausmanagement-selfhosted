import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Smartphone, Globe } from 'lucide-react';

const PWAStatus = () => {
  const [isPWA, setIsPWA] = useState(false);

  useEffect(() => {
    // Check if app is running as PWA (standalone mode)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isIOSStandalone = (window.navigator as any).standalone === true;
    
    setIsPWA(isStandalone || isIOSStandalone);
  }, []);

  return (
    <Badge 
      variant="outline"
      className="gap-1.5 bg-accent/50"
    >
      {isPWA ? (
        <>
          <Smartphone className="w-3 h-3" />
          <span className="hidden sm:inline">PWA</span>
        </>
      ) : (
        <>
          <Globe className="w-3 h-3" />
          <span className="hidden sm:inline">Web</span>
        </>
      )}
    </Badge>
  );
};

export default PWAStatus;
