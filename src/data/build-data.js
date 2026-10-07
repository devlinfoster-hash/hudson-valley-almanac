// Build-only data layer.
//
// This module reads the build-time snapshot (src/data/listings.json, written by
// scripts/snapshot.mjs) and derives the route lists + per-route loader data for
// static generation. It is imported ONLY from inside getStaticPaths()/loader()
// in src/App.jsx, both of which run exclusively during the SSG build — so the
// snapshot JSON is code-split into a lazy chunk and never shipped to or fetched
// by the browser in production (the client uses the prebuilt loader-data
// manifest instead, and falls back to a live Supabase fetch for any listing
// added after the last build).
import snapshot from "./listings.json";
import mapSnapshot from "./listings-map.json";
import { isListingOnMap } from "../utils/map-listings.js";
import {
  categories,
  getCategory,
  categoryKeys,
  getCategoryForKey,
  countySlug,
  NON_GEOGRAPHIC_COUNTIES,
  COLLECTION_PAGE_SIZE,
  pageCountFor,
  TAG_FILTERS,
} from "../catalog.js";

const ALL = Array.isArray(snapshot?.listings) ? snapshot.listings : [];
// The /map snapshot (public.listings_map): which listings /map can show.
const MAP_ALL = Array.isArray(mapSnapshot?.listings) ? mapSnapshot.listings : [];

// Only the fields the listing-card UI on county/category/combo pages renders —
// keeps the loader data inlined into each prerendered page small.
function compact(l) {
  return {
    id: l.id,
    slug: l.slug,
    name: l.name,
    description: l.description,
    category: l.category,
    county: l.county,
    town: l.town,
    established: l.established,
    tags: Array.isArray(l.tags) ? l.tags : [],
    hours: l.hours,
  };
}

function byName(a, b) {
  return (a.name || "").localeCompare(b.name || "");
}

// --- County resolution (case-insensitive slug -> canonical county name) -----
const countyNameBySlug = new Map();
for (const l of ALL) {
  const name = l.county;
  if (!name || NON_GEOGRAPHIC_COUNTIES.has(name)) continue;
  const slug = countySlug(name);
  if (!countyNameBySlug.has(slug)) countyNameBySlug.set(slug, name);
}

export function resolveCounty(slug) {
  return countyNameBySlug.get(String(slug || "").toLowerCase()) || null;
}

// Real DB category values that actually have at least one published listing.
const presentCategoryIds = new Set(ALL.map((l) => l.category));
// A tile is "present" when at least one of the DB values it surfaces exists.
function mappedPresentCategories() {
  return categories.filter((c) => categoryKeys(c).some((k) => presentCategoryIds.has(k)));
}

// --- Route path enumeration (for getStaticPaths) ----------------------------
export function listingPaths() {
  return ALL.filter((l) => l.slug).map((l) => `listing/${l.slug}`);
}

export function countyPaths() {
  return [...countyNameBySlug.keys()].map((slug) => `county/${slug}`);
}

export function categoryPaths() {
  return mappedPresentCategories().map((c) => `category/${c.id}`);
}

// Pages 2..N of a long county/category/combo page (page 1 is the base URL).
function pagedPaths(base, total) {
  const pages = pageCountFor(total);
  return Array.from({ length: Math.max(pages - 1, 0) }, (_, i) => `${base}/page/${i + 2}`);
}

export function countyPagePaths() {
  return [...countyNameBySlug.entries()].flatMap(([slug, name]) =>
    pagedPaths(`county/${slug}`, ALL.filter((l) => l.county === name).length)
  );
}

export function categoryPagePaths() {
  return mappedPresentCategories().flatMap((c) => {
    const keys = categoryKeys(c);
    return pagedPaths(`category/${c.id}`, ALL.filter((l) => keys.includes(l.category)).length);
  });
}

export function comboPagePaths() {
  return comboPaths().flatMap((p) => {
    const [, cSlug, catSlug] = p.split("/");
    const data = comboLoader(cSlug, catSlug);
    return data ? pagedPaths(p, data.total) : [];
  });
}

