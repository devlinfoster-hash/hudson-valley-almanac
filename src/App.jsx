// src/analytics.js
//
// GA4 event helper for Hudson Valley Almanac (Measurement ID G-CC4ZRHVJDQ).
// Sits next to ./supabase. App.jsx already fires page_view on every route change,
// so this file deliberately does NOT touch page_view — it only adds the directory
// events. Every call no-ops safely if gtag is missing (ad blockers, dev, or the tag
// getting stripped from the build again).

/** Core: fire any GA4 event, safely. Empty/undefined params are dropped. */
export function trackEvent(name, params = {}) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
  );
  window.gtag("event", name, clean);
}

/** A business/listing page was viewed. Pass the Supabase listing row. */
export function trackListingView(listing) {
  if (!listing) return;
  trackEvent("listing_view", {
    listing_slug: listing.slug,
    listing_name: listing.name,
    listing_category: listing.category,
    listing_county: listing.county,
    listing_town: listing.town,
  });
}

/** A category view (with the Working Farms Only / ?ag=1 state). */
export function trackCategoryView({ category, agOnly, resultCount }) {
  trackEvent("category_view", {
    listing_category: category || "all",
    working_farms_only: !!agOnly,
    result_count: resultCount,
  });
}

/** The directory search was used. Uses GA4's recommended "search" event name. */
export function trackSearch(term, resultCount) {
  const q = (term || "").trim();
  if (q.length < 2) return; // ignore single-character noise
  trackEvent("search", {
    search_term: q,
    result_count: resultCount,
  });
}
