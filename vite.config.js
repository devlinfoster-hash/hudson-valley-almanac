import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Installable app + service worker. The worker is our own src/sw.js
// (injectManifest), whose caching rules live in src/pwa/cache-rules.js.
// Registration happens in src/pwa/PwaPrompts.jsx, client-side only, so the
// SSG prerender never touches it.
const pwa = VitePWA({
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'sw.js',
  registerType: 'prompt',
  injectRegister: false,
  manifest: {
    name: 'Hudson Valley Almanac',
    short_name: 'HV Almanac',
    description: "The Hudson Valley's directory of farms, makers, markets & stewards.",
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: '#1C3A5E',
    background_color: '#EFF0E8',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  injectManifest: {
    // The app shell only: hashed JS/CSS, icons and the manifest. Never the
    // prerendered HTML (pages are network-first, so nightly rebuilds show up),
    // the map data JSON (stale-while-revalidate at runtime), the per-page
    // loader data, book covers or anything under /admin.
    // (The manifest and its icons are added by the plugin itself.)
    globPatterns: ['assets/**/*.{js,css}', 'favicon.svg', 'icons/apple-touch-icon.png'],
    globIgnores: ['**/listings-map-*.json', '**/*.html', 'static-loader-data/**', 'admin/**'],
    // The main bundle carries the site's built-in content; don't let it
    // silently drop out of the shell if it grows past workbox's 2 MB default.
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  },
  devOptions: { enabled: false },
})

export default defineConfig({
  plugins: [react(), pwa],
  ssgOptions: {
    // Emit path/index.html (e.g. /county/delaware/index.html) so Vercel serves
    // each prerendered route cleanly via the filesystem before the SPA rewrite.
    dirStyle: 'nested',
    // /admin is an authenticated dashboard — never prerender it (and it's kept
    // out of the sitemap too). getStaticPaths handles the dynamic county/category/
    // listing routes; the final built-in pass strips remaining :/* patterns.
    // Note: routesToPaths collects child paths WITHOUT a leading slash (e.g.
    // "admin", "fire-towers"), so normalise before matching.
    includedRoutes(paths) {
      return paths.filter((p) => {
        const norm = p.replace(/^\//, '')
        return norm !== 'admin' && !norm.startsWith('admin/')
      })
    },
  },
})
