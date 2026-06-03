import { useEffect, useRef } from "react";

/**
 * Polls /version.json and forces a hard refresh when a new build is detected.
 * Ensures installed PWAs pick up new deploys within ~20s without a manual reload.
 */
export function useAppVersionCheck(intervalMs = 20_000) {
  const initialVersion = useRef<string | null>(null);
  const reloading = useRef(false);

  useEffect(() => {
    // Skip in Lovable preview iframe — no SW there anyway
    let inIframe = false;
    try { inIframe = window.self !== window.top; } catch { inIframe = true; }
    const host = window.location.hostname;
    const isPreviewHost =
      host.includes("id-preview--") || host.includes("lovableproject.com");
    if (inIframe || isPreviewHost) return;

    let cancelled = false;

    // When a new SW takes control, reload immediately so the user sees the new build.
    const onControllerChange = () => {
      if (reloading.current) return;
      reloading.current = true;
      window.location.reload();
    };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    }

    const fetchVersion = async (): Promise<string | null> => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, {
          cache: "no-store",
          credentials: "omit",
        });
        if (!res.ok) return null;
        const json = await res.json();
        return json?.version ?? null;
      } catch {
        return null;
      }
    };

    const triggerHardReload = async () => {
      if (reloading.current) return;
      reloading.current = true;

      try {
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          let hasWaiting = false;
          await Promise.all(
            regs.map(async (r) => {
              try { await r.update(); } catch {}
              if (r.waiting) {
                hasWaiting = true;
                r.waiting.postMessage({ type: "SKIP_WAITING" });
              }
            })
          );
          // If a new SW is taking over, the controllerchange listener will reload us.
          // Give it 1.5s to claim; otherwise fall back to a plain reload.
          if (hasWaiting) {
            setTimeout(() => {
              if (!reloading.current) return;
              window.location.reload();
            }, 1500);
            return;
          }
        }
      } catch {
        // ignore
      } finally {
        window.location.reload();
      }
    };

    const check = async () => {
      const v = await fetchVersion();
      if (cancelled || !v) return;
      if (initialVersion.current === null) {
        initialVersion.current = v;
        return;
      }
      if (v !== initialVersion.current) {
        triggerHardReload();
      }
    };

    check();
    const id = window.setInterval(check, intervalMs);

    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      }
    };
  }, [intervalMs]);
}