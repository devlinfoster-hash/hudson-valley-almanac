# Hudson Valley Almanac — Canonical Domain Audit

**Date:** 2026-09-20
**Branch:** `claude/keen-einstein-wq97t7` (the task asked for `fix/canonical-domain`;
this session is pinned to the branch above, so rename the branch or the PR head if
you want the original name — the commits are identical either way.)
**Scope:** the canonical-domain emergency only. `vercel.json`, `vite.config.js`,
`index.html`, `src/App.jsx`, `public/robots.txt`, `scripts/generate-sitemap.mjs`,
and the live Vercel project `hudson-valley-almanac`
(team `devlin-foster-s-projects`, `prj_PLP2TlGCF2oOC9SIu9lo8Gu3Nr3Y`).

`npm run build` is green after every commit. Nothing was pushed to `main`. No DNS,
Supabase, Vercel dashboard setting, or Search Console submission was touched.

> **Note on a premise in the task brief.** The brief said "No SSR or prerendering
> currently — this is a true SPA with zero server-rendered content." That is no
> longer true; see §4. The site prerenders 1,880 pages at build time. The
> canonical-host problem was real and is addressed below, but the "invisible to
> search" framing does not apply to the prerendered routes.

---

## 1. What was actually broken

Of the three live hosts named in the brief, **one** was still serving duplicate
content with no redirect.

| Host | State found | Action |
|---|---|---|
| `www.hudsonvalleyalmanac.com` | Primary. Serves the site. | Unchanged — this is canonical. |
| `hudsonvalleyalmanac.com` (apex) | **Already redirecting** to www at the Vercel *domain* level, status 308. | No change needed; `vercel.json` fallback rule tightened. |
| `hudson-valley-almanac.vercel.app` | **200 OK on every page.** A full, crawlable third copy of the site. | Fixed — 301 to www (commit 1). |

Verified live, read-only, via the Vercel API:

```
hudsonvalleyalmanac.com          redirect: www.hudsonvalleyalmanac.com   status: 308
www.hudsonvalleyalmanac.com      redirect: (none)
hudson-valley-almanac.vercel.app redirect: (none)      ← the hole
```

and by fetching `https://hudson-valley-almanac.vercel.app/fire-towers`, which
returned `200 OK` with the full page body.

Two smaller duplicate-URL defects turned up in the same pass and are fixed here
(commits 2 and 3).

*(Direct `curl` to the three hostnames is blocked by this session's egress policy —
all three returned `403` at the proxy, not from the site. Every live observation in
this document therefore comes from the Vercel API or the Vercel fetch tool, which
reach the deployment through an allowed path.)*

---

## 2. Fixed on this branch (one commit each)

### Commit 1 — `301-redirect the .vercel.app host to the canonical www domain`
`vercel.json` gains a host-matched redirect for `hudson-valley-almanac.vercel.app`,
mirroring the existing apex rule. This is a **server-level 301**, emitted by
Vercel's edge before any JS runs, which is what Googlebot needs to see.

It matches the **exact** production alias, not a wildcard on `*.vercel.app`.
Preview deployments get per-deployment hostnames
(`hudson-valley-almanac-<hash>-devlin-foster-s-projects.vercel.app`), so they are
untouched and still directly reachable for review.

Both redirect rules now say `"statusCode": 301` instead of `"permanent": true`
(which emits 308). Google treats 301 and 308 identically as permanent, but 301 is
what the brief asked for and what the rest of the tooling expects.

**Important precedence note:** the apex redirect is configured on the Vercel
project's *Domains* tab, and domain-level redirects run at the edge **before** the
deployment's `vercel.json` routing. So `hudsonvalleyalmanac.com` will keep emitting
the dashboard's **308**, not the 301 in this file, until you change the dashboard
setting (see §5). The `vercel.json` apex rule is a fallback if the domain-level
redirect is ever removed. The `.vercel.app` rule, by contrast, has no domain-level
equivalent — Vercel does not let you set a redirect on the auto-assigned
`*.vercel.app` alias — so `vercel.json` is the only place that fix can live, and it
takes effect on the next production deploy.

### Commit 2 — `301 the legacy /listings/:slug alias to canonical /listing/:slug`
Every listing had two crawlable URLs: `/listing/<slug>` (prerendered, canonical) and
`/listings/<slug>` (plural — an old alias, also returning 200). The plural route's
canonical tag already pointed at the singular form, but that tag is only emitted
*after JS runs*, because the plural route is not prerendered — the edge serves the
SPA fallback HTML there. A crawler that doesn't execute JS saw a 200 with no
correct canonical.

