import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { pwaOptions } from './src/pwa/pwa-options.js'

// Installable app + service worker. The worker is our own src/sw.js
// (injectManifest), whose caching rules live in src/pwa/cache-rules.js; the
// plugin options live in src/pwa/pwa-options.js. Registration happens in
// src/pwa/PwaPrompts.jsx, client-side only, so the SSG prerender never
// touches it.
//
// Kill switch: VITE_PWA_KILL=1 at build time builds a self-destroying sw.js
// (it unregisters itself and clears its caches) and the app stops registering.
// To roll back the service worker on all visitors: set VITE_PWA_KILL=1 in Vercel and redeploy.
export default defineConfig(({ mode }) => ({
  // loadEnv covers both Vercel's environment variables and local .env files.
  plugins: [react(), VitePWA(pwaOptions(loadEnv(mode, process.cwd(), 'VITE_PWA_')))],
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
}))
