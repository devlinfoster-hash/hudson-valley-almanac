# Hudson Valley Almanac — Audit

Scope: `src/App.jsx`, `src/supabase.js`, `index.html`, `vercel.json`,
`vite.config.js`, `package.json`, `public/`. Stack: Vite + React 18 + React
Router, Supabase (anon key in the browser), deployed on Vercel. GA4 via gtag
in `index.html` with `send_page_view:false`; `App.jsx` fires `page_view` plus
custom events.

All code changes live on branch `audit/safe-fixes` (one logical change per
commit). `npm run build` passes after every commit. Nothing was pushed to
`main`; no auth, RLS policy, DNS, or dashboard settings were touched.

---

## 1. Fixed (safe, on this branch)

Each item is a single commit.

### a. `page_view` fired on every keystroke
`App()`'s `page_view` effect depended on the full `location.search`. The live
search term lives in `?q=` and is rewritten on every keystroke, so typing
logged one GA4 `page_view` per character — heavily inflating pageviews and
polluting the "search" funnel.
**Fix:** derive a navigation key from `pathname` + all query params *except*
`q`, and depend on that. `page_view` now fires only on real navigations
(route / category / county / town / ag), never while typing. The custom
`search` event (debounced, 800 ms) remains the single source of search
analytics.

### b. No catch-all 404
Unmatched paths matched no `<Route>` and rendered a blank page.
**Fix:** added `<Route path="*" element={<NotFoundPage />} />` with a friendly
not-found screen (uses the site's masthead/footer chrome) that links home.

### c. Duplicate `<style>` injection
`sharedStyles` (~95 lines of CSS) was injected via `<style>` in **both**
`HomePage` and `ListingPage`, so navigating between them mounted a second
identical stylesheet.
**Fix:** inject `sharedStyles` once at the `App` level; removed both
per-page injections. Every route (incl. the new 404) now shares one copy.

### d. Accessibility
- The search `<input>` and the county/town `<select>`s had no labels →
  added `aria-label`s.
- The clickable category `<div>`s in the sidebar **and** the mobile drawer
  had `onClick` but no role or keyboard support → added `role="button"`,
  `tabIndex={0}`, `aria-pressed`, and Enter/Space handlers (`handleKeyActivate`).
- Modals: the submit dialog and mobile drawer now close on **Escape**, are
  marked `role="dialog"` / `aria-modal="true"` with an accessible name, the
  submit dialog moves focus into itself on open, and the "X" close buttons
  have `aria-label="Close"`.
- *Not done (see improvements):* a full focus **trap** (Tab cycling kept
  inside the modal) and `htmlFor`/`id` association on the submit-form fields —
  larger changes, reported below.

### e. SEO / crawlability
- Listing pages set `document.title`/description via JS only, with no
  canonical or structured data.
- **Fix:** shipped a site-root `<link rel="canonical">` in `index.html`; on
  each listing, inject a per-listing canonical (`/listing/<slug>`) **and** a
  `LocalBusiness` JSON-LD block (name, address built from town + county,
  telephone, url, category; `geo` is emitted only if lat/long exist — the
  `listings` table currently has no coordinate columns, so it is omitted).
  Both nodes are cleaned up on unmount (canonical reset to root).
- `robots.txt` is sane (`Allow: /`, points at the sitemap).

### f. `vercel.json` security headers + caching
Added for all routes: `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`,
`X-Frame-Options: SAMEORIGIN`, and `Content-Security-Policy: frame-ancestors
'self'`. Added `Cache-Control: public, max-age=31536000, immutable` for the
hashed `/assets/*` bundles. The existing SPA rewrite to `/index.html` is
preserved.
**Note:** the CSP is intentionally limited to `frame-ancestors` only. A full
`default-src`/`script-src` policy would need to allowlist gtag/GTM, Google
Fonts, and the Supabase REST host, and risks breaking the app — see
improvements.

### g. Top-level error boundary + surfaced Supabase failures
- Added an `ErrorBoundary` around the route tree; an unexpected render error
  now shows a graceful recovery screen instead of a blank page.
- `HomePage.fetchListings` previously caught a failed fetch and only
  `console.error`'d it, leaving an empty directory indistinguishable from "no
  results". Added a `loadError` state that shows a retry message. (Note: this
  is the real fix for "Supabase failure shows a blank list" — the async error
  is caught in JS and never reaches the error boundary.)

