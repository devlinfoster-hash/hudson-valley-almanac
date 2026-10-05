// Pure helpers for the /map discovery page: how (and whether) a listing is drawn
// on the map, the list filters, and the URL query-string sync. No window, DOM,
// Leaflet or Supabase here, so it runs under `node --test` and during the SSG
// prerender alike.
import { getCategoryForKey, categoryKeys, getCategory } from "../catalog.js";

export const NOT_AVAILABLE = "Information not available";
export const NOT_ON_MAP = "Not shown on map";
export const APPROXIMATE_LABEL = "approximate area";

// postal_code / town coordinates are a centroid, not the place itself, so they
// are drawn as a circle of about two miles rather than a pin.
export const METERS_PER_MILE = 1609.344;
export const APPROXIMATE_RADIUS_MILES = 2;
export const APPROXIMATE_RADIUS_METERS = APPROXIMATE_RADIUS_MILES * METERS_PER_MILE;

export const NEAR_ME_RADII = [5, 10, 25, 50];
export const DEFAULT_NEAR_ME_RADIUS = 10;

const APPROXIMATE_PRECISIONS = new Set(["postal_code", "town"]);

function toCoordinate(value, limit) {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || Math.abs(n) > limit) return null;
  return n;
}

// The listing's coordinates as numbers, or null when either is missing or not a
// valid latitude/longitude. (numeric columns can arrive from PostgREST as strings.)
export function coordinatesOf(listing) {
  const lat = toCoordinate(listing?.latitude, 90);
  const lng = toCoordinate(listing?.longitude, 180);
  if (lat === null || lng === null) return null;
  return { lat, lng };
}

// How a listing goes on the map:
//   "point"  - street precision: a normal pin.
//   "circle" - postal_code / town precision: a ~2 mile translucent circle,
//              never a pin, because the exact spot is not known.
//   "none"   - no usable coordinates, precision "none", or an unknown precision
//              value: not drawn at all (it still appears in the list as "Not
//              shown on map").
export function mapPlacement(listing) {
  const coords = coordinatesOf(listing);
  const precision = listing?.location_precision;
  if (!coords || !precision || precision === "none") return { kind: "none" };
  if (precision === "street") return { kind: "point", ...coords };
  if (APPROXIMATE_PRECISIONS.has(precision)) {
    return { kind: "circle", ...coords, radiusMeters: APPROXIMATE_RADIUS_METERS };
  }
  return { kind: "none" };
}

export function isShownOnMap(listing) {
  return mapPlacement(listing).kind !== "none";
}

export function isVerified(listing) {
  return listing?.verification_status === "verified";
}

// A display value, or the "Information not available" placeholder for blanks.
export function displayValue(value) {
  if (value === null || value === undefined) return NOT_AVAILABLE;
  const s = String(value).trim();
  return s ? s : NOT_AVAILABLE;
}

export function townCountyLine(listing) {
  const town = (listing?.town || "").trim();
  const county = (listing?.county || "").trim();
  if (!town && !county) return NOT_AVAILABLE;
  if (!county) return town;
  const countyLabel = county === "Online" || county === "Statewide" ? county : `${county} County`;
  return town ? `${town}, ${countyLabel}` : countyLabel;
}

