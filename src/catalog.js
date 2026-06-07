// Shared, side-effect-free catalog helpers.
//
// This module is imported by BOTH the client app (src/App.jsx) and the
// build-only data layer (src/data/build-data.js + scripts/*). It must stay
// pure: no window/document/DOM access, no Supabase, no Node APIs — so it is
// safe to evaluate during static generation and in the browser alike.

// Canonical production origin used for <link rel="canonical">, OG urls, JSON-LD.
export const SITE_ORIGIN = "https://www.hudsonvalleyalmanac.com";

// The 24 mapped categories. The category id is also the URL slug for
// /category/:slug and the third segment of /county/:county/:slug, because the
// DB category values are already slug-like (e.g. "markets", "craftbeverages").
// The DB also contains a handful of unmapped category values (artisanfood,
// facebook, buysell, agency, professional) — those listings still get their own
// /listing/:slug page and still appear on their county page, but get no
// dedicated category hub until a label is added here.
export const categories = [
  { id: "feed", label: "Feed & Supply", icon: "🌾" },
  { id: "animals", label: "Animals & Livestock", icon: "🐓" },
  { id: "makers", label: "Food & Drink Makers", icon: "🧀" },
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
  { id: "legal", label: "Land & Legal", icon: "📋" },
  { id: "outdoor", label: "Outdoor & Recreation", icon: "🏕️" },
  { id: "apothecary", label: "Soap, Candles & Apothecary", icon: "🕯️" },
  { id: "forage", label: "Mushroom & Forage", icon: "🍄" },
  { id: "artisan", label: "Artisan & Craft", icon: "🏺" },
  { id: "mutualaid", label: "Mutual Aid & Food Sharing", icon: "🤝" },
  { id: "cannabis", label: "Craft Cannabis", icon: "🍃" },
];

const categoryById = new Map(categories.map((c) => [c.id, c]));
export function getCategory(id) {
  return categoryById.get(id) || null;
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
