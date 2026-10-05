// vite-plugin-pwa options (used by vite.config.js), and the kill switch.
// Plain data and pure functions so pwa-options.test.js can check that the flag
// selects the right mode, and the app can read the same flag at runtime.
//
// Kill switch: VITE_PWA_KILL=1 at build time turns on the plugin's
// selfDestroying mode: dist/sw.js becomes a worker that unregisters itself and
// clears its caches, and PwaPrompts.jsx stops registering a worker (and
// unregisters any it finds). Any other value, or none, builds the normal worker.
// To roll back the service worker on all visitors: set VITE_PWA_KILL=1 in Vercel and redeploy.

export function isPwaKilled(env) {
  return String(env?.VITE_PWA_KILL ?? "").trim() === "1";
}

export function pwaOptions(env) {
  return {
    strategies: "injectManifest",
    srcDir: "src",
    filename: "sw.js",
    registerType: "prompt",
    injectRegister: false,
    selfDestroying: isPwaKilled(env),
    manifest: {
      name: "Hudson Valley Almanac",
      short_name: "HV Almanac",
      description: "The Hudson Valley's directory of farms, makers, markets & stewards.",
      start_url: "/",
      scope: "/",
      display: "standalone",
      theme_color: "#1C3A5E",
      background_color: "#EFF0E8",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    injectManifest: {
      // The app shell only: hashed JS/CSS, icons and the manifest. Never the
      // prerendered HTML (pages are network-first, so nightly rebuilds show up),
      // the map data JSON (stale-while-revalidate at runtime), the per-page
      // loader data, book covers or anything under /admin.
      // (The manifest and its icons are added by the plugin itself.)
      globPatterns: ["assets/**/*.{js,css}", "favicon.svg", "icons/apple-touch-icon.png"],
      globIgnores: ["**/listings-map-*.json", "**/*.html", "static-loader-data/**", "admin/**"],
      // The main bundle carries the site's built-in content; don't let it
      // silently drop out of the shell if it grows past workbox's 2 MB default.
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    },
    devOptions: { enabled: false },
  };
}

// Our caches, as named in src/sw.js plus workbox's precache.
export function isOurCache(name) {
  return /^hva-/.test(name) || /^workbox-precache/.test(name);
}
