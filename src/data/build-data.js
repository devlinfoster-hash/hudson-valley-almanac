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
import {
  categories,
  getCategory,
  countySlug,
  NON_GEOGRAPHIC_COUNTIES,
} from "../catalog.js";

const ALL = Array.isArray(snapshot?.listings) ? snapshot.listings : [];

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

// Mapped category ids that actually have at least one published listing.
const presentCategoryIds = new Set(ALL.map((l) => l.category));
function mappedPresentCategories() {
  return categories.filter((c) => presentCategoryIds.has(c.id));
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

// Only generate a county×category page when ≥1 published listing exists for the
// pair — this prunes the full grid to real combos (no empty pages).
export function comboPaths() {
  const seen = new Set();
  const paths = [];
  for (const l of ALL) {
    if (!l.county || NON_GEOGRAPHIC_COUNTIES.has(l.county)) continue;
    if (!getCategory(l.category)) continue; // unmapped category -> no hub
    const key = `${countySlug(l.county)}/${l.category}`;
    if (seen.has(key)) continue;
    seen.add(key);
    paths.push(`county/${key}`);
  }
  return paths;
}

// --- Loader data ------------------------------------------------------------
export function listingLoader(slug) {
  const found = ALL.find((l) => l.slug === slug);
  return found || null;
}

export function countyLoader(slug) {
  const county = resolveCounty(slug);
  if (!county) return null;
  const listings = ALL.filter((l) => l.county === county).sort(byName);
  // Categories present in this county, for internal cross-links to combos.
  const counts = new Map();
  for (const l of listings) counts.set(l.category, (counts.get(l.category) || 0) + 1);
  const cats = mappedPresentCategories()
    .filter((c) => counts.has(c.id))
    .map((c) => ({ id: c.id, label: c.label, icon: c.icon, count: counts.get(c.id) }));
  return {
    county,
    slug: countySlug(county),
    total: listings.length,
    categories: cats,
    listings: listings.map(compact),
  };
}

export function categoryLoader(slug) {
  const cat = getCategory(slug);
  if (!cat) return null;
  const listings = ALL.filter((l) => l.category === cat.id).sort(byName);
  // Counties present in this category, for internal cross-links to combos.
  const counts = new Map();
  for (const l of listings) {
    if (!l.county || NON_GEOGRAPHIC_COUNTIES.has(l.county)) continue;
    counts.set(l.county, (counts.get(l.county) || 0) + 1);
  }
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
    listings: listings.map(compact),
  };
}

export function comboLoader(cSlug, catSlug) {
  const county = resolveCounty(cSlug);
  const cat = getCategory(catSlug);
  if (!county || !cat) return null;
  const listings = ALL.filter((l) => l.county === county && l.category === cat.id).sort(byName);
  if (listings.length === 0) return null;
  return {
    county,
    countySlug: countySlug(county),
    category: cat.id,
    label: cat.label,
    icon: cat.icon,
    categorySlug: cat.id,
    total: listings.length,
    listings: listings.map(compact),
  };
}
