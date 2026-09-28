// Books by the Almanac's editor, from the books table in Supabase. scripts/snapshot.mjs
// writes them to src/data/books.json at build time, so adding a book or changing its
// status is a database change plus a rebuild (the nightly rebuild picks it up).
import raw from "./books.json";

export const BOOKS = Array.isArray(raw) ? raw : [];

const OUT = new Set(["available", "free"]);

// Books shown in context (county pages, listing pages) must be out now.
export function booksForCounty(slug, max = 2) {
  return BOOKS.filter((b) => b.section === "regional" && OUT.has(b.status) && (b.counties || []).includes(slug)).slice(0, max);
}

export function booksForListing(listing, max = 1) {
  const tags = Array.isArray(listing?.tags) ? listing.tags : [];
  return BOOKS.filter((b) => OUT.has(b.status) && (b.listing_tags || []).some((t) => tags.includes(t))).slice(0, max);
}
