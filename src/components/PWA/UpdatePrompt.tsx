import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';

const UpdatePrompt = () => {
  const { toast } = useToast();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const applyUpdate = (worker: ServiceWorker) => {
      toast({
        title: 'Update wird installiert',
        description: 'Die App wird neu geladen...',
      });
      worker.postMessage({ type: 'SKIP_WAITING' });
    };

    navigator.serviceWorker.ready.then((registration) => {
      // Already-waiting worker (real update — controller exists)
      if (registration.waiting && navigator.serviceWorker.controller) {
        applyUpdate(registration.waiting);
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            applyUpdate(newWorker);
          }
        });
      });
    });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, [toast]);

  return null;
};

export default UpdatePrompt;