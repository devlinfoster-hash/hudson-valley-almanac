// Which hard-coded guide links to listing pages still resolve. guide-links.json
// is written at build time by scripts/check-guide-links.mjs from the published
// listings snapshot and redirects/listing-slugs.json.
import status from "./guide-links.json";

const unlinked = new Set(status?.unlinked || []);
const rewrite = status?.rewrite || {};

// The slug a guide should link to: the slug itself, its redirect target if it
// was renamed, or null when there is no published listing (render the name as
// plain text).
export function guideListingSlug(slug) {
  if (unlinked.has(slug)) return null;
  return rewrite[slug] || slug;
}
