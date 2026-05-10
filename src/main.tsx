import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// PWA service worker — disabled inside Lovable preview iframes to avoid stale-cache issues.
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com") ||
  window.location.hostname.includes("lovable.app") === false ? false : false;
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
  // Use string-literal import that TS won't try to resolve at build time.
  // @ts-expect-error virtual module provided by vite-plugin-pwa at build time
  import(/* @vite-ignore */ "virtual:pwa-register").then((m: any) => {
    m.registerSW?.({ immediate: true });
  }).catch(() => { /* plugin not available in dev */ });
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
}