// Checks vercel.json's fixed-path redirects against the finished build.
//
// Vercel applies "redirects" before it looks at the build output, so a redirect
// whose source is a page we now prerender hides that page: e.g. the
// /county/greene/page/3 -> /page/2 redirect (for old URLs that 404'd) would
// swallow a real page 3 once Greene grows past two pages, and the pager's own
// "page 3" link would bounce back to page 2. A redirect whose destination is not
// a prerendered page sends visitors and crawlers to a 404.
//
// Only literal sources and destinations are checked (no :params, wildcards or
// regex groups, no host conditions, no external destinations); the generic
// rules (trailing slash, host, /listings/:slug) are skipped.
//
// Fails the build on either problem, so it is fixed in vercel.json instead of
// shipping a hidden page or a redirect to a 404. Run after the SSG build.
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "dist");

const LITERAL = /^\/[A-Za-z0-9/_-]*$/;

async function isPage(path) {
  const file = path === "/" ? resolve(DIST, "index.html") : resolve(DIST, "." + path, "index.html");
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

// A build with no Supabase env (local, empty snapshot) has no county/category
// pages, so every destination would look missing. Nothing to check then.
if (!(await stat(resolve(DIST, "county")).catch(() => null))) {
  console.warn("[redirects] WARNING: no county or category pages in dist/ (empty listings snapshot?); skipped the redirect check.");
  process.exit(0);
}

const config = JSON.parse(await readFile(resolve(ROOT, "vercel.json"), "utf8"));
const errors = [];
let checked = 0;
for (const r of config.redirects || []) {
  if (r.has || r.missing || !LITERAL.test(r.source || "")) continue;
  // Listing slug redirects are managed by sync-listing-redirects.mjs; their old
  // slug never has a page, and a new slug can be published after the build.
  if (r.source.startsWith("/listing/")) continue;
  checked++;
  if (await isPage(r.source)) {
    errors.push(`${r.source} is redirected to ${r.destination}, but ${r.source} is now a real page. Remove that redirect from vercel.json.`);
  }
  if (LITERAL.test(r.destination || "") && !(await isPage(r.destination))) {
    errors.push(`${r.source} is redirected to ${r.destination}, which is not a page in this build (it would 404). Point it somewhere real.`);
  }
}

if (errors.length) {
  for (const e of errors) console.error(`[redirects] ERROR: ${e}`);
  process.exit(1);
}
console.log(`[redirects] ${checked} fixed-path redirect${checked === 1 ? "" : "s"} in vercel.json checked against dist/.`);
