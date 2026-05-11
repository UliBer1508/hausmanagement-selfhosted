import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// PWA service worker — disabled inside Lovable preview iframes to avoid stale-cache issues.
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const isLovablePreview =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

if (isLovablePreview || isInIframe) {
  // Unregister any existing SW & clear caches in preview/iframe contexts
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
  }
  if ("caches" in window) {
    caches.keys().then((names) => names.forEach((n) => caches.delete(n)));
  }
} else if ("serviceWorker" in navigator && import.meta.env.PROD) {
  // vite-plugin-pwa with autoUpdate registers /sw.js automatically via virtual:pwa-register.
  // immediate:true + onNeedRefresh auto-applies any waiting worker without user prompt.
  // @ts-expect-error virtual module provided by vite-plugin-pwa at build time
  import(/* @vite-ignore */ "virtual:pwa-register").then((m: any) => {
    const updateSW = m.registerSW?.({
      immediate: true,
      onNeedRefresh() { updateSW?.(true); },
      onRegisteredSW(_swUrl: string, registration: ServiceWorkerRegistration | undefined) {
        // Poll for updates every 60s so changes go live without waiting for a reload.
        if (registration) {
          setInterval(() => registration.update().catch(() => {}), 60_000);
        }
      },
    });
  }).catch(() => { /* plugin not available in dev */ });
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
}