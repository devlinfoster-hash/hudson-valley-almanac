// Generates dist/sitemap.xml after the SSG build.
//
// Reads the build-time snapshot (src/data/listings.json, written by
// scripts/snapshot.mjs) — the same data the prerender uses — and enumerates
// every prerendered URL: the static routes, every published listing, every
// geographic county, every mapped category, and every non-empty county×category
// combo. /admin is intentionally excluded (it's not prerendered either).
//
// robots.txt points crawlers at https://www.hudsonvalleyalmanac.com/sitemap.xml.
// If the snapshot is missing/empty (e.g. a local build with no Supabase env),
// it falls back to a static-routes-only sitemap and warns instead of failing.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  categories,
  categoryKeys,
  getCategoryForKey,
  countySlug,
  NON_GEOGRAPHIC_COUNTIES,
  SITE_ORIGIN,
} from "../src/catalog.js";
import { PUBLISHED_FARM_TRAILS } from "../src/data/farm-trails-index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = resolve(HERE, "..", "src", "data", "listings.json");
const OUT_PATH = resolve(HERE, "..", "dist", "sitemap.xml");

function xmlEscape(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]
  ));
}

function urlEntry(loc, lastmod) {
  return (
    "  <url>\n" +
    `    <loc>${xmlEscape(loc)}</loc>\n` +
    (lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : "") +
    "  </url>"
  );
}

async function loadListings() {
  try {
    const raw = await readFile(SNAPSHOT_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.listings) ? parsed.listings : [];
  } catch (err) {
    console.warn(`[sitemap] Could not read snapshot (${err.message}); static routes only.`);
    return [];
  }
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const listings = await loadListings();

  // Use a Map keyed by loc so we never emit a URL twice.
  const urls = new Map();
  const add = (path, lastmod) => {
    const loc = `${SITE_ORIGIN}${path}`;
    if (!urls.has(loc)) urls.set(loc, lastmod);
  };

  // Static routes (excluding /admin).
  add("/", today);
  add("/fire-towers", today);
  add("/about", today);
  add("/farm-trails", today);
  add("/beverage-trails", today);
  for (const g of PUBLISHED_FARM_TRAILS) add(`/farm-trails/${g.slug}`, today);

  const counties = new Set();
  const presentCategoryIds = new Set();
  const combos = new Set();

  for (const l of listings) {
    if (!l.slug) continue;
    const lastmod = l.created_at ? new Date(l.created_at).toISOString().slice(0, 10) : today;
    add(`/listing/${encodeURIComponent(l.slug)}`, lastmod);

    if (l.category) presentCategoryIds.add(l.category);

    const isGeoCounty = l.county && !NON_GEOGRAPHIC_COUNTIES.has(l.county);
    if (isGeoCounty) counties.add(l.county);

    // Only tiled categories get a hub; only non-empty combos get a page. Bucket
    // the raw DB category into its tile so the combo slug matches the tile id
    // (and multi-key tiles collapse their values into one combo page).
    const cat = isGeoCounty ? getCategoryForKey(l.category) : null;
    if (cat) {
      combos.add(`${countySlug(l.county)}/${cat.id}`);
    }
  }

  for (const county of counties) add(`/county/${countySlug(county)}`, today);
  for (const c of categories) {
    if (categoryKeys(c).some((k) => presentCategoryIds.has(k))) add(`/category/${c.id}`, today);
  }
  for (const combo of combos) add(`/county/${combo}`, today);

  const entries = [...urls.entries()].map(([loc, lastmod]) => urlEntry(loc, lastmod));

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries.join("\n") +
    "\n</urlset>\n";

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, xml, "utf8");
  console.log(
    `[sitemap] Wrote ${OUT_PATH} (${entries.length} urls: ${listings.length} listings, ` +
    `${counties.size} counties, ${categories.filter((c) => categoryKeys(c).some((k) => presentCategoryIds.has(k))).length} categories, ${combos.size} combos).`
  );
}

main().catch((err) => {
  console.error("[sitemap] Unexpected error:", err);
  process.exit(1);
});
