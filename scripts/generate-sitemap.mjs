// Generates the sitemaps after the SSG build (and after scripts/emit-404.mjs).
//
// Source of truth is the built HTML itself, not a list of routes: every
// dist/**/index.html is a page Vercel serves with HTTP 200, and a page is listed
// only when it is indexable (no robots noindex) and its <link rel="canonical">
// points at itself on https://www (SITE_ORIGIN), with no query string or
// trailing slash. So a page that canonicalises elsewhere, is noindex (/saved,
// /trip, /map, the 404 page) or isn't prerendered can't end up in a sitemap.
//
// Output, split by page type so Search Console reports coverage per type:
//   dist/sitemap.xml            sitemap index (robots.txt points here)
//   dist/sitemap-listings.xml   /listing/*
//   dist/sitemap-news.xml       /news, /news/page/*, /news/*
//   dist/sitemap-trails-themes.xml        farm trails, beverage trails,
//                                         explore by theme, fire towers
//   dist/sitemap-categories-counties.xml  /category/*, /county/* (incl.
//                                         county×category and /page/N pages)
//   dist/sitemap-pages.xml      everything else (home, about, books, ...)
//   dist/sitemap-state.json     per-URL content hash + lastmod (see below)
//
// lastmod changes only when a page's content changes. Each page's main content
// (title, description, canonical, and the rendered body minus scripts, the
// footer and hashed asset names) is hashed. The previous production build's
// hashes and dates are read from SITEMAP_STATE_URL (default:
// https://www.hudsonvalleyalmanac.com/sitemap-state.json, which this script
// publishes): an unchanged hash keeps its old lastmod, a changed one gets
// today's date. A URL with no previous entry (new page, or the state couldn't
// be fetched) is dated from its data where there is a date (a listing's
// created/verified date, a news post's publish date), else today.
// SITEMAP_STATE_FILE=<path> reads the previous state from a local file instead
// (for local builds); SITEMAP_STATE_URL=off skips it.
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { SITE_ORIGIN } from "../src/catalog.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "dist");
const SNAPSHOT_PATH = resolve(ROOT, "src", "data", "listings.json");
const NEWS_PATH = resolve(ROOT, "src", "data", "news.json");
const STATE_NAME = "sitemap-state.json";

const GROUPS = [
  { name: "listings", test: (p) => p.startsWith("/listing/") },
  { name: "news", test: (p) => p === "/news" || p.startsWith("/news/") },
  {
    name: "trails-themes",
    test: (p) =>
      ["/farm-trails", "/beverage-trails", "/explore-by-theme", "/fire-towers"].includes(p) ||
      p.startsWith("/farm-trails/"),
  },
  { name: "categories-counties", test: (p) => p.startsWith("/category/") || p.startsWith("/county/") },
  { name: "pages", test: () => true },
];

function todayInNewYork() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

function xmlEscape(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]
  ));
}

async function* htmlFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(full);
    else if (entry.name === "index.html") yield full;
  }
}

// dist/county/ulster/index.html -> /county/ulster ; dist/index.html -> /
function pathFor(file) {
  const dir = relative(DIST, dirname(file)).split(sep).join("/");
  return dir ? `/${dir}` : "/";
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : null;
}

function headInfo(html) {
  const head = html.slice(0, html.indexOf("</head>"));
  const canonicalTag = head.match(/<link\b[^>]*\brel="canonical"[^>]*>/);
  const robotsTag = head.match(/<meta\b[^>]*\bname="robots"[^>]*>/);
  const descTag = head.match(/<meta\b[^>]*\bname="description"[^>]*>/);
  const title = head.match(/<title[^>]*>([\s\S]*?)<\/title>/);
  return {
    canonical: canonicalTag ? attr(canonicalTag[0], "href") : null,
    noindex: robotsTag ? /noindex/i.test(attr(robotsTag[0], "content") || "") : false,
    title: title ? title[1] : "",
    description: descTag ? attr(descTag[0], "content") || "" : "",
  };
}

