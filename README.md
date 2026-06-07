# hudson-valley-almanac

Hudson Valley Almanac — a regional directory of farms, makers, markets, and stewards of essential life across nineteen counties of the Hudson Valley and the adjacent Catskill highlands.

## Stack

React 18 + Vite, React Router v6, Supabase, deployed on Vercel.

## SEO / static generation

The site is statically generated at build time with
[`vite-react-ssg`](https://github.com/Daydreamer-riri/vite-react-ssg) so every
route ships real, page-specific HTML (title, description, canonical, Open Graph,
and listing content) that crawlers and social scrapers read without running JS.
Per-page `<head>` tags are rendered with react-helmet via `vite-react-ssg`'s
`<Head>` — never hardcoded in `index.html`.

Prerendered route types:

- `/` and `/fire-towers`
- `/listing/:slug` — every published listing (LocalBusiness JSON-LD)
- `/county/:county` — every geographic county
- `/category/:category` — every mapped category
- `/county/:county/:category` — every non-empty county×category combo

`/admin` is excluded from prerendering and the sitemap.

### Build pipeline

`npm run build` runs three steps:

1. `scripts/snapshot.mjs` — fetches all published listings once (paginated past
   PostgREST's 1,000-row cap) into `src/data/listings.json` (an explicit,
   PII-free column allowlist). This snapshot is git-ignored and regenerated each
   build.
2. `vite-react-ssg build` — `src/data/build-data.js` reads the snapshot to
   enumerate routes (`getStaticPaths`) and supply each page's data (`loader`).
   The snapshot is dynamically imported behind an `import.meta.env.SSR` guard, so
   it never ships to the browser.
3. `scripts/generate-sitemap.mjs` — writes `dist/sitemap.xml` from the same
   snapshot.

Requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the build
environment (set on Vercel). Without them the snapshot is empty and only the
static routes are generated.

A listing added after a build has no prerendered page until the next deploy; the
live homepage reads Supabase directly so new listings appear there immediately,
and `/listing/:slug` falls back to a live fetch for any not-yet-prerendered slug.

### Dev

`npm run dev` runs `vite-react-ssg dev` (SSR dev) so the loader-driven pages
render with data locally.