Now redirected server-side, so the duplicate never resolves. The React route stays
in the table as a client-side safety net for in-app links.

### Commit 3 — `Mark a listing slug that resolves to nothing noindex, not canonical-to-home`
A `/listing/<slug>` whose slug isn't in the database rendered "Listing not found"
while emitting `<link rel="canonical">` **and** `og:url` pointing at the homepage.
That tells Google the URL is a duplicate of `/` — a consolidation signal, not a
dead-end signal, and one of the shapes that surfaces in Search Console as a
redirect rather than a 404.

It now emits `<meta name="robots" content="noindex">` and no canonical at all, in
that state only. Pages that resolve to a real listing are untouched, and the
loading state emits neither, so a slow fetch never flashes `noindex` on a page that
does exist.

---

## 3. Verified — already correct, no change made

### Canonical tags: present on every route, all pointing at www
Checked in the **built output**, not just the source. All 43 prerendered HTML files
produced by a local build carry exactly one `<link rel="canonical">`, and every one
of them is on `https://www.hudsonvalleyalmanac.com`. Zero pages missing a canonical.

By route:

| Route | Canonical | Where set |
|---|---|---|
| `/` | `/` — and `/county/<x>` or `/category/<y>` when a single filter is active, so `?county=` / `?category=` states don't compete with the real landing pages | `HomePage` |
| `/fire-towers` | `/fire-towers` | `FireTowersPage` |
| `/about` | `/about` | `AboutPage` |
| `/farm-trails`, `/beverage-trails`, `/explore-by-theme` | self | index pages |
| `/farm-trails/<slug>` (37 guides) | self | `FarmTrailGuidePage` |
| `/county/<county>` (21) | self | `CountyPage` |
| `/category/<cat>` (25) | self | `CategoryPage` |
| `/county/<county>/<cat>` (362) | self | `ComboPage` |
| `/listing/<slug>` (1,429) | `/listing/<slug>` | `ListingPage` |
| `/listings/<slug>` | → 301 to singular (commit 2) | `vercel.json` |
| `*` (404) and `/admin` | no canonical, `noindex` — correct | `NotFoundPage`, `AdminPage` |

The origin is a single constant, `SITE_ORIGIN` in `src/catalog.js`, so there is one
place to change if the canonical host ever moves.

### Fire Towers page: already correctly tagged
It was **not** missed by the SEO work. Fetched live from the deployment, the static
HTML of `/fire-towers` contains, before any JS runs:

```html
<title>Hudson Valley Fire Towers — Hudson Valley Almanac</title>
<meta name="description" content="Standing, climbable fire towers across the Hudson
  Valley and the Catskill highlands, including the Catskills Fire Tower Challenge.">
<link rel="canonical" href="https://www.hudsonvalleyalmanac.com/fire-towers">
<meta property="og:url" content="https://www.hudsonvalleyalmanac.com/fire-towers">
<meta property="og:title" ...> <meta property="og:description" ...>
<meta property="og:image" ...> <meta name="twitter:card" content="summary_large_image">
```

Per-page title ✅ · per-page description ✅ · canonical on www ✅ · OG/Twitter ✅ ·
in the sitemap ✅. **No fix was needed**, so none was made.

One caveat, reported not fixed — see §6.2: the page's *shell* is prerendered, but
the tower cards themselves are fetched from Supabase in the browser. The static HTML
ships `<div class="loading">Loading fire towers</div>` where the content goes. The
meta tags are fine; the body is not visible to a crawler that doesn't run JS.

### Sitemap: www-only, Fire Towers included
`scripts/generate-sitemap.mjs` builds every `<loc>` from `SITE_ORIGIN`, so it is
structurally incapable of emitting a non-www URL. Confirmed on the local build: 43
of 43 URLs on `https://www.hudsonvalleyalmanac.com`, zero on any other host, and
`/fire-towers` present as an explicit static route.

The **live** production build (deployment `dpl_5AifCacbcXgntevjpcxxTwEWG5cg`, commit
`f1ba671`, currently serving) logged:

```
[sitemap] Wrote dist/sitemap.xml (1880 urls: 1429 listings, 21 counties,
                                   25 categories, 362 combos)
```

No regeneration was needed. `public/robots.txt` points at
`https://www.hudsonvalleyalmanac.com/sitemap.xml` — correct host.

### Trailing slashes
`vite.config.js` uses `dirStyle: 'nested'`, emitting `path/index.html`. Vercel serves
`/fire-towers` from `fire-towers/index.html` directly — the live fetch returned 200
with page content and no redirect hop, so sitemap URLs (which have no trailing
slash) are not bouncing through a normalization redirect. This was worth ruling out
as a "Page with redirect" source; it is not one.