// The page's own content, without the things that change on every deploy or
// belong to the site chrome rather than the page: scripts (hydration data,
// build hash), the footer, and the content hash in /assets/ file names.
function contentHash(html, head) {
  const start = html.indexOf('<div id="root"');
  const body = (start >= 0 ? html.slice(start) : html)
    .replace(/<script\b[\s\S]*?<\/script>/g, "")
    .replace(/<footer\b[\s\S]*?<\/footer>/g, "")
    .replace(/\/assets\/([\w.-]+?)-[\w-]{8}\.(\w+)/g, "/assets/$1.$2");
  return createHash("sha256")
    .update(JSON.stringify([head.title, head.description, head.canonical]))
    .update(body)
    .digest("hex")
    .slice(0, 32);
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function previousState() {
  let state = null;
  const file = process.env.SITEMAP_STATE_FILE;
  const url = process.env.SITEMAP_STATE_URL || `${SITE_ORIGIN}/${STATE_NAME}`;
  try {
    if (file) {
      state = JSON.parse(await readFile(file, "utf8"));
    } else if (url !== "off") {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (res.status === 404) {
        console.warn(`[sitemap] No previous state at ${url} (first build with it); dating pages from their data.`);
        return {};
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state = await res.json();
    }
  } catch (err) {
    console.warn(`[sitemap] WARNING: could not read the previous sitemap state (${err.message}); dating pages from their data.`);
    return {};
  }
  if (!state) return {};
  if (state.version !== 1 || typeof state.pages !== "object") {
    console.warn("[sitemap] WARNING: previous sitemap state has an unknown shape; ignoring it.");
    return {};
  }
  return state.pages;
}

// Dates from the data, for pages seen for the first time.
async function seedDates() {
  const dates = new Map();
  const day = (v) => (v ? String(v).slice(0, 10) : null);
  const snapshot = await readJson(SNAPSHOT_PATH, {});
  for (const l of Array.isArray(snapshot.listings) ? snapshot.listings : []) {
    if (!l.slug) continue;
    const d = [day(l.created_at), day(l.verified_at)].filter(Boolean).sort().pop();
    if (d) dates.set(`/listing/${l.slug}`, d);
  }
  for (const p of await readJson(NEWS_PATH, [])) {
    if (p.slug && p.publish_date) dates.set(`/news/${p.slug}`, day(p.publish_date));
  }
  return dates;
}

function urlset(entries) {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries
      .map((e) => `  <url>\n    <loc>${xmlEscape(e.loc)}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n  </url>`)
      .join("\n") +
    "\n</urlset>\n"
  );
}

function sitemapIndex(files) {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    files
      .map((f) => `  <sitemap>\n    <loc>${xmlEscape(f.loc)}</loc>\n    <lastmod>${f.lastmod}</lastmod>\n  </sitemap>`)
      .join("\n") +
    "\n</sitemapindex>\n"
  );
}

async function main() {
  const today = todayInNewYork();
  const [prev, seeds] = await Promise.all([previousState(), seedDates()]);

  const pages = {};
  const groups = new Map(GROUPS.map((g) => [g.name, []]));
  const skipped = { noindex: [], noCanonical: [], canonicalElsewhere: [] };
  let unchanged = 0;
  let changed = 0;
  let added = 0;

  for await (const file of htmlFiles(DIST)) {
    const path = pathFor(file);
    const html = await readFile(file, "utf8");
    const head = headInfo(html);
    const self = path === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${path}`;
    if (head.noindex) { skipped.noindex.push(path); continue; }
    if (!head.canonical) { skipped.noCanonical.push(path); continue; }
    if (head.canonical !== self) { skipped.canonicalElsewhere.push(`${path} -> ${head.canonical}`); continue; }

    const hash = contentHash(html, head);
    const before = prev[path];
    let lastmod;
    if (before && before.hash === hash && before.lastmod) {
      lastmod = before.lastmod;
      unchanged++;
    } else if (before) {
      lastmod = today;
      changed++;
    } else {
      lastmod = seeds.get(path) || today;
      added++;
    }
    pages[path] = { hash, lastmod };
    groups.get(GROUPS.find((g) => g.test(path)).name).push({ loc: self, lastmod });
  }

  const index = [];
  for (const [name, entries] of groups) {
    if (!entries.length) continue;
    entries.sort((a, b) => a.loc.localeCompare(b.loc));
    const fileName = `sitemap-${name}.xml`;
    await writeFile(resolve(DIST, fileName), urlset(entries), "utf8");
    index.push({
      loc: `${SITE_ORIGIN}/${fileName}`,
      lastmod: entries.reduce((max, e) => (e.lastmod > max ? e.lastmod : max), ""),
    });
    console.log(`[sitemap] ${fileName}: ${entries.length} urls`);
  }
  await writeFile(resolve(DIST, "sitemap.xml"), sitemapIndex(index), "utf8");
  await writeFile(
    resolve(DIST, STATE_NAME),
    JSON.stringify({ version: 1, generatedOn: today, pages }),
    "utf8"
  );

  const total = Object.keys(pages).length;
  console.log(
    `[sitemap] Wrote dist/sitemap.xml (index of ${index.length} sitemaps, ${total} urls: ` +
      `${unchanged} unchanged, ${changed} changed, ${added} new).`
  );
  console.log(
    `[sitemap] Left out: ${skipped.noindex.length} noindex (${skipped.noindex.join(", ") || "none"}), ` +
      `${skipped.canonicalElsewhere.length} canonical elsewhere, ${skipped.noCanonical.length} without a canonical.`
  );
  // An indexable page without a self canonical is a bug in that page's <head>.
  for (const p of [...skipped.canonicalElsewhere, ...skipped.noCanonical]) {
    console.warn(`[sitemap] WARNING: not listed, no self canonical: ${p}`);
  }
}

main().catch((err) => {
  console.error("[sitemap] Unexpected error:", err);
  process.exit(1);
});
