# hudson-valley-almanac

Hudson Valley Almanac — a regional directory of farms, makers, markets, and stewards of essential life across twenty-one counties of the Hudson Valley and the adjacent Catskill highlands.

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
- `/listing/:slug` — every published listing (LocalBusiness + BreadcrumbList
  JSON-LD, a Home › Category › County breadcrumb, and 12 related listings)
- `/county/:county` — every geographic county
- `/category/:category` — every mapped category
- `/county/:county/:category` — every non-empty county×category combo
- `<any of the three above>/page/:n` — pages 2..N when a set has more than
  `COLLECTION_PAGE_SIZE` (100) listings

`/admin` is excluded from prerendering and the sitemap.

### URLs, 404s and redirects

- Any URL without a prerendered page gets `dist/404.html` with HTTP 404 (a
  noindex "Page not found" page linking home and every category and county).
  There is no catch-all SPA rewrite; only `/admin` is rewritten (to the 404
  shell, with HTTP 200), since it renders client-side.
- `vercel.json` 301s trailing-slash URLs to the slashless URL, `/buy-sell-trade`
  to `/category/buy-sell-trade`, `/news/page/1` to `/news`, `/listings/:slug` to
  `/listing/:slug`, and the `.vercel.app` host to www.
- The apex `hudsonvalleyalmanac.com` → `www` redirect is a Vercel domain
  setting, not `vercel.json`. Vercel's own HTTP → HTTPS redirect (308, same
  host) always runs first, so `http://hudsonvalleyalmanac.com/` takes two hops.
- `/map`, `/saved` and `/trip` are noindex (meta tag and `X-Robots-Tag`).

### Build pipeline

`npm run build` runs five steps (plus a service worker check):

1. `scripts/snapshot.mjs` — fetches all published listings once (paginated past
   PostgREST's 1,000-row cap) into `src/data/listings.json` (an explicit,
   PII-free column allowlist). This snapshot is git-ignored and regenerated each
   build.
2. `scripts/check-guide-links.mjs` — checks every listing link hard-coded in the
   guides (the Farm Trails / Beverage Trails / Explore by Theme bodies and the
   Freezer Full list) against the published listings in the snapshot and
   `redirects/listing-slugs.json`. It prints a warning for each link with no
   published listing, and writes the git-ignored `src/data/guide-links.json`,
   which makes those stops render as plain text (name only) instead of linking
   to "Listing not found". It also warns if `vercel.json` is out of sync with
   the redirects file. It never fails the build. Run it on its own with
   `npm run check-guide-links` (after a build or `npm run dev`, so the snapshot
   exists).
3. `vite-react-ssg build` — `src/data/build-data.js` reads the snapshot to
   enumerate routes (`getStaticPaths`) and supply each page's data (`loader`).
   The snapshot is dynamically imported behind an `import.meta.env.SSR` guard, so
   it never ships to the browser.
4. `scripts/emit-404.mjs` — moves the prerendered `/404` route to
   `dist/404.html`, which Vercel serves for unknown URLs.
5. `scripts/generate-sitemap.mjs` — scans the built HTML and writes a sitemap
   index (`dist/sitemap.xml`, which `robots.txt` points at) over per-type
   sitemaps: listings, news, trails & themes, categories & counties, and other
   pages. Only pages that are indexable and canonical to themselves are listed.
   `lastmod` changes only when a page's content hash changes: the previous
   build's hashes are read back from the live `/sitemap-state.json`.

Requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the build
environment (set on Vercel). Without them the snapshot is empty and only the
static routes are generated.

A listing added after a build has no prerendered page until the next deploy; the
live homepage reads Supabase directly so new listings appear there immediately,
and `/listing/:slug` falls back to a live fetch for any not-yet-prerendered slug.

### Changing a listing's slug

Listing pages live at `/listing/<slug>`, and the slug is also hard-coded in
guide pages, news posts, and other sites' links. If you change a slug in the
database, add a redirect so the old URL keeps working:

1. Add an entry to `redirects/listing-slugs.json` (a JSON array):

   ```json
   [
     { "from": "old-slug", "to": "new-slug" }
   ]
   ```

2. Run `npm run redirects`. It writes a permanent (301) redirect from
   `/listing/old-slug` to `/listing/new-slug` into the `redirects` list in
   `vercel.json`, and leaves every other setting there (crons, host redirects,
   rewrites, headers) as it is. Chains are collapsed, so `a -> b` plus `b -> c`
   sends `a` straight to `c`.
3. Commit both files and deploy.

`vercel.json` has to be committed because Vercel reads it when a deployment
starts, before the build runs, so the build can't add redirects itself. The
build's guide link check warns if the two files are out of sync, if a redirect
points at a listing that isn't published, or if a redirect's `from` slug is
still a published listing (the redirect would hide that page). Guide links to
an old slug follow the redirect automatically. To remove a redirect, delete its
entry and run `npm run redirects` again.

### Dev

`npm run dev` runs `vite-react-ssg dev` (SSR dev) so the loader-driven pages
render with data locally.