---

## 2. Owner must do (not changed here — secrets / auth / infra)

### ⚠️ a. Admin auth — IMPLEMENTED in code; owner setup remaining
**Original problem:** `/admin` gated on
`pw === import.meta.env.VITE_ADMIN_PASSWORD`. Vite inlines every `VITE_*`
variable into the public client bundle, so the admin password shipped in
plaintext in the shipped JavaScript, recoverable by anyone.

**Done (code):** the password gate is removed and `/admin` now authenticates
via **Supabase Auth passwordless email OTP** — the admin enters their email,
receives a 6-digit code, and signs in. Admin rights are confirmed server-side
with the `is_admin()` RPC (true only when the signed-in email is in
`public.admins`) and enforced by RLS; non-admins get a clear message. No
secret ships in the bundle anymore.

**Owner must still do (dashboard, not code):**
1. **Add the admin email to `public.admins`** (the table already has 1 row —
   confirm it's the address you'll sign in with). `is_admin()` matches the
   JWT email against this table.
2. **Make the OTP email template include the code.** Supabase's default
   "Magic Link" email sends a link, not a 6-digit code. In
   *Authentication → Email Templates → Magic Link*, ensure the body contains
   `{{ .Token }}` so the numeric code is delivered. (Email sending must be
   working — the built-in SMTP is fine for a single admin; a custom SMTP is
   recommended for reliability.)
3. **Remove `VITE_ADMIN_PASSWORD`** from the Vercel project env vars (it is no
   longer read by the code) and treat the old value as compromised.

**Important nuance (verified against the live DB, read-only):** the actual
data is *not* currently writable through this page, because Row-Level Security
on `public.listings` is correctly locked down:

| cmd    | roles                | rule                                      |
|--------|----------------------|-------------------------------------------|
| SELECT | anon, authenticated  | `status = 'published'`                     |
| INSERT | anon, authenticated  | `WITH CHECK status='pending' AND featured=false` |
| UPDATE | authenticated        | `is_admin()`                               |
| DELETE | authenticated        | `is_admin()`                               |
| SELECT (all) | authenticated  | `is_admin()` (reads pending too)           |

The browser uses the **anon** key, which cannot UPDATE/DELETE or read pending
rows. So the admin Approve/Reject buttons and the "Pending" tab can't actually
function with the anon key — the page is effectively a non-working UI guarded
by a leaked password, not an open write path. The leaked password is still a
real secret-exposure bug and should be removed regardless.

**Recommendation:** move `/admin` behind **Supabase Auth**. The database is
already set up for it — there is an `is_admin()` `SECURITY DEFINER` function
and an `admins` table, and the UPDATE/DELETE/admin-read policies are gated on
`is_admin()`. The app just needs to (1) sign the admin in via Supabase Auth so
the client acts as the `authenticated` role, (2) add the admin's email to
`admins`, and (3) drop the password check entirely. Do **not** ship a
service-role key to the browser as a shortcut.

### b. Supabase RLS — confirm and finish
RLS on `listings` already matches best practice (anon can only SELECT
published + INSERT pending; no anon UPDATE/DELETE). Two things for the owner
to confirm/clean up (do not let me change policies):
- `public.admins` has **RLS enabled but no policy** (security advisor
  `0008_rls_enabled_no_policy`). That's effectively deny-all, which is fine
  given `is_admin()` is `SECURITY DEFINER`; just confirm it's intentional.
- Advisors `0028`/`0029`: `is_admin()` is executable by `anon`/`authenticated`
  via `/rest/v1/rpc/is_admin`. Low risk (returns a boolean), but consider
  `REVOKE EXECUTE` from `anon` or `SECURITY INVOKER` if not needed publicly.
- Advisor links:
  https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy ,
  …`?lint=0028_anon_security_definer_function_executable` ,
  …`?lint=0029_authenticated_security_definer_function_executable`

### c. Canonical host (DNS / Vercel — coordinate, don't rush)
The code's canonical/OG host is `https://www.hudsonvalleyalmanac.com`, but the
app is also reachable at its `*.vercel.app` URL (and likely the apex
`hudsonvalleyalmanac.com`). Pick **one** canonical host and 301-redirect the
others to it (Vercel domain settings). Until then the per-page canonical tags
added in §1e at least tell crawlers which URL wins. This touches DNS/Vercel
config, so the owner should make the change.

