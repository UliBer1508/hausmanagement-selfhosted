import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from 'vite-plugin-pwa';
import fs from "fs";

// Emits a fresh public/version.json on every build/dev start.
// Used by the runtime version-check to force-refresh installed PWAs.
const versionStampPlugin = () => ({
  name: "version-stamp",
  buildStart() {
    try {
      const dir = path.resolve(__dirname, "public");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const payload = {
        version: Date.now().toString(36),
        builtAt: new Date().toISOString(),
      };
      fs.writeFileSync(path.join(dir, "version.json"), JSON.stringify(payload));
    } catch (e) {
      // non-fatal
      console.warn("[version-stamp] failed:", e);
    }
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(), 
    mode === "development" && componentTagger(),
    versionStampPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: false },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, // 6MB
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/^\/~oauth/, /^\/api/, /^\/functions/],
        runtimeCaching: [
          {
            // Build-version probe — never cache, always hit the network
            urlPattern: /\/version\.json(\?.*)?$/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-cache',
              networkTimeoutSeconds: 1,
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              }
            }
          },
          {
            // Supabase calls (REST + functions + auth + realtime) — never cache
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkOnly',
          }
        ]
      },
      manifest: {
        name: 'Steinbockchalets-Hausverwaltung',
        short_name: 'Hausverwaltung',
        description: 'Ferienhäuser und Mietobjekte professionell verwalten',
        theme_color: '#c2410c',
        background_color: '#f5f1e8',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        lang: 'de',
        categories: ['business', 'productivity'],
        launch_handler: { client_mode: 'navigate-existing' },
        shortcuts: [
          { name: 'Dashboard', short_name: 'Dashboard', url: '/', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
          { name: 'Buchungen', short_name: 'Buchungen', url: '/bookings', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
          { name: 'Reinigung', short_name: 'Reinigung', url: '/cleaning', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
          { name: 'Wäsche', short_name: 'Wäsche', url: '/laundry', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] }
        ],
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: 'apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'any'
          }
        ]
      }
    })
  ].filter(Boolean),
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-select', '@radix-ui/react-tabs'],
          query: ['@tanstack/react-query'],
          supabase: ['@supabase/supabase-js'],
          utils: ['clsx', 'tailwind-merge', 'date-fns'],
          components: ['lucide-react']
        }
      }
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
