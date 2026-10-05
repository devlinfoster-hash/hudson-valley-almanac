// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseSharedTrip, shareTripUrl, stopDestination, prefersAppleMaps, tripDirections, stopDirections, GOOGLE_MAX_WAYPOINTS,
} from "./trip-links.js";

const params = (q) => new URLSearchParams(q);

// --- ?ids= parsing ---------------------------------------------------------------

test("?ids= keeps numeric ids in order and drops bad ones", () => {
  assert.deepEqual(parseSharedTrip(params("ids=12,408,77")), { ids: ["12", "408", "77"], name: null });
  assert.deepEqual(parseSharedTrip(params("ids=12,abc,-4,0,4.5,1e3,%20 9 ,,77,<b>1</b>")).ids, ["12", "9", "77"]);
  assert.equal(parseSharedTrip(params("ids=abc,def")), null);
  assert.equal(parseSharedTrip(params("ids=")), null);
  assert.equal(parseSharedTrip(params("name=Fall")), null);
  assert.equal(parseSharedTrip(null), null);
});

test("?ids= drops duplicates and caps at 25", () => {
  assert.deepEqual(parseSharedTrip(params("ids=5,5,6,5,6")).ids, ["5", "6"]);
  const many = Array.from({ length: 40 }, (_, i) => i + 1).join(",");
  const parsed = parseSharedTrip(params(`ids=${many}`));
  assert.equal(parsed.ids.length, 25);
  assert.equal(parsed.ids[24], "25");
});

test("the shared name is plain text, HTML stripped and capped", () => {
  assert.equal(parseSharedTrip(params("ids=1&name=Fall+farm+loop")).name, "Fall farm loop");
  assert.equal(parseSharedTrip(params("ids=1&name=%3Cscript%3Ealert(1)%3C%2Fscript%3EFall")).name, "alert(1) Fall");
  assert.equal(parseSharedTrip(params("ids=1&name=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E")).name, null);
  assert.equal(parseSharedTrip(params(`ids=1&name=${"x".repeat(300)}`)).name.length, 100);
});

test("the share link carries only ids and an optional name", () => {
  assert.equal(shareTripUrl("https://example.com", ["12", "408", "77"], "Fall farm loop"), "https://example.com/trip?ids=12,408,77&name=Fall+farm+loop");
  assert.equal(shareTripUrl("https://example.com", ["12"], ""), "https://example.com/trip?ids=12");
  assert.equal(shareTripUrl("https://example.com", ["12", "12", "x"], "<b>Hi</b> & bye"), "https://example.com/trip?ids=12&name=Hi+%26+bye");
  // What we share, we can read back.
  const url = new URL(shareTripUrl("https://example.com", ["3", "1", "2"], "Loop"));
  assert.deepEqual(parseSharedTrip(url.searchParams), { ids: ["3", "1", "2"], name: "Loop" });
});

// --- Stop destinations ---------------------------------------------------------------

const street = { id: 1, name: "Apple Barn", town: "Kingston", address: "12 Main St, Kingston, NY 12401", latitude: 41.9312, longitude: -73.9967, location_precision: "street" };
const townOnly = { id: 2, name: "Cider House", town: "Hudson", address: "400 Warren St, Hudson, NY 12534", latitude: 42.25, longitude: -73.79, location_precision: "town" };
const zipNoAddress = { id: 3, name: "Creamery", town: "Chatham", address: "  ", latitude: 42.36, longitude: -73.6, location_precision: "postal_code" };
const noCoords = { id: 4, name: "Farm Stand", town: null, address: null, latitude: null, longitude: null, location_precision: "none" };

test("street stops go to their exact coordinates", () => {
  assert.deepEqual(stopDestination(street), { query: "41.9312,-73.9967", approximate: false });
});

test("approximate stops go to their address text, never the circle centre", () => {
  const d = stopDestination(townOnly);
  assert.deepEqual(d, { query: "400 Warren St, Hudson, NY 12534", approximate: true });
  assert.ok(!d.query.includes("42.25"));
});

test("with no usable address, 'name, town, NY'", () => {
  assert.deepEqual(stopDestination(zipNoAddress), { query: "Creamery, Chatham, NY", approximate: true });
  assert.deepEqual(stopDestination(noCoords), { query: "Farm Stand, NY", approximate: true });
  // A street listing missing its coordinates falls back to its address.
  assert.deepEqual(stopDestination({ ...street, latitude: null }), { query: "12 Main St, Kingston, NY 12401", approximate: true });
});

