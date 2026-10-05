// Service worker, built by vite-plugin-pwa (injectManifest) into dist/sw.js.
// What may be cached is decided by cacheRuleFor (src/pwa/cache-rules.js);
// anything it returns null for, and everything cross-origin (map tiles,
// Supabase, analytics), is left to the network.
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst, StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { cacheRuleFor } from "./pwa/cache-rules.js";

// The app shell: hashed JS/CSS, icons and the manifest (see vite.config.js).
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

const origin = self.location.origin;
const ruleIs = (rule) => ({ request }) => cacheRuleFor(request, origin) === rule;

// The /map listings JSON: served from cache at once, refreshed in the background.
registerRoute(
  ruleIs("map-data"),
  new StaleWhileRevalidate({
    cacheName: "hva-map-data",
    plugins: [new ExpirationPlugin({ maxEntries: 2 })],
  })
);

// Pages: always try the network first (nightly rebuilds must show up), and
// keep the last copy of recently visited pages for when the network is down.
registerRoute(
  ruleIs("page"),
  new NetworkFirst({
    cacheName: "hva-pages",
    networkTimeoutSeconds: 5,
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 7 * 24 * 60 * 60 })],
  })
);

// The page's "Update available - refresh" button asks the waiting worker to
// take over; the page reloads once it has.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