### d. `sitemap.xml` is missing
`robots.txt` and the build both point at
`https://www.hudsonvalleyalmanac.com/sitemap.xml`, but **no `sitemap.xml`
exists** in `public/` (or anywhere in the repo). Crawlers get a 404. Because a
useful sitemap must enumerate all ~1,200 listing URLs from Supabase, this
needs a small build step rather than a hand-written file — see improvements.
Left unchanged to avoid shipping a stale/partial sitemap.

---

## 3. Prioritized improvement list

**P1 — correctness / security follow-ups**
1. **Implement Supabase Auth for `/admin`** (the concrete fix for §2a). The DB
   side already exists; this is mostly client work.
2. **Generate `sitemap.xml` at build time** (§2d): a small Node script that
   pulls published slugs from Supabase and writes `dist/sitemap.xml`, wired
   into `npm run build`. Include `/` and each `/listing/<slug>`.
3. **Decide the canonical host and add redirects** (§2c).

**P2 — performance**
4. **Client-side filtering of ~1,200 rows.** Filtering itself is cheap
   (a single `.filter()` over ~1,200 objects is sub-millisecond). The real
   cost is **rendering** — "All Resources" mounts ~1,200 `<Link>` cards (each
   with tags, linkified description) into the DOM at once, which hurts initial
   paint and scroll on low-end mobiles. Recommend **windowing/virtualization**
   (e.g. `react-window`) for the results list, or paginating the rendered
   output (the data is already fully in memory, so this is presentation-only).
   Server-side filtering is **not** needed at this scale and would add latency;
   keep the single fetch.
5. **Bundle size:** one ~417 KB (118 KB gzip) JS chunk. Code-split `AdminPage`
   (and ideally `ListingPage`) with `React.lazy` so the public homepage ships
   less JS.

**P3 — maintainability**
6. **Split the monolithic `App.jsx`** (~830 lines). *Reported, not done* — a
   clean split is safe but is a large single diff that's easy to get subtly
   wrong (shared `sharedStyles`, `categories`, helpers, GA4 helpers), so per
   the "when in doubt, report" rule it's left as a plan:
   - `src/lib/` → `supabase.js` (exists), `analytics.js` (`trackEvent`,
     `trackListingView`, `trackCategoryView`, `trackSearch`), `format.js`
     (`slugify`, `linkifyDescription`, `handleKeyActivate`).
   - `src/data/categories.js` → the `categories` array + the topbar/footer/
     contact constants.
   - `src/styles/shared.js` (or a real `.css` import) → `sharedStyles`.
   - `src/components/` → `Footer`, `SubmitForm`, `ErrorBoundary`,
     `MobileCategoryDrawer`.
   - `src/pages/` → `HomePage`, `ListingPage`, `AdminPage`, `NotFoundPage`.
   - `App.jsx` keeps only the router + the `page_view` effect + the single
     `sharedStyles` injection.
   Do it as several small commits (extract pure helpers/data first, then leaf
   components, then pages), running `npm run build` after each.

**P4 — accessibility polish (beyond §1d)**
7. Full **focus trap** in the submit modal / mobile drawer (keep Tab inside,
   restore focus to the trigger on close).
8. Associate submit-form `<label>`s with their inputs via `htmlFor`/`id`
   (currently adjacent but not programmatically linked).
9. Give the results region an `aria-live="polite"` so screen-reader users hear
   the result count change when filters/search update.

**P5 — housekeeping**
10. `npm audit`: 2 moderate advisories from `esbuild`/`vite`. These affect the
    **dev server only** and the fix is a major Vite bump (`vite@8`,
    breaking). Not a production risk; schedule the upgrade deliberately rather
    than via `audit fix --force`.
11. The `page_view` for a listing can fire with a stale `document.title`
    (the title is set in a later effect after data loads), so GA4 may record
    the previous page's title for listing views. Minor; worth aligning when
    `ListingPage` is refactored.
12. There are two routes for the same page (`/listing/:slug` and
    `/listings/:slug`); the canonical tag now points only at `/listing/...`,
    which resolves the duplicate-URL ambiguity for crawlers.
