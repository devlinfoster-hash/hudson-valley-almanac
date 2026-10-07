# Hudson Valley Almanac

Site: https://www.hudsonvalleyalmanac.com (production on Vercel). See README.md
for the stack and build pipeline.

## Working rules

- Make website code changes only when asked.
- Data work on the almanac databases (adding listings, corrections, link
  cleanup, enrichment) is pre-approved.

## SEO rules

- Always use canonical `https://www.hudsonvalleyalmanac.com` URLs, with no
  trailing slash.
- Indexable pages (home, categories, counties, listings, news, trails, themes)
  must never send an `X-Robots-Tag: noindex` header on production. Preview
  deployments send it by default; production must not.
- `/map`, `/saved`, `/trip` and `/admin` send `X-Robots-Tag: noindex` on
  purpose (see `vercel.json`). Keep it.
- /map, /saved, /trip and /admin send both the noindex header and a noindex meta tag.
- Sitemaps are built from the finished HTML (`scripts/generate-sitemap.mjs`) and
  list only pages whose canonical points to themselves. Never add noindex or
  non-canonical pages to them.
- Unknown URLs must return a real HTTP 404 (`dist/404.html`), never the
  homepage with a 200.
