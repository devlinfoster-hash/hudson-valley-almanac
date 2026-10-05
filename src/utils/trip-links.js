// Links for /trip: the share link (?ids=&name=) and map-app directions.
// Pure functions, so they're unit-tested (trip-links.test.js).
import { MAX_STOPS, cleanName } from "./trips.js";
import { coordinatesOf } from "./map-listings.js";

// --- Sharing ------------------------------------------------------------------

// A shared trip carries only listing ids and an optional name: no personal data.
// Ids must be plain positive integers; anything else is ignored, duplicates are
// dropped, and at most MAX_STOPS are kept. The name is plain text, tags
// stripped, capped like any trip name. Nothing from the URL is ever executed or
// rendered as HTML. Returns null when no usable ids are left.
export function parseSharedTrip(params) {
  const get = (k) => (typeof params?.get === "function" ? params.get(k) : null);
  const rawIds = get("ids");
  if (!rawIds) return null;
  const ids = [];
  for (const part of String(rawIds).slice(0, 2000).split(",")) {
    const s = part.trim();
    if (!/^[1-9]\d{0,15}$/.test(s) || ids.includes(s)) continue;
    ids.push(s);
    if (ids.length === MAX_STOPS) break;
  }
  if (!ids.length) return null;
  return { ids, name: cleanName(get("name") || "") };
}

// /trip?ids=12,408,77&name=Fall+farm+loop (only numeric ids are shareable).
export function shareTripUrl(origin, stops, name) {
  const ids = [];
  for (const id of stops || []) {
    const s = String(id);
    if (/^[1-9]\d{0,15}$/.test(s) && !ids.includes(s)) ids.push(s);
    if (ids.length === MAX_STOPS) break;
  }
  const params = new URLSearchParams();
  params.set("ids", ids.join(","));
  const clean = cleanName(name || "");
  if (clean) params.set("name", clean);
  // URLSearchParams encodes the commas; keep them readable.
  return `${origin}/trip?${params.toString().replace(/%2C/g, ",")}`;
}

// --- Directions -----------------------------------------------------------------

const APPROXIMATE_PRECISIONS = new Set(["postal_code", "town"]);
const text = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

// Where the map app should go for one stop:
//   street precision with coordinates -> "lat,lng" (exact)
//   everything else -> the listing's address text, never an approximate
//   circle's centre; with no usable address, "name, town, NY".
// `approximate` marks stops whose directions are to an address or place name
// rather than an exact point.
export function stopDestination(listing) {
  const coords = coordinatesOf(listing);
  if (listing?.location_precision === "street" && coords) {
    return { query: `${coords.lat},${coords.lng}`, approximate: false };
  }
  const address = text(listing?.address);
  if (address) return { query: address, approximate: true };
  const fallback = [text(listing?.name), text(listing?.town), "NY"].filter(Boolean).join(", ");
  return { query: fallback, approximate: true };
}

// Whether to use Apple Maps: iPhone, iPad (including iPadOS's "Macintosh" with
// touch) and Mac.
export function prefersAppleMaps({ userAgent = "", platform = "" } = {}) {
  return /iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(userAgent) || /^Mac/i.test(platform);
}

// Google Maps allows 9 waypoints per link.
export const GOOGLE_MAX_WAYPOINTS = 9;

const enc = encodeURIComponent;

function googleUrl({ origin, destination, waypoints = [] }) {
  let url = "https://www.google.com/maps/dir/?api=1";
  if (origin) url += `&origin=${enc(origin)}`;
  url += `&destination=${enc(destination)}`;
  if (waypoints.length) url += `&waypoints=${waypoints.map(enc).join("%7C")}`;
  return url;
}

// Apple Maps: saddr is the start (omitted = current location); daddr chains
// each further stop with "+to:".
function appleUrl({ origin, stops }) {
  let url = "https://maps.apple.com/?";
  if (origin) url += `saddr=${enc(origin)}&`;
  return url + `daddr=${stops.map(enc).join("+to:")}`;
}

// Directions for the whole trip, in stop order, starting from wherever the
// person is (the map app's current location). Returns one or more legs:
//   [{ url, label, from, to }]  (from/to are 1-based stop numbers)
// Google links carry at most 9 waypoints, so longer trips are split into legs,
// each starting at the stop where the previous one ended: the first leg covers
// stops 1-10 (9 waypoints + destination); later legs start at the previous
// leg's last stop and cover up to 10 more. Apple Maps takes the whole chain in
// one link. No stop is ever dropped; no times or distances are computed.
export function tripDirections(destinations, { apple = false } = {}) {
  const stops = (destinations || []).map((d) => (typeof d === "string" ? d : d?.query)).filter(Boolean);
  if (!stops.length) return [];
  if (apple) {
    return [{ url: appleUrl({ stops }), label: stops.length === 1 ? "Stop 1" : `Stops 1-${stops.length}`, from: 1, to: stops.length }];
  }
  const legs = [];
  // First leg: from current location, up to 9 waypoints + destination.
  let end = Math.min(stops.length, GOOGLE_MAX_WAYPOINTS + 1);
  legs.push({ from: 1, to: end, url: googleUrl({ destination: stops[end - 1], waypoints: stops.slice(0, end - 1) }) });
  // Later legs: from the previous leg's last stop, up to 9 waypoints + destination.
  while (end < stops.length) {
    const start = end; // 1-based number of the stop we start from
    const last = Math.min(stops.length, start + GOOGLE_MAX_WAYPOINTS + 1);
    legs.push({
      from: start,
      to: last,
      url: googleUrl({ origin: stops[start - 1], destination: stops[last - 1], waypoints: stops.slice(start, last - 1) }),
    });
    end = last;
  }
  return legs.map((leg, i) => ({
    ...leg,
    label: legs.length === 1
      ? (leg.to === 1 ? "Stop 1" : `Stops ${leg.from}-${leg.to}`)
      : `Part ${i + 1} of ${legs.length}: stops ${leg.from}-${leg.to}`,
  }));
}

// Directions from the current location to one stop.
export function stopDirections(destination, { apple = false } = {}) {
  const query = typeof destination === "string" ? destination : destination?.query;
  if (!query) return null;
  return apple ? appleUrl({ stops: [query] }) : googleUrl({ destination: query });
}
