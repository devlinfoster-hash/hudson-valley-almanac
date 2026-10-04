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
- `/listing/:slug` — every published listing (LocalBusiness JSON-LD)
- `/county/:county` — every geographic county
- `/category/:category` — every mapped category
- `/county/:county/:category` — every non-empty county×category combo

`/admin` is excluded from prerendering and the sitemap.

### Build pipeline

`npm run build` runs four steps:

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
4. `scripts/generate-sitemap.mjs` — writes `dist/sitemap.xml` from the same
   snapshot.

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