// Only generate a county×category page when ≥1 published listing exists for the
// pair — this prunes the full grid to real combos (no empty pages).
export function comboPaths() {
  const seen = new Set();
  const paths = [];
  for (const l of ALL) {
    if (!l.county || NON_GEOGRAPHIC_COUNTIES.has(l.county)) continue;
    const cat = getCategoryForKey(l.category);
    if (!cat) continue; // untiled DB category -> no hub
    const key = `${countySlug(l.county)}/${cat.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    paths.push(`county/${key}`);
  }
  return paths;
}

// --- Loader data ------------------------------------------------------------
// on_map: whether /map can show this listing (it has usable coordinates in the
// map snapshot), which decides the listing page's "See on map" link.
export function listingLoader(slug) {
  const found = ALL.find((l) => l.slug === slug);
  return found
    ? { ...found, on_map: isListingOnMap(MAP_ALL, slug), related: relatedListings(found) }
    : null;
}

// Just enough to render a link to a listing.
function linkOnly(l) {
  return { id: l.id, slug: l.slug, name: l.name, town: l.town, county: l.county };
}

// The `n` listings after `self` in name order, wrapping around: a sliding window
// rather than "the first n", so every listing is linked from its neighbours and
// no single page soaks up all the related links.
function neighbours(pool, self, n) {
  const sorted = pool.filter((l) => l.slug && l.id !== self.id).sort(byName);
  if (sorted.length <= n) return sorted;
  let start = sorted.findIndex((l) => byName(l, self) > 0);
  if (start < 0) start = 0;
  return Array.from({ length: n }, (_, i) => sorted[(start + i) % sorted.length]);
}

const RELATED_PER_GROUP = 6;
const RELATED_MAX = 12;

// "More in this county" and "More in this category" for a listing page: up to
// six of each (12 in all), topping one group up when the other is short, so a
// listing in a small county still gets a full block. Same-county listings in the
// same category come first in the county group.
function relatedListings(listing) {
  const geo = listing.county && !NON_GEOGRAPHIC_COUNTIES.has(listing.county);
  const cat = getCategoryForKey(listing.category);
  const keys = cat ? categoryKeys(cat) : [];
  const countyPool = geo ? ALL.filter((l) => l.county === listing.county) : [];
  const categoryPool = cat ? ALL.filter((l) => keys.includes(l.category) && l.county !== listing.county) : [];

  const sameBoth = neighbours(countyPool.filter((l) => keys.includes(l.category)), listing, RELATED_PER_GROUP);
  const countyRest = neighbours(countyPool, listing, RELATED_MAX).filter((l) => !sameBoth.includes(l));
  const countyAll = [...sameBoth, ...countyRest];
  const categoryAll = neighbours(categoryPool, listing, RELATED_MAX);

  let nCounty = Math.min(countyAll.length, RELATED_PER_GROUP);
  const nCategory = Math.min(categoryAll.length, RELATED_MAX - nCounty);
  nCounty = Math.min(countyAll.length, RELATED_MAX - nCategory);

  return {
    county: geo && nCounty
      ? { name: listing.county, slug: countySlug(listing.county), items: countyAll.slice(0, nCounty).map(linkOnly) }
      : null,
    category: cat && nCategory
      ? { id: cat.id, label: cat.label, items: categoryAll.slice(0, nCategory).map(linkOnly) }
      : null,
  };
}

// Homepage: every county and category landing page, so the static HTML links to
// all of them.
export function homeLoader() {
  const countyCounts = new Map();
  for (const l of ALL) {
    if (!l.county || NON_GEOGRAPHIC_COUNTIES.has(l.county)) continue;
    countyCounts.set(l.county, (countyCounts.get(l.county) || 0) + 1);
  }
  return {
    counties: [...countyCounts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, slug: countySlug(name), count })),
    categories: mappedPresentCategories().map((c) => {
      const keys = categoryKeys(c);
      return { id: c.id, label: c.label, icon: c.icon, count: ALL.filter((l) => keys.includes(l.category)).length };
    }),
  };
}

// One page of a county/category/combo listing set. `listings` is the page's
// slice; `tagged` holds, for each quick filter, every matching listing across
// all pages (so a filter isn't limited to the page you're on). Returns null for
// a page number past the end.
function paginate(listings, page) {
  const pageCount = pageCountFor(listings.length);
  const n = page == null ? 1 : Number(page);
  if (!Number.isInteger(n) || n < 1 || n > pageCount || String(page ?? 1) !== String(n)) return null;
  const start = (n - 1) * COLLECTION_PAGE_SIZE;
  const tagged = {};
  for (const { tag } of TAG_FILTERS) {
    const hits = listings.filter((l) => Array.isArray(l.tags) && l.tags.includes(tag));
    if (hits.length) tagged[tag] = hits.map(compact);
  }
  return {
    page: n,
    pageCount,
    listings: listings.slice(start, start + COLLECTION_PAGE_SIZE).map(compact),
    tagged,
  };
}

export function countyLoader(slug, page) {
  const county = resolveCounty(slug);
  if (!county) return null;
  const listings = ALL.filter((l) => l.county === county).sort(byName);
  // Tiles present in this county, for internal cross-links to combos. Bucket each
  // listing's raw DB category into its tile so multi-key tiles count correctly
  // and untiled categories (facebook/buysell) are skipped.
  const counts = new Map();
  for (const l of listings) {
    const cat = getCategoryForKey(l.category);
    if (!cat) continue;
    counts.set(cat.id, (counts.get(cat.id) || 0) + 1);
  }
  const cats = mappedPresentCategories()
    .filter((c) => counts.has(c.id))
    .map((c) => ({ id: c.id, label: c.label, icon: c.icon, count: counts.get(c.id) }));
  const paged = paginate(listings, page);
  if (!paged) return null;
  return {
    county,
    slug: countySlug(county),
    total: listings.length,
    categories: cats,
    ...paged,
  };
}

export function categoryLoader(slug, page) {
  const cat = getCategory(slug);
  if (!cat) return null;
  const keys = categoryKeys(cat);
  const listings = ALL.filter((l) => keys.includes(l.category)).sort(byName);
  // Counties present in this category, for internal cross-links to combos.
  const counts = new Map();
  for (const l of listings) {
    if (!l.county || NON_GEOGRAPHIC_COUNTIES.has(l.county)) continue;
    counts.set(l.county, (counts.get(l.county) || 0) + 1);
  }
  const paged = paginate(listings, page);
  if (!paged) return null;
  const counties = [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, slug: countySlug(name), count }));
  return {
    category: cat.id,
    label: cat.label,
    icon: cat.icon,
    slug: cat.id,
    total: listings.length,
    counties,
    ...paged,
  };
}

export function comboLoader(cSlug, catSlug, page) {
  const county = resolveCounty(cSlug);
  const cat = getCategory(catSlug);
  if (!county || !cat) return null;
  const keys = categoryKeys(cat);
  const listings = ALL.filter((l) => l.county === county && keys.includes(l.category)).sort(byName);
  if (listings.length === 0) return null;
  const paged = paginate(listings, page);
  if (!paged) return null;
  return {
    county,
    countySlug: countySlug(county),
    category: cat.id,
    label: cat.label,
    icon: cat.icon,
    categorySlug: cat.id,
    total: listings.length,
    ...paged,
  };
}
