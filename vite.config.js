import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  ssgOptions: {
    // Emit path/index.html (e.g. /county/delaware/index.html) so Vercel serves
    // each prerendered route cleanly via the filesystem before the SPA rewrite.
    dirStyle: 'nested',
    // /admin is an authenticated dashboard — never prerender it (and it's kept
    // out of the sitemap too). getStaticPaths handles the dynamic county/category/
    // listing routes; the final built-in pass strips remaining :/* patterns.
    includedRoutes(paths) {
      return paths.filter((p) => p !== '/admin')
    },
  },
})
