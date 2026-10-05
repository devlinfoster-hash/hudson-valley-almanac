// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapPlacement,
  isShownOnMap,
  isVerified,
  displayValue,
  townCountyLine,
  websiteHref,
  categoryStyle,
  filterListings,
  groupApproximate,
  queryWords,
  resolveSearch,
  activeFilters,
  mostRestrictiveFilter,
  distanceMiles,
  MERGE_DISTANCE_MILES,
  parseFilters,
  filtersToParams,
  percentileBounds,
  APPROXIMATE_RADIUS_METERS,
  NOT_AVAILABLE,
} from "./map-listings.js";

const base = { id: 1, slug: "a", name: "Apple Barn", category: "food", county: "Ulster", town: "Kingston", tags: ["orchard"] };

// --- Precision: point vs circle --------------------------------------------

test("street precision is drawn as a point at the exact coordinates", () => {
  const p = mapPlacement({ ...base, latitude: 41.93, longitude: -74.0, location_precision: "street" });
  assert.deepEqual(p, { kind: "point", lat: 41.93, lng: -74.0 });
});

for (const precision of ["postal_code", "town"]) {
  test(`${precision} precision is drawn as a ~2 mile circle, never a point`, () => {
    const p = mapPlacement({ ...base, latitude: 41.93, longitude: -74.0, location_precision: precision });
    assert.equal(p.kind, "circle");
    assert.equal(p.lat, 41.93);
    assert.equal(p.lng, -74.0);
    assert.equal(p.radiusMeters, APPROXIMATE_RADIUS_METERS);
    assert.ok(Math.abs(APPROXIMATE_RADIUS_METERS - 3218.7) < 1, "about two miles");
  });
}

test("numeric coordinates that arrive as strings are accepted", () => {
  const p = mapPlacement({ ...base, latitude: "41.5", longitude: "-73.9", location_precision: "street" });
  assert.deepEqual(p, { kind: "point", lat: 41.5, lng: -73.9 });
});

test("precision 'none' is not drawn even if coordinates are present", () => {
  assert.equal(mapPlacement({ ...base, latitude: 41.9, longitude: -74, location_precision: "none" }).kind, "none");
});

test("an unknown or missing precision is not drawn (no guessing)", () => {
  assert.equal(mapPlacement({ ...base, latitude: 41.9, longitude: -74, location_precision: "rooftop" }).kind, "none");
  assert.equal(mapPlacement({ ...base, latitude: 41.9, longitude: -74, location_precision: null }).kind, "none");
});

// --- No coordinates --------------------------------------------------------

for (const [label, coords] of [
  ["null", { latitude: null, longitude: null }],
  ["missing", {}],
  ["only latitude", { latitude: 41.9, longitude: null }],
  ["empty strings", { latitude: "", longitude: "" }],
  ["out of range", { latitude: 141.9, longitude: -74 }],
  ["not a number", { latitude: "abc", longitude: -74 }],
]) {
  test(`no usable coordinates (${label}) means not shown on the map`, () => {
    const l = { ...base, ...coords, location_precision: "street" };
    assert.equal(mapPlacement(l).kind, "none");
    assert.equal(isShownOnMap(l), false);
  });
}

test("listings without coordinates still appear in the list and in search", () => {
  const noCoords = { ...base, id: 2, name: "Online Seed Swap", town: null, county: "Online", latitude: null, longitude: null, location_precision: "none", is_online_or_statewide: true };
  const pinned = { ...base, id: 3, latitude: 41.93, longitude: -74.0, location_precision: "street" };
  const all = filterListings([noCoords, pinned]);
  assert.deepEqual(all.map((r) => r.listing.id), [2, 3]);
  assert.equal(all[0].placement.kind, "none");
  assert.deepEqual(filterListings([noCoords, pinned], { q: "seed swap" }).map((r) => r.listing.id), [2]);
  assert.deepEqual(filterListings([noCoords, pinned], { county: "Online" }).map((r) => r.listing.id), [2]);
});

test("area and near-me filters exclude listings without coordinates", () => {
  const noCoords = { ...base, id: 2, latitude: null, longitude: null, location_precision: "none" };
  const pinned = { ...base, id: 3, latitude: 41.93, longitude: -74.0, location_precision: "street" };
  const bounds = { south: 41, west: -75, north: 42.5, east: -73 };
  assert.deepEqual(filterListings([noCoords, pinned], { bounds }).map((r) => r.listing.id), [3]);
  assert.deepEqual(filterListings([noCoords, pinned], { near: { lat: 41.93, lng: -74.0 }, radius: 5 }).map((r) => r.listing.id), [3]);
});

// --- Filters ---------------------------------------------------------------

test("search matches name, town, county and tags; every word must match", () => {
  const l = { ...base };
  assert.equal(filterListings([l], { q: "apple" }).length, 1);
  assert.equal(filterListings([l], { q: "kingston" }).length, 1);
  assert.equal(filterListings([l], { q: "ulster orchard" }).length, 1);
  assert.equal(filterListings([l], { q: "ulster cider" }).length, 0);
});

test("category filter uses catalog tiles, including multi-key tiles", () => {
  const a = { ...base, id: 1, category: "agency" };
  const b = { ...base, id: 2, category: "professional" };
  const c = { ...base, id: 3, category: "food" };
  assert.deepEqual(filterListings([a, b, c], { category: "professional-services" }).map((r) => r.listing.id), [1, 2]);
});

test("near me filters by radius and sorts by distance", () => {
  const here = { lat: 41.93, lng: -74.0 };
  const close = { ...base, id: 1, latitude: 41.95, longitude: -74.0, location_precision: "street" };
  const closest = { ...base, id: 2, latitude: 41.93, longitude: -74.0, location_precision: "town" };
  const far = { ...base, id: 3, latitude: 42.65, longitude: -73.75, location_precision: "street" };
  const rows = filterListings([close, closest, far], { near: here, radius: 10 });
  assert.deepEqual(rows.map((r) => r.listing.id), [2, 1]);
  assert.ok(rows[1].distance > 1 && rows[1].distance < 2);
});

test("approximate circles at the same spot are merged; points are not grouped", () => {
  const rows = filterListings([
    { ...base, id: 1, latitude: 41.93, longitude: -74.0, location_precision: "town" },
    { ...base, id: 2, latitude: 41.93, longitude: -74.0, location_precision: "postal_code" },
    { ...base, id: 3, latitude: 41.5, longitude: -74.0, location_precision: "town" },
    { ...base, id: 4, latitude: 41.93, longitude: -74.0, location_precision: "street" },
  ]);
  const groups = groupApproximate(rows);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => g.listings.map((l) => l.id).sort()).sort(), [[1, 2], [3]]);
});

// --- Display ---------------------------------------------------------------

test("blank values show 'Information not available'", () => {
  for (const v of [null, undefined, "", "   "]) assert.equal(displayValue(v), NOT_AVAILABLE);
  assert.equal(displayValue(" 845-555-0100 "), "845-555-0100");
  assert.equal(townCountyLine({ town: "", county: null }), NOT_AVAILABLE);
  assert.equal(townCountyLine({ town: "Kingston", county: "Ulster" }), "Kingston, Ulster County");
  assert.equal(townCountyLine({ town: null, county: "Statewide" }), "Statewide");
});

test("Verified only when verification_status is 'verified'", () => {
  assert.equal(isVerified({ verification_status: "verified" }), true);
  for (const s of ["unverified", "pending", null, undefined, "Verified "]) {
    assert.equal(isVerified({ verification_status: s }), false);
  }
});

test("website links only http(s) or bare domains", () => {
  assert.equal(websiteHref("example.com"), "https://example.com");
  assert.equal(websiteHref("http://example.com"), "http://example.com");
  assert.equal(websiteHref("javascript:alert(1)"), null);
  assert.equal(websiteHref(""), null);
});

test("every catalog category gets a color and icon", () => {
  const s = categoryStyle("maple");
  assert.equal(s.id, "maple");
  assert.match(s.color, /^#[0-9A-F]{6}$/i);
  assert.equal(categoryStyle("nonsense").label, "Other");
});

// --- URL sync --------------------------------------------------------------

test("filters round-trip through the query string", () => {
  const filters = {
    q: "cider",
    category: "craftbeverages",
    county: "Columbia",
    bounds: { south: 41.5, west: -74.25, north: 42.75, east: -73.5 },
    near: { lat: 42.2468, lng: -73.7912 },
    radius: 25,
  };
  const params = filtersToParams(filters);
  assert.equal(params.get("near"), "42.25,-73.79", "near-me location is coarsened");
  const parsed = parseFilters(new URLSearchParams(params.toString()));
  assert.deepEqual(parsed, { ...filters, near: { lat: 42.25, lng: -73.79 } });
});

test("a radius chosen before near-me is kept in the query string", () => {
  const params = filtersToParams({ q: "", radius: 25, near: null });
  assert.equal(params.toString(), "r=25");
  assert.equal(parseFilters(params).radius, 25);
});

test("invalid query-string values are ignored", () => {
  const parsed = parseFilters(new URLSearchParams("category=bogus&bbox=1,2,3&near=999,0&r=7"));
  assert.equal(parsed.category, "");
  assert.equal(parsed.bounds, null);
  assert.equal(parsed.near, null);
  assert.equal(parsed.radius, 10);
});

// --- Initial view ------------------------------------------------------------

const at = (lat, lng, extra = {}) => ({ ...base, latitude: lat, longitude: lng, location_precision: "street", ...extra });

test("initial bounds ignore far-off outliers (5th–95th percentile)", () => {
  // 100 listings spread over lat 41.0–42.98 and lng -74.99 to -74.0 …
  const listings = Array.from({ length: 100 }, (_, i) => at(41 + i * 0.02, -75 + i * 0.01));
  // … plus a mis-geocoded listing in Michigan and one off the coast.
  listings.push(at(42.3, -83.0), at(40.0, -70.0));
  const b = percentileBounds(listings);
  assert.ok(b.west > -76 && b.east < -73.5, `lng ${b.west}..${b.east} should exclude the outliers`);
  assert.ok(b.south > 41 && b.north < 43, `lat ${b.south}..${b.north} should exclude the outliers`);
  assert.ok(b.south < 41.2 && b.north > 42.7, "the bulk of the listings is still framed");
});

test("initial bounds skip listings without usable coordinates", () => {
  const b = percentileBounds([at(41.5, -74.0), at(null, null), at("abc", -74), { ...base }, at(42.0, -73.5)]);
  assert.deepEqual(b, { south: 41.5, west: -74.0, north: 42.0, east: -73.5 });
});

test("initial bounds of an empty list are null", () => {
  assert.equal(percentileBounds([]), null);
  assert.equal(percentileBounds(undefined), null);
  assert.equal(percentileBounds([{ ...base }]), null);
});

test("initial bounds of a tiny list keep every listing", () => {
  assert.deepEqual(percentileBounds([at(41.9, -74.1)]), { south: 41.9, west: -74.1, north: 41.9, east: -74.1 });
  assert.deepEqual(percentileBounds([at(42.5, -73.5), at(41.0, -75.0)]), { south: 41.0, west: -75.0, north: 42.5, east: -73.5 });
  const twenty = Array.from({ length: 20 }, (_, i) => at(41 + i * 0.1, -75 + i * 0.1));
  assert.deepEqual(percentileBounds(twenty), { south: 41, west: -75, north: 41 + 19 * 0.1, east: -75 + 19 * 0.1 });
});

// --- Search: address/ZIP, "county", AND matching -----------------------------

const kingston = { ...base, id: 10, name: "Rondout Bakery", town: "Kingston", county: "Ulster", tags: ["bread"], address: "12 Broadway, Kingston, NY 12401" };
const hudson = { ...base, id: 11, name: "Warren Street Cider", town: "Hudson", county: "Columbia", tags: ["cider"], address: "400 Warren St, Hudson, NY 12534" };
const chatham = { ...base, id: 12, name: "Chatham Creamery", town: "Chatham", county: "Columbia", tags: ["cheese"], address: null };
const sample = [kingston, hudson, chatham];
const ids = (rows) => rows.map((r) => r.listing.id);

test("a 5-digit ZIP code matches the address", () => {
  assert.deepEqual(ids(filterListings(sample, { q: "12401" })), [10]);
  assert.deepEqual(ids(filterListings(sample, { q: "12534" })), [11]);
  assert.deepEqual(ids(filterListings(sample, { q: "99999" })), []);
});

test("a street name matches the address", () => {
  assert.deepEqual(ids(filterListings(sample, { q: "broadway" })), [10]);
  assert.deepEqual(ids(filterListings(sample, { q: "Warren St," })), [11], "punctuation around words is ignored");
});

test("the word 'county' is ignored and county names match in any case", () => {
  assert.deepEqual(queryWords("Columbia County"), ["columbia"]);
  const plain = ids(filterListings(sample, { q: "columbia" }));
  assert.deepEqual(plain, [11, 12]);
  for (const q of ["columbia county", "COLUMBIA", "Columbia COUNTY", "county columbia"]) {
    assert.deepEqual(ids(filterListings(sample, { q })), plain, q);
  }
  assert.deepEqual(ids(filterListings(sample, { county: "columbia" })), [11, 12], "URL county is case-insensitive");
});

test("multi-word queries match only when every word matches somewhere", () => {
  assert.deepEqual(ids(filterListings(sample, { q: "cider hudson" })), [11], "tag + town");
  assert.deepEqual(ids(filterListings(sample, { q: "columbia cheese" })), [12], "county + tag");
  assert.deepEqual(ids(filterListings(sample, { q: "warren 12534" })), [11], "name + ZIP");
  assert.deepEqual(ids(filterListings(sample, { q: "cider kingston" })), [], "words split across listings don't match");
});

test("a query that is exactly a county name sets the county filter", () => {
  const names = ["Columbia", "Ulster"];
  assert.deepEqual(resolveSearch({ q: "columbia county", county: "" }, names), { county: "Columbia", countyFromQuery: true, words: [] });
  assert.deepEqual(resolveSearch({ q: "Ulster", county: "" }, names), { county: "Ulster", countyFromQuery: true, words: [] });
  // Not exactly a county: plain text search.
  assert.deepEqual(resolveSearch({ q: "columbia cider", county: "" }, names), { county: "", countyFromQuery: false, words: ["columbia", "cider"] });
  // An explicit county wins; the query stays a text search within it.
  assert.deepEqual(resolveSearch({ q: "columbia", county: "ulster" }, names), { county: "Ulster", countyFromQuery: false, words: ["columbia"] });
});

// --- Most restrictive filter --------------------------------------------------

test("the most restrictive filter is the one whose removal shows the most listings", () => {
  const here = { lat: 41.93, lng: -74.0 };
  const listings = [
    // 3 Columbia listings far from `here`, one of them cider.
    { ...base, id: 1, county: "Columbia", category: "craftbeverages", latitude: 42.25, longitude: -73.79, location_precision: "street" },
    { ...base, id: 2, county: "Columbia", category: "food", latitude: 42.36, longitude: -73.6, location_precision: "street" },
    { ...base, id: 3, county: "Columbia", category: "food", latitude: 42.3, longitude: -73.7, location_precision: "town" },
    // 1 Ulster listing near `here`.
    { ...base, id: 4, county: "Ulster", category: "food", latitude: 41.94, longitude: -74.0, location_precision: "street" },
  ];
  const filters = { q: "", category: "craftbeverages", county: "Columbia", near: here, radius: 5, bounds: null };
  assert.equal(filterListings(listings, filters).length, 0);
  const labels = activeFilters(filters, ["Columbia", "Ulster"]).map((f) => f.label);
  assert.deepEqual(labels, ["Craft Beverages", "Columbia County", "Within 5 mi"]);
  // Without category: 0 (still none near). Without county: 0. Without near: 1.
  const best = mostRestrictiveFilter(listings, filters);
  assert.equal(best.filter.key, "near");
  assert.equal(best.count, 1);
  assert.deepEqual(best.filter.remove, { near: null });
});

test("a county taken from the query is removed by clearing the query", () => {
  const f = activeFilters({ q: "columbia county", category: "", county: "", near: null, bounds: null }, ["Columbia"]);
  assert.deepEqual(f.map((x) => [x.key, x.label, x.remove]), [["county", "Columbia County", { q: "" }]]);
});

test("when no single removal helps, the best count is 0", () => {
  const listings = [{ ...base, id: 1, county: "Ulster", category: "food" }];
  const best = mostRestrictiveFilter(listings, { q: "zzz", category: "maple", county: "", near: null, bounds: null });
  assert.equal(best.count, 0);
});

test("no active filters means nothing is most restrictive", () => {
  assert.equal(mostRestrictiveFilter([base], { q: "", category: "", county: "", near: null, bounds: null }), null);
});

// --- Merging nearby approximate circles ----------------------------------------

test("approximate circles within 1.5 miles merge at the average of their centers", () => {
  // ~0.7 mi apart (0.01 deg latitude ~ 0.69 mi).
  const a = { ...base, id: 1, latitude: 42.0, longitude: -74.0, location_precision: "town" };
  const b = { ...base, id: 2, latitude: 42.01, longitude: -74.0, location_precision: "postal_code" };
  const b2 = { ...base, id: 3, latitude: 42.01, longitude: -74.0, location_precision: "postal_code" };
  // ~5.5 mi away: stays separate.
  const far = { ...base, id: 4, latitude: 42.08, longitude: -74.0, location_precision: "town" };
  // A street pin right on top of `a`: never merged into a circle.
  const pin = { ...base, id: 5, latitude: 42.0, longitude: -74.0, location_precision: "street" };
  const groups = groupApproximate(filterListings([a, b, b2, far, pin]));
  assert.equal(groups.length, 2);
  const merged = groups.find((g) => g.listings.length === 3);
  assert.deepEqual(merged.listings.map((l) => l.id).sort(), [1, 2, 3]);
  // Average of the two distinct centers (not weighted by listing count).
  assert.ok(Math.abs(merged.lat - 42.005) < 1e-9);
  assert.ok(Math.abs(merged.lng - -74.0) < 1e-9);
  // Still covers each member's ~2 mile area.
  assert.ok(merged.radiusMeters > APPROXIMATE_RADIUS_METERS);
  assert.ok(groups.every((g) => !g.listings.some((l) => l.id === 5)), "the street pin is never in a circle");
  assert.deepEqual(groups.find((g) => g !== merged).listings.map((l) => l.id), [4]);
});

test("circles just over 1.5 miles apart stay separate", () => {
  // 0.0225 deg latitude ~ 1.55 mi.
  const a = { ...base, id: 1, latitude: 42.0, longitude: -74.0, location_precision: "town" };
  const b = { ...base, id: 2, latitude: 42.0225, longitude: -74.0, location_precision: "town" };
  assert.ok(distanceMiles({ lat: 42, lng: -74 }, { lat: 42.0225, lng: -74 }) > MERGE_DISTANCE_MILES);
  assert.equal(groupApproximate(filterListings([a, b])).length, 2);
});

test("circles chained within 1.5 miles of each other all merge", () => {
  // Three circles 1 mi apart in a line: 1-2 and 2-3 are each within range, so
  // all three share one circle at the average of their centers.
  const step = 1 / 69.05; // ~1 mi of latitude
  const ls = [0, 1, 2].map((i) => ({ ...base, id: i + 1, latitude: 42 + i * step, longitude: -74.0, location_precision: "town" }));
  const groups = groupApproximate(filterListings(ls));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].listings.length, 3);
  assert.ok(Math.abs(groups[0].lat - (42 + step)) < 1e-9);
});
