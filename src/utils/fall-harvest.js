// Which published listings appear in each section of the Fall Harvest guide
// (/fall-harvest). Run at build time over the listings snapshot (published
// only), so the page is prerendered and refreshed by the nightly rebuild.
//
// Matching is deliberately strict: a listing's tags and name only, never its
// description (descriptions mention "apple" or "festival" in passing), except
// for Hayrides, whose tags are thin and whose phrases are specific enough to
// trust in descriptions too. Cannabis is never included, and craft-beverage
// listings (breweries, cideries, distilleries) only in Pick Your Own, so the
// Cider section means sweet cider and donuts; hard cider has Beverage Trails.
import { isSeasonEnded } from "./season.js";

export const FALL_HARVEST_SECTIONS = [
  { id: "pick-your-own", title: "Pick Your Own", match: /\b(pick[- ]your[- ]own|u[- ]?pick|you[- ]pick)\b/i, beverages: true },
  { id: "apples-orchards", title: "Apples & Orchards", match: /\b(apples?|orchards?)\b/i },
  { id: "pumpkins-corn-mazes", title: "Pumpkins & Corn Mazes", match: /\b(pumpkins?|mazes?)\b/i },
  { id: "cider-donuts-treats", title: "Cider, Donuts & Treats", match: /\b(ciders?|donuts?|doughnuts?)\b/i },
  { id: "hayrides-family-fun", title: "Hayrides, Animals & Family Fun", match: /\b(hay ?rides?|wagon rides?|horse[- ]drawn wagons?|petting)\b/i, descriptions: true },
  { id: "harvest-festivals", title: "Harvest Festivals", match: /\b((harvest|fall|autumn|apple|pumpkin|farm) fest(ival)?s?|harvest fest)\b/i },
];

const EXCLUDED_CATEGORY = "cannabis";
const BEVERAGE_CATEGORY = "craftbeverages";

export function matchesSection(listing, section) {
  if (listing.category === EXCLUDED_CATEGORY) return false;
  if (listing.category === BEVERAGE_CATEGORY && !section.beverages) return false;
  const re = section.match;
  if ((listing.tags || []).some((t) => re.test(t))) return true;
  if (re.test(listing.name || "")) return true;
  return Boolean(section.descriptions && re.test(listing.description || ""));
}

// Only what the page renders for each stop (no description or photos).
function stop(l) {
  return { id: l.id, slug: l.slug, name: l.name, town: l.town || null, county: l.county || null, hours: l.hours || null, season_end: l.season_end ?? null };
}

// Each section's listings, deduped by id within the section and sorted by
// name. A listing may appear in more than one section.
export function buildFallHarvestSections(listings) {
  return FALL_HARVEST_SECTIONS.map(({ id, title }, i) => {
    const seen = new Set();
    const items = [];
    for (const l of listings) {
      if (!l.slug || seen.has(l.id) || !matchesSection(l, FALL_HARVEST_SECTIONS[i])) continue;
      seen.add(l.id);
      items.push(stop(l));
    }
    items.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return { id, title, items };
  });
}

// Open listings first, then those whose season has ended, each group keeping
// its order. `today` is null before hydration, when nothing counts as ended.
export function sortSeasonEndedLast(items, today) {
  const open = [], ended = [];
  for (const it of items) (isSeasonEnded(it.season_end, today) ? ended : open).push(it);
  return [...open, ...ended];
}