test("Apple Maps on iPhone, iPad and Mac; Google elsewhere", () => {
  assert.equal(prefersAppleMaps({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)" }), true);
  assert.equal(prefersAppleMaps({ userAgent: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X)" }), true);
  assert.equal(prefersAppleMaps({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)" }), true);
  assert.equal(prefersAppleMaps({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8)" }), false);
  assert.equal(prefersAppleMaps({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }), false);
  assert.equal(prefersAppleMaps({}), false);
});

// --- Directions links -------------------------------------------------------------------

const dests = (n) => Array.from({ length: n }, (_, i) => `Stop ${i + 1}`);

test("Google: one link with destination and | separated, encoded waypoints", () => {
  const legs = tripDirections([stopDestination(street), stopDestination(townOnly), stopDestination(zipNoAddress)]);
  assert.equal(legs.length, 1);
  assert.equal(legs[0].label, "Stops 1-3");
  assert.equal(
    legs[0].url,
    "https://www.google.com/maps/dir/?api=1&destination=Creamery%2C%20Chatham%2C%20NY&waypoints=41.9312%2C-73.9967%7C400%20Warren%20St%2C%20Hudson%2C%20NY%2012534"
  );
  const u = new URL(legs[0].url);
  assert.equal(u.searchParams.get("waypoints"), "41.9312,-73.9967|400 Warren St, Hudson, NY 12534");
  assert.equal(u.searchParams.get("origin"), null, "the first leg starts from the current location");
});

test("Apple: daddr chains every stop with +to:", () => {
  const [leg] = tripDirections([stopDestination(street), stopDestination(townOnly), "A & B, NY"], { apple: true });
  assert.equal(leg.url, "https://maps.apple.com/?daddr=41.9312%2C-73.9967+to:400%20Warren%20St%2C%20Hudson%2C%20NY%2012534+to:A%20%26%20B%2C%20NY");
  assert.equal(new URL(leg.url).searchParams.get("daddr"), "41.9312,-73.9967 to:400 Warren St, Hudson, NY 12534 to:A & B, NY");
});

test("Google trips over 9 waypoints split into legs, each starting where the last ended", () => {
  assert.equal(GOOGLE_MAX_WAYPOINTS, 9);
  assert.equal(tripDirections(dests(10)).length, 1, "10 stops = 9 waypoints + destination");
  const legs = tripDirections(dests(19));
  assert.deepEqual(legs.map((l) => l.label), ["Part 1 of 2: stops 1-10", "Part 2 of 2: stops 10-19"]);
  const [a, b] = legs.map((l) => new URL(l.url).searchParams);
  assert.equal(a.get("destination"), "Stop 10");
  assert.equal(a.get("waypoints").split("|").length, 9);
  assert.equal(b.get("origin"), "Stop 10");
  assert.equal(b.get("destination"), "Stop 19");
  assert.deepEqual(b.get("waypoints").split("|"), dests(18).slice(10));
  // Every leg stays within 9 waypoints, and every stop is visited.
  const big = tripDirections(dests(25));
  assert.deepEqual(big.map((l) => [l.from, l.to]), [[1, 10], [10, 20], [20, 25]]);
  const visited = new Set();
  for (const l of big) {
    const p = new URL(l.url).searchParams;
    assert.ok((p.get("waypoints") || "").split("|").filter(Boolean).length <= 9);
    [p.get("origin"), ...(p.get("waypoints") || "").split("|"), p.get("destination")].filter(Boolean).forEach((s) => visited.add(s));
  }
  assert.equal(visited.size, 25);
});

test("Apple keeps long trips in one link (no stop dropped)", () => {
  const [leg, ...rest] = tripDirections(dests(25), { apple: true });
  assert.equal(rest.length, 0);
  assert.equal(new URL(leg.url).searchParams.get("daddr").split(" to:").length, 25);
});

test("a single stop, an empty trip, and per-stop directions", () => {
  assert.equal(tripDirections(["Only"])[0].label, "Stop 1");
  assert.deepEqual(tripDirections([]), []);
  assert.equal(stopDirections(stopDestination(street)), "https://www.google.com/maps/dir/?api=1&destination=41.9312%2C-73.9967");
  assert.equal(stopDirections(stopDestination(zipNoAddress), { apple: true }), "https://maps.apple.com/?daddr=Creamery%2C%20Chatham%2C%20NY");
  assert.equal(stopDirections(""), null);
});