---

## 4. County/category prerendering: **built and live** — not outstanding

The brief listed this as possibly never implemented. It was implemented and is in
production. Do not schedule it as follow-up work.

- Shipped in commit `e55d47a`, merged as `4027930` ("Merge pull request #14: SSG
  prerendering + county/category landing pages for SEO").
- `package.json` builds with `vite-react-ssg`, not plain `vite`.
- `scripts/snapshot.mjs` pulls every published listing from Supabase once at build
  time into `src/data/listings.json`; `src/data/build-data.js` feeds it to
  `getStaticPaths()`/`loader()` for the county, category, combo, and listing routes.
- The live deployment prerendered **1,880 pages**, each with its own title,
  description, canonical, OG tags, and `CollectionPage`/`LocalBusiness` JSON-LD in
  the static HTML.
- `/admin` is explicitly excluded from prerendering and from the sitemap.

What is genuinely missing is not the prerendering — it's what happens to URLs that
*aren't* prerendered. See §6.1.

---

## 5. Owner must do — Vercel and DNS

### 5a. DNS at Namecheap — **no change required**
Both `hudsonvalleyalmanac.com` and `www.hudsonvalleyalmanac.com` report
`verified: true` in Vercel, which means the DNS records already point at Vercel
correctly. There is nothing to change at Namecheap for this fix, and I attempted
nothing there.

Worth confirming once, while you're in the registrar, that the apex uses Vercel's
recommended A record and `www` a CNAME to Vercel — not a registrar-level URL
forward or a parking page, either of which would sit in front of everything below.

### 5b. Vercel — deploy the branch (required for the fix to take effect)
The `.vercel.app` redirect lives in `vercel.json`, so it is inert until this branch
is merged and deployed to production. After the deploy, confirm:

```
curl -sSI https://hudson-valley-almanac.vercel.app/fire-towers
  → HTTP/1.1 301
  → location: https://www.hudsonvalleyalmanac.com/fire-towers

curl -sSI https://www.hudsonvalleyalmanac.com/listings/<any-real-slug>
  → HTTP/1.1 301
  → location: /listing/<same-slug>

curl -sSI https://www.hudsonvalleyalmanac.com/fire-towers
  → HTTP/1.1 200   (must NOT redirect — this is the canonical host)
```

That last one matters: if the canonical host ever starts redirecting to itself, the
whole site drops out of the index. Check it before walking away.

### 5c. Vercel — optional, apex redirect status code (dashboard only)
*Vercel → hudson-valley-almanac → Settings → Domains → `hudsonvalleyalmanac.com`.*
It currently redirects to `www.hudsonvalleyalmanac.com` with **308**. Google treats
308 as a permanent redirect exactly like 301 and passes signals identically, so
**this is not a bug and needs no action.** Change it to 301 only if you want every
host on the account emitting the same code for consistency. It cannot be changed
from code — domain-level redirects override `vercel.json`.

### 5d. Vercel — do not remove the `.vercel.app` domain
It may be tempting to detach `hudson-valley-almanac.vercel.app` instead. Don't:
Vercel always assigns a production alias, so removing it doesn't stop the host
existing. The redirect is the durable fix.

---

## 6. Reported, not fixed — deliberately out of scope

### 6.1. Non-prerendered URLs serve the homepage with the homepage's canonical ⚠️
**This is the largest remaining canonicalization defect and I recommend it as the
next piece of work.**

`vercel.json` rewrites any unmatched path to `/index.html`. Under `vite-react-ssg`,
`dist/index.html` **is the prerendered homepage** — including
`<link rel="canonical" href="https://www.hudsonvalleyalmanac.com/">`. So any URL
that wasn't prerendered returns:

- HTTP **200**, not 404, and
- the homepage's title, description, and canonical.

Affected: any listing added to Supabase since the last deploy (the snapshot is taken
at build time, so new listings are not prerendered until something triggers a
rebuild), plus every genuinely wrong URL anyone links to. To a crawler each of these
is either a soft 404 or a duplicate of the homepage. This is consistent with the
shape of the Search Console symptoms and, unlike the host problem, it is *ongoing*
rather than a one-time migration artifact.

Two parts to the fix, both more than a config tweak:

1. **A neutral SPA fallback.** Emit a `dist/spa-fallback.html` at the end of the
   build — same script and style tags, but no title, description, canonical, or OG
   tags — and point the rewrite at it instead of `/index.html`. Needs care: the
   fallback must still hydrate correctly, so it can't simply be a stripped copy of a
   prerendered page.
2. **A rebuild when content changes.** A Supabase webhook or a scheduled Vercel
   deploy hook, so a newly published listing gets a prerendered page within hours
   rather than at the next unrelated code push.

### 6.2. Fire Towers body content is client-fetched, not prerendered
As noted in §3: correct meta tags, but the tower data comes from a browser-side
Supabase query and the static HTML shows only a loading spinner. The `fire_towers`
table is small (16 rows), so folding it into `scripts/snapshot.mjs` and a route
`loader()` — exactly the pattern the county/category pages already use — would be a
modest change. It touches the build data pipeline, which is outside the
canonical-domain scope, so it is reported rather than done.

### 6.3. Interpreting the Search Console numbers
Offered as reading, not as a finding:

- **"Page with redirect" 5 → 32** is largely the *expected* result of the apex
  redirect going live. Previously-indexed `hudsonvalleyalmanac.com/...` URLs are now
  permanently redirected, and Search Console files those under "Not indexed → Page
  with redirect" **forever**. For a redirected duplicate host that is the correct
  end state, not an error to clear. The bare root domain appearing in that list is
  exactly this. Expect the count to rise again, once, as any indexed
  `.vercel.app` URLs join them after the fix in commit 1 deploys.
- **Indexed 34 → 18** is partly that same consolidation. But 18 indexed against
  1,880 sitemap URLs is the number actually worth attention, and it points at crawl
  coverage on a young site — a separate investigation from this one, and one where
  §6.1 is the most likely code-side contributor.

---

## 7. Report only — no action taken

### 7.1. Search Console "Validate Fix" — process, timing is yours
I did not open Search Console or submit anything.

When you're ready, the process is:

1. Deploy this branch to production and verify the three `curl` checks in §5b.
2. In Search Console, make sure **`https://www.hudsonvalleyalmanac.com` is the
   property you are working in.** If the property is the apex or a non-www
   URL-prefix property, its numbers will now legitimately show almost everything as
   redirected. Consider adding a *Domain* property (DNS-verified) so both hosts roll
   up into one view.
3. *Indexing → Pages → "Page with redirect"* → open it → **Validate Fix**.
4. Validation runs for roughly 1–2 weeks and emails the result.

**My recommendation on timing:** for the URLs that are redirecting *because of the
apex and `.vercel.app` consolidation*, there is nothing to validate — the redirect
is the intended final state, and a validation attempt will simply confirm they still
redirect. Validation is worth running only if, after the deploy, you still see www
URLs listed as redirects. Use *URL Inspection → Test Live URL* on two or three
specific www URLs first; that is faster and tells you more than a two-week
validation run.

Also worth doing once the fix is live: resubmit
`https://www.hudsonvalleyalmanac.com/sitemap.xml` in *Sitemaps* to prompt a recrawl.

### 7.2. Other domains on the same Vercel account — same pattern, untouched
Checked read-only. **Nothing in this PR touches either project.**

**`meanderny`**
| Domain | State |
|---|---|
| `www.meanderny.com` | primary |
| `meanderny.com` | redirects to www — but **no explicit status code is recorded**, so it uses Vercel's default rather than a stated 301/308. Worth confirming in the dashboard that it is permanent; a temporary redirect does not consolidate ranking signals. |
| `meanderny.vercel.app` | **no redirect — same duplicate-host hole HVA had.** |

**`mohawk-valley-almanac`**
| Domain | State |
|---|---|
| `www.mohawkvalleyalmanac.com` | primary |
| `mohawkvalleyalmanac.com` | **not attached to the project at all** — so the apex is not being redirected by Vercel. Check what, if anything, serves it. |
| `mohawk-valley-almanac.vercel.app` | **no redirect — same duplicate-host hole.** |

Both would take the same one-rule `vercel.json` change as commit 1 here, in their
own repositories. This is also the item the original Mohawk Valley Almanac audit
flagged as "coordinate with the owner" and which was never closed out — for HVA it
is closed now.

---

## Appendix — previous audit (retained for history)

The document below is the earlier general audit of this repo, from the
`audit/safe-fixes` branch. It is kept for the record. Two of its open items have
since been resolved and its text is stale on those points:

- **§2c "Canonical host"** — resolved. Apex redirects at the domain level;
  `.vercel.app` is fixed by commit 1 of this audit.
- **§2d "`sitemap.xml` is missing"** — resolved. `scripts/generate-sitemap.mjs` runs
  on every build and emitted 1,880 URLs on the current production deployment.
- **§3 P1 item 2 (generate sitemap) and item 3 (canonical host)** — both done.

<details>
<summary>Previous audit — full text</summary>

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

</details>
