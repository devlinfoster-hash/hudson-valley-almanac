// Trips: named, ordered lists of listing ids, kept on this device only (no
// accounts), in localStorage under one versioned key:
//
//   hva:trips:v1 = { v: 1, current: <trip id>, trips: [ { id, name, stops: [listingId, ...], updatedAt } ] }
//
// Each trip is deliberately shaped like a future database row (uuid id, name,
// ordered stops, updatedAt) so a later round can sync it to accounts. `current`
// is a device preference (which trip the "Add to trip" buttons use), not part
// of a trip.
//
// Storage can be missing, blocked or full, and the stored value can be corrupt,
// so every read and write is wrapped: a failed read means "no trips", and a
// failed write keeps the change in memory for this visit (the UI says so).
//
// The pure functions below take and return plain state objects so they can be
// tested without a browser; the store at the bottom is what the UI uses (via
// useTrips in TripButton.jsx).

export const TRIPS_KEY = "hva:trips:v1";
export const MAX_TRIPS = 10;
export const MAX_STOPS = 25;
export const MAX_NAME = 100;
export const DEFAULT_TRIP_NAME = "My trip";

// Listing ids as strings; blanks are dropped.
export const normId = (id) => (id === null || id === undefined || String(id).trim() === "" ? null : String(id).trim());

// A trip name as plain text: tags removed, whitespace collapsed, 1-100 chars.
// Returns null when nothing usable is left.
export function cleanName(name) {
  if (typeof name !== "string") return null;
  const text = name
    .replace(/<[^>]*>?/g, " ") // strip anything tag-like, including an unclosed one
    .replace(/[<>]/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME)
    .trim();
  return text || null;
}

// Stop ids as unique strings, in order, at most MAX_STOPS.
export function cleanStops(stops) {
  const out = [];
  for (const id of Array.isArray(stops) ? stops : []) {
    const key = normId(id);
    if (key && !out.includes(key)) out.push(key);
    if (out.length === MAX_STOPS) break;
  }
  return out;
}

// RFC 4122 v4 id: crypto.randomUUID where available, else built from
// crypto.getRandomValues, else (very old browsers) Math.random.
export function newTripId(cryptoObj = globalThis.crypto) {
  try {
    if (cryptoObj && typeof cryptoObj.randomUUID === "function") return cryptoObj.randomUUID();
  } catch {
    // fall through
  }
  const bytes = new Uint8Array(16);
  try {
    if (cryptoObj && typeof cryptoObj.getRandomValues === "function") cryptoObj.getRandomValues(bytes);
    else throw new Error("no getRandomValues");
  } catch {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const EMPTY_STATE = Object.freeze({ v: 1, current: null, trips: Object.freeze([]) });

// Whatever was stored, as a valid state (bad trips dropped, limits applied).
export function normalizeState(raw) {
  if (!raw || raw.v !== 1 || !Array.isArray(raw.trips)) return EMPTY_STATE;
  const trips = [];
  const seen = new Set();
  for (const t of raw.trips) {
    if (!t || typeof t.id !== "string" || !t.id || seen.has(t.id)) continue;
    seen.add(t.id);
    trips.push({
      id: t.id,
      name: cleanName(t.name) || DEFAULT_TRIP_NAME,
      stops: cleanStops(t.stops),
      updatedAt: Number.isFinite(t.updatedAt) ? t.updatedAt : 0,
    });
    if (trips.length === MAX_TRIPS) break;
  }
  const current = trips.some((t) => t.id === raw.current) ? raw.current : trips[0]?.id ?? null;
  return { v: 1, current, trips };
}

export function readTrips(storage) {
  try {
    const raw = storage?.getItem(TRIPS_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : EMPTY_STATE;
  } catch {
    return EMPTY_STATE;
  }
}

// True when stored, false when storage refused it.
export function writeTrips(storage, state) {
  try {
    if (!storage) return false;
    storage.setItem(TRIPS_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

// --- Pure operations: (state, ...) -> { state, ok, error? } ------------------

export const currentTrip = (state) => state.trips.find((t) => t.id === state.current) || null;

const fail = (state, error) => ({ state, ok: false, error });
const updateTrip = (state, tripId, fn, now) => ({
  ...state,
  trips: state.trips.map((t) => (t.id === tripId ? { ...fn(t), updatedAt: now } : t)),
});

export function createTrip(state, name, { now = Date.now(), id = newTripId() } = {}) {
  if (state.trips.length >= MAX_TRIPS) return fail(state, `You can have up to ${MAX_TRIPS} trips. Delete one to start another.`);
  const clean = name === undefined ? DEFAULT_TRIP_NAME : cleanName(name);
  if (!clean) return fail(state, "Give the trip a name.");
  const trip = { id, name: clean, stops: [], updatedAt: now };
  return { state: { ...state, current: id, trips: [...state.trips, trip] }, ok: true, trip };
}

export function renameTrip(state, tripId, name, { now = Date.now() } = {}) {
  const clean = cleanName(name);
  if (!clean) return fail(state, "Give the trip a name.");
  if (!state.trips.some((t) => t.id === tripId)) return fail(state, "That trip no longer exists.");
  return { state: updateTrip(state, tripId, (t) => ({ ...t, name: clean }), now), ok: true };
}

export function deleteTrip(state, tripId) {
  const trips = state.trips.filter((t) => t.id !== tripId);
  if (trips.length === state.trips.length) return fail(state, "That trip no longer exists.");
  const current = state.current === tripId ? trips[0]?.id ?? null : state.current;
  return { state: { ...state, current, trips }, ok: true };
}

export function setCurrentTrip(state, tripId) {
  if (!state.trips.some((t) => t.id === tripId)) return fail(state, "That trip no longer exists.");
  return { state: { ...state, current: tripId }, ok: true };
}

// Adds a stop to `tripId` (default: the current trip, creating "My trip" when
// there is none). Adding an id that's already there is a no-op success.
export function addStop(state, listingId, { tripId, now = Date.now(), id } = {}) {
  const key = normId(listingId);
  if (!key) return fail(state, "That listing can't be added.");
  let next = state;
  let target = tripId || state.current;
  if (!target || !state.trips.some((t) => t.id === target)) {
    if (tripId) return fail(state, "That trip no longer exists.");
    const created = createTrip(state, undefined, { now, id: id || newTripId() });
    if (!created.ok) return created;
    next = created.state;
    target = created.trip.id;
  }
  const trip = next.trips.find((t) => t.id === target);
  if (trip.stops.includes(key)) return { state: { ...next, current: target }, ok: true };
  if (trip.stops.length >= MAX_STOPS) return fail(state, `A trip can have up to ${MAX_STOPS} stops.`);
  next = updateTrip(next, target, (t) => ({ ...t, stops: [...t.stops, key] }), now);
  return { state: { ...next, current: target }, ok: true };
}

export function removeStop(state, listingId, { tripId = state.current, now = Date.now() } = {}) {
  const key = normId(listingId);
  const trip = state.trips.find((t) => t.id === tripId);
  if (!trip || !trip.stops.includes(key)) return { state, ok: true };
  return { state: updateTrip(state, tripId, (t) => ({ ...t, stops: t.stops.filter((s) => s !== key) }), now), ok: true };
}

// Removes several stops at once (e.g. ids that are no longer listed).
export function removeStops(state, listingIds, { tripId = state.current, now = Date.now() } = {}) {
  const drop = new Set((listingIds || []).map(normId));
  const trip = state.trips.find((t) => t.id === tripId);
  if (!trip) return { state, ok: true };
  return { state: updateTrip(state, tripId, (t) => ({ ...t, stops: t.stops.filter((s) => !drop.has(s)) }), now), ok: true };
}

// Moves the stop at `index` by `delta` (-1 up, +1 down). Out-of-range moves
// are no-ops.
export function moveStop(state, tripId, index, delta, { now = Date.now() } = {}) {
  const trip = state.trips.find((t) => t.id === tripId);
  const to = index + delta;
  if (!trip || index < 0 || index >= trip.stops.length || to < 0 || to >= trip.stops.length) return { state, ok: true };
  return {
    state: updateTrip(state, tripId, (t) => {
      const stops = [...t.stops];
      [stops[index], stops[to]] = [stops[to], stops[index]];
      return { ...t, stops };
    }, now),
    ok: true,
  };
}

// Copies a shared trip ({ ids, name }) into this device's trips as a new trip.
export function importTrip(state, shared, { now = Date.now(), id = newTripId() } = {}) {
  const created = createTrip(state, cleanName(shared?.name) || "Shared trip", { now, id });
  if (!created.ok) return created;
  const stops = cleanStops(shared?.ids);
  return {
    state: updateTrip(created.state, id, (t) => ({ ...t, stops }), now),
    ok: true,
    trip: { ...created.trip, stops },
  };
}

// The trip's stops split into the listings that still exist (in trip order)
// and the ids that don't. Stale ids are reported, never deleted here.
export function resolveStops(stops, listings) {
  const byId = new Map();
  for (const l of listings || []) {
    const key = normId(l?.id);
    if (key) byId.set(key, l);
  }
  const found = [];
  const missing = [];
  for (const id of stops || []) {
    const l = byId.get(normId(id));
    if (l) found.push(l);
    else missing.push(normId(id));
  }
  return { found, missing };
}

// --- Store ------------------------------------------------------------------

function browserStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

let snapshot = null; // { state, persisted } once read on the client
const SERVER_SNAPSHOT = Object.freeze({ state: EMPTY_STATE, persisted: true });
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

export function getTripsSnapshot() {
  if (snapshot === null) snapshot = { state: readTrips(browserStorage()), persisted: true };
  return snapshot;
}

// Prerender and the first client render see no trips, so hydration matches.
export function getServerTripsSnapshot() {
  return SERVER_SNAPSHOT;
}

function onStorage(e) {
  if (e.key !== TRIPS_KEY) return;
  snapshot = { state: readTrips(browserStorage()), persisted: true };
  emit();
}

export function subscribeTrips(fn) {
  if (listeners.size === 0 && typeof window !== "undefined") window.addEventListener("storage", onStorage);
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

// Applies a pure operation to the stored trips. Returns its result plus
// `persisted` (false: the change only lasts for this visit).
export function updateTrips(op) {
  const result = op(getTripsSnapshot().state);
  if (!result.ok) return { ...result, persisted: snapshot.persisted };
  const persisted = writeTrips(browserStorage(), result.state);
  snapshot = { state: result.state, persisted };
  emit();
  return { ...result, persisted };
}
