// Shared, side-effect-free catalog helpers.
//
// This module is imported by BOTH the client app (src/App.jsx) and the
// build-only data layer (src/data/build-data.js + scripts/*). It must stay
// pure: no window/document/DOM access, no Supabase, no Node APIs — so it is
// safe to evaluate during static generation and in the browser alike.

// Canonical production origin used for <link rel="canonical">, OG urls, JSON-LD.
export const SITE_ORIGIN = "https://www.hudsonvalleyalmanac.com";

// The mapped categories. A tile's `id` is its URL slug for /category/:slug and
// the third segment of /county/:county/:slug. By default `id` is also the DB
// `category` value the tile filters on; a tile may instead declare `keys` to
// surface one or more real DB category values under a single tile (used where a
// label spans several DB values). Every `id`/`keys` entry below must correspond
// to a real DB category value — a tile pointing at a non-existent value renders
// an empty "0" tile (the bug this config previously had: "makers" and "legal"
// were not DB values; the real values are "artisanfood" and "agency"/"professional").
//
// DB categories intentionally left untiled: `facebook` (17) and `buysell` (15)
// — low-signal/marketplace buckets pending a product call. Their listings still
// get their own /listing/:slug page; they have no category hub until tiled.
export const categories = [
  { id: "feed", label: "Feed & Supply", icon: "🌾" },
  { id: "animals", label: "Animals & Livestock", icon: "🐓" },
  { id: "artisanfood", label: "Food & Drink Makers", icon: "🧀" },
  { id: "land", label: "Land & Property Services", icon: "🪵" },
  { id: "food", label: "Food & Preservation", icon: "🫙" },
  { id: "water", label: "Water & Utilities", icon: "💧" },
  { id: "seeds", label: "Seeds & Plants", icon: "🌱" },
  { id: "learn", label: "Learn & Community", icon: "📖" },
  { id: "equipment", label: "Equipment & Repair", icon: "🔧" },
  { id: "hearth", label: "Home & Hearth", icon: "🔥" },
  { id: "farmservices", label: "Farm Services", icon: "🐄" },
  { id: "health", label: "Health & Wellness", icon: "🌿" },
  { id: "fiber", label: "Fiber & Textile", icon: "🧶" },
  { id: "maple", label: "Maple & Honey", icon: "🍯" },
  { id: "craftbeverages", label: "Craft Beverages", icon: "🍻" },
  { id: "trades", label: "Building & Trades", icon: "🪚" },
  { id: "markets", label: "Markets & Events", icon: "📅" },
  { id: "professional-services", label: "Agencies & Professional Services", icon: "📋", keys: ["agency", "professional"] },
  { id: "outdoor", label: "Outdoor & Recreation", icon: "🏕️" },
  { id: "apothecary", label: "Soap, Candles & Apothecary", icon: "🕯️" },
  { id: "forage", label: "Mushroom & Forage", icon: "🍄" },
  { id: "artisan", label: "Artisan & Craft", icon: "🏺" },
  { id: "mutualaid", label: "Mutual Aid & Food Sharing", icon: "🤝" },
  { id: "cannabis", label: "Craft Cannabis", icon: "🍃" },
];

// The DB `category` value(s) a tile surfaces. Defaults to [id] for normal tiles.
export function categoryKeys(cat) {
  if (!cat) return [];
  return cat.keys && cat.keys.length ? cat.keys : [cat.id];
}

const categoryById = new Map(categories.map((c) => [c.id, c]));
export function getCategory(id) {
  return categoryById.get(id) || null;
}

// Reverse lookup: a real DB `category` value -> the tile that surfaces it, or
// null if that value is untiled (e.g. facebook, buysell). Used to bucket a
// listing's raw category into its hub for county cross-links, combos, sitemap.
const categoryByDbKey = new Map();
for (const c of categories) {
  for (const k of categoryKeys(c)) categoryByDbKey.set(k, c);
}
export function getCategoryForKey(dbKey) {
  return categoryByDbKey.get(dbKey) || null;
}

// "Online" and "Statewide" are not real geographic counties, so they get no
// county landing page. Their listings still appear via category pages and their
// own /listing/:slug page.
export const NON_GEOGRAPHIC_COUNTIES = new Set(["Online", "Statewide"]);

export function slugify(name) {
  return (
    (name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "listing"
  );
}

// County name -> URL slug (e.g. "Delaware" -> "delaware"). Plain slugify, but
// named so the intent is explicit at call sites.
export function countySlug(name) {
  return slugify(name);
}