// Matches the listing page: a bare domain gets https://. Anything with another
// scheme (javascript:, mailto:, ...) is shown as text, not linked.
export function websiteHref(website) {
  const w = (website || "").trim();
  if (!w) return null;
  if (/^https?:\/\//i.test(w)) return w;
  if (/^[a-z][a-z0-9+.-]*:/i.test(w)) return null;
  return "https://" + w;
}

export function telHref(phone) {
  const digits = (phone || "").replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : null;
}

// --- Category styling ------------------------------------------------------

// One color per catalog tile (keyed by tile id from src/catalog.js).
const CATEGORY_COLORS = {
  feed: "#8A6D1F",
  animals: "#9C4A1A",
  artisanfood: "#B5651D",
  land: "#5B4636",
  food: "#A23B2A",
  water: "#1F6E9C",
  seeds: "#3C7A2E",
  learn: "#4B3F8C",
  equipment: "#4A5560",
  hearth: "#C2410C",
  farmservices: "#6B5B2E",
  health: "#2F7D5B",
  fiber: "#8E3B76",
  maple: "#C4862D",
  craftbeverages: "#7A2E3A",
  trades: "#6E5A44",
  markets: "#1C3A5E",
  "professional-services": "#3E5C76",
  outdoor: "#2E6B3A",
  apothecary: "#9B5DA5",
  forage: "#7B4B2A",
  artisan: "#A0522D",
  mutualaid: "#B83A5A",
  cannabis: "#4F7F2A",
  "buy-sell-trade": "#5E6B7A",
};
const FALLBACK_STYLE = { id: null, label: "Other", icon: "📍", color: "#4A6472" };

// The catalog tile a raw DB category belongs to, with its map color.
export function categoryStyle(dbCategory) {
  const cat = getCategoryForKey(dbCategory);
  if (!cat) return FALLBACK_STYLE;
  return { id: cat.id, label: cat.label, icon: cat.icon, color: CATEGORY_COLORS[cat.id] || FALLBACK_STYLE.color };
}

// --- Filtering -------------------------------------------------------------

export function distanceMiles(a, b) {
  const R = 3958.7613;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function normalize(s) {
  return String(s || "").toLowerCase();
}

// Every word of the query must appear in the name, town, county or a tag.
export function matchesSearch(listing, query) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = [listing.name, listing.town, listing.county, ...(listing.tags || [])]
    .map(normalize)
    .join(" \u0000 ");
  return words.every((w) => haystack.includes(w));
}

export function inBounds(coords, bounds) {
  if (!coords || !bounds) return false;
  const { south, west, north, east } = bounds;
  if (coords.lat < south || coords.lat > north) return false;
  // Bounds that cross the antimeridian have west > east.
  return west <= east ? coords.lng >= west && coords.lng <= east : coords.lng >= west || coords.lng <= east;
}

// Filters: { q, category (tile id), county, bounds, near: {lat,lng}, radius }.
// The area and near-me filters need coordinates, so listings not shown on the
// map drop out while either is active. Returns rows of { listing, placement,
// distance } — distance in miles when near-me is active, otherwise null —
// sorted by distance under near-me and in input order otherwise.
export function filterListings(listings, filters = {}) {
  const tile = filters.category ? getCategory(filters.category) : null;
  const keys = tile ? new Set(categoryKeys(tile)) : null;
  const near = filters.near || null;
  const radius = filters.radius || DEFAULT_NEAR_ME_RADIUS;
  const rows = [];
  for (const listing of listings || []) {
    if (keys && !keys.has(listing.category)) continue;
    if (filters.county && listing.county !== filters.county) continue;
    if (!matchesSearch(listing, filters.q)) continue;
    const placement = mapPlacement(listing);
    const coords = placement.kind === "none" ? null : { lat: placement.lat, lng: placement.lng };
    if (filters.bounds && !inBounds(coords, filters.bounds)) continue;
    let distance = null;
    if (near) {
      if (!coords) continue;
      distance = distanceMiles(near, coords);
      if (distance > radius) continue;
    }
    rows.push({ listing, placement, distance });
  }
  if (near) rows.sort((a, b) => a.distance - b.distance);
  return rows;
}

// Circles at the same spot (every listing geocoded to one town or ZIP centroid)
// are merged into a single circle, so they don't stack into an opaque blob.
export function groupApproximate(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (row.placement.kind !== "circle") continue;
    const key = `${row.placement.lat.toFixed(5)},${row.placement.lng.toFixed(5)}`;
    if (!groups.has(key)) groups.set(key, { key, lat: row.placement.lat, lng: row.placement.lng, radiusMeters: row.placement.radiusMeters, listings: [] });
    groups.get(key).listings.push(row.listing);
  }
  return [...groups.values()];
}

// --- URL query string ------------------------------------------------------

function parseNumberList(value, count) {
  if (!value) return null;
  const parts = value.split(",").map((p) => Number(p));
  if (parts.length !== count || parts.some((n) => !Number.isFinite(n))) return null;
  return parts;
}

// URLSearchParams -> filters. Invalid values are ignored rather than guessed.
export function parseFilters(params) {
  const get = (k) => (params.get(k) || "").trim();
  // q keeps its spaces so the search box can bind straight to it while typing.
  const filters = { q: params.get("q") || "", category: "", county: get("county"), bounds: null, near: null, radius: DEFAULT_NEAR_ME_RADIUS };
  const category = get("category");
  if (category && getCategory(category)) filters.category = category;
  const bbox = parseNumberList(get("bbox"), 4);
  if (bbox) {
    const [south, west, north, east] = bbox;
    if (south <= north && Math.abs(south) <= 90 && Math.abs(north) <= 90 && Math.abs(west) <= 180 && Math.abs(east) <= 180) {
      filters.bounds = { south, west, north, east };
    }
  }
  const near = parseNumberList(get("near"), 2);
  if (near && Math.abs(near[0]) <= 90 && Math.abs(near[1]) <= 180) {
    filters.near = { lat: near[0], lng: near[1] };
  }
  const r = Number(get("r"));
  if (NEAR_ME_RADII.includes(r)) filters.radius = r;
  return filters;
}

const round = (n, places) => Number(n.toFixed(places));

// filters -> query-string entries. Near-me coordinates are rounded to two
// decimals (about a kilometer) so a shared link doesn't carry a precise location.
export function filtersToParams(filters) {
  const out = new URLSearchParams();
  if (filters.q) out.set("q", filters.q);
  if (filters.category) out.set("category", filters.category);
  if (filters.county) out.set("county", filters.county);
  if (filters.bounds) {
    const { south, west, north, east } = filters.bounds;
    out.set("bbox", [south, west, north, east].map((n) => round(n, 4)).join(","));
  }
  if (filters.near) out.set("near", `${round(filters.near.lat, 2)},${round(filters.near.lng, 2)}`);
  // Kept even before "Near me" is used, so a radius picked first isn't lost.
  if (filters.radius && filters.radius !== DEFAULT_NEAR_ME_RADIUS) out.set("r", String(filters.radius));
  return out;
}
