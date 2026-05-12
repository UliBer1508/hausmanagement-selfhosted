import { useEffect, useRef } from "react";

/**
 * Polls /version.json and forces a hard refresh when a new build is detected.
 * Ensures installed PWAs pick up new deploys within ~60s without a manual reload.
 */
export function useAppVersionCheck(intervalMs = 60_000) {
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
      if (sessionStorage.getItem("app-version-reloaded") === "1") return;
      reloading.current = true;
      sessionStorage.setItem("app-version-reloaded", "1");

      try {
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(
            regs.map(async (r) => {
              try { await r.update(); } catch {}
              if (r.waiting) r.waiting.postMessage({ type: "SKIP_WAITING" });
            })
          );
        }
        if ("caches" in window) {
          const names = await caches.keys();
          await Promise.all(
            names
              .filter((n) => n !== "workbox-precache-v2-")
              .map((n) => caches.delete(n))
          );
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
    };
  }, [intervalMs]);
}