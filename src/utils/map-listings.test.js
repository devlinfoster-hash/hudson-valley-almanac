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
  parseFilters,
  filtersToParams,
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
  assert.deepEqual(groups[0].listings.map((l) => l.id), [1, 2]);
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
