// What the service worker (src/sw.js) may cache, as one pure function so the
// rules are unit-tested (cache-rules.test.js) and the worker can't drift from
// them.
//
// Only same-origin GET requests are ever cached. Everything cross-origin goes
// straight to the network untouched: map tiles (Stadia Maps or any other tile
// provider), the Supabase API, Google Fonts/Analytics, Buy Me a Coffee and every
// other external link. mailto:/tel: links are never fetched at all.
//
// Same-origin:
//   "map-data" - the /map listings JSON (a hashed asset): stale-while-revalidate
//   "page"     - a page navigation: network-first, so nightly rebuilds show up
//                straight away, with the last copy kept for offline use
//   null       - anything else not precached: /admin, /api, the per-page loader
//                data, the sitemap, and the service worker itself
//
// The app shell (hashed JS/CSS, icons, manifest) is precached at install time;
// see `injectManifest` in vite.config.js.

export const MAP_DATA_PATH = /^\/assets\/listings-map-[\w-]+\.json$/;

// Paths that are never cached, page or not.
const NEVER = [/^\/admin(\/|$)/, /^\/api(\/|$)/, /^\/sw\.js$/, /^\/workbox-/, /^\/static-loader-data/, /^\/sitemap/];

// `request` needs { url, method, mode }; `origin` is the site's own origin.
export function cacheRuleFor(request, origin) {
  if (!request || (request.method && request.method !== "GET")) return null;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.origin !== origin) return null;
  const path = url.pathname;
  if (NEVER.some((re) => re.test(path))) return null;
  if (MAP_DATA_PATH.test(path)) return "map-data";
  if (request.mode === "navigate") return "page";
  return null;
}
