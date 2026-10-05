// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TRIPS_KEY, MAX_TRIPS, MAX_STOPS, MAX_NAME, DEFAULT_TRIP_NAME, EMPTY_STATE,
  readTrips, writeTrips, normalizeState, cleanName, cleanStops, newTripId,
  createTrip, renameTrip, deleteTrip, setCurrentTrip, addStop, removeStop, removeStops,
  moveStop, importTrip, resolveStops, currentTrip,
} from "./trips.js";

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; } };
}
const blocked = {
  getItem() { throw new DOMException("insecure", "SecurityError"); },
  setItem() { throw new DOMException("insecure", "SecurityError"); },
};
const full = memoryStorage();
full.setItem = () => { throw new DOMException("Quota exceeded", "QuotaExceededError"); };

let n = 0;
const opts = () => ({ now: 1000 + n, id: `trip-${++n}` });
const withTrip = (stops = []) => {
  const { state } = createTrip(EMPTY_STATE, "Fall loop", opts());
  return stops.reduce((s, id) => addStop(s, id, opts()).state, state);
};

// --- Storage -------------------------------------------------------------------

test("trips round-trip under one versioned key, shaped like a database trip", () => {
  const s = memoryStorage();
  const state = withTrip([12, "408"]);
  assert.equal(writeTrips(s, state), true);
  assert.deepEqual(Object.keys(s.data), [TRIPS_KEY]);
  assert.equal(TRIPS_KEY, "hva:trips:v1");
  const stored = JSON.parse(s.data[TRIPS_KEY]);
  assert.equal(stored.v, 1);
  assert.deepEqual(Object.keys(stored.trips[0]).sort(), ["id", "name", "stops", "updatedAt"]);
  assert.deepEqual(stored.trips[0].stops, ["12", "408"]);
  assert.deepEqual(readTrips(s), state);
});

test("blocked or full storage reads as no trips and refuses writes without throwing", () => {
  assert.deepEqual(readTrips(blocked), EMPTY_STATE);
  assert.equal(writeTrips(blocked, withTrip()), false);
  assert.equal(writeTrips(full, withTrip()), false);
  assert.deepEqual(readTrips(null), EMPTY_STATE);
  assert.equal(writeTrips(null, withTrip()), false);
});

test("corrupt or foreign data reads as no trips", () => {
  for (const raw of ["{nope", "null", "[]", '{"v":2,"trips":[]}', '{"v":1,"trips":"x"}', '"str"']) {
    assert.deepEqual(readTrips(memoryStorage({ [TRIPS_KEY]: raw })), EMPTY_STATE, raw);
  }
});

test("stored trips are cleaned: bad trips dropped, limits applied, ids normalised", () => {
  const raw = {
    v: 1,
    current: "missing",
    trips: [
      { id: "a", name: "<b>Fall</b> loop", stops: [5, "5", "", null, 7], updatedAt: 3 },
      { id: "a", name: "duplicate id", stops: [] },
      { name: "no id", stops: [1] },
      null,
      { id: "b", name: "", stops: Array.from({ length: 40 }, (_, i) => i + 1) },
      ...Array.from({ length: 15 }, (_, i) => ({ id: `x${i}`, name: `T${i}`, stops: [] })),
    ],
  };
  const state = normalizeState(raw);
  assert.equal(state.trips.length, MAX_TRIPS);
  assert.deepEqual(state.trips[0], { id: "a", name: "Fall loop", stops: ["5", "7"], updatedAt: 3 });
  assert.equal(state.trips[1].name, DEFAULT_TRIP_NAME);
  assert.equal(state.trips[1].stops.length, MAX_STOPS);
  assert.equal(state.current, "a", "an unknown current trip falls back to the first");
});

test("trip ids are uuids, with a fallback when crypto.randomUUID is missing", () => {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  assert.match(newTripId(), uuid);
  assert.match(newTripId({ getRandomValues: (b) => { b.fill(7); return b; } }), uuid);
  assert.match(newTripId({}), uuid);
  assert.match(newTripId(null), uuid);
  assert.match(newTripId({ randomUUID() { throw new Error("insecure context"); } }), uuid);
});

// --- Limits ----------------------------------------------------------------------

test("at most 10 trips", () => {
  let state = EMPTY_STATE;
  for (let i = 0; i < MAX_TRIPS; i++) state = createTrip(state, `Trip ${i}`, opts()).state;
  assert.equal(state.trips.length, 10);
  const r = createTrip(state, "One too many", opts());
  assert.equal(r.ok, false);
  assert.match(r.error, /up to 10 trips/);
  assert.equal(r.state, state);
});

test("at most 25 stops per trip", () => {
  let state = withTrip(Array.from({ length: MAX_STOPS }, (_, i) => i + 1));
  assert.equal(currentTrip(state).stops.length, 25);
  const r = addStop(state, 999, opts());
  assert.equal(r.ok, false);
  assert.match(r.error, /up to 25 stops/);
  assert.equal(currentTrip(r.state).stops.length, 25);
});

test("trip names are 1-100 characters of plain text", () => {
  assert.equal(cleanName("  Fall   farm loop "), "Fall farm loop");
  assert.equal(cleanName("<script>alert(1)</script>Cider"), "alert(1) Cider");
  assert.equal(cleanName("<img src=x onerror=alert(1)>"), null);
  assert.equal(cleanName("Cider <b"), "Cider", "an unclosed tag is stripped too");
  assert.equal(cleanName("x".repeat(250)).length, MAX_NAME);
  assert.equal(cleanName(""), null);
  assert.equal(cleanName("   "), null);
  assert.equal(cleanName(42), null);
  assert.equal(createTrip(EMPTY_STATE, "   ", opts()).ok, false);
  const state = withTrip();
  assert.equal(renameTrip(state, state.current, "", opts()).ok, false);
  assert.equal(currentTrip(renameTrip(state, state.current, "Apple run", opts()).state).name, "Apple run");
});

// --- Stops -------------------------------------------------------------------------

test("adding the first stop creates 'My trip'", () => {
  const r = addStop(EMPTY_STATE, 12, opts());
  assert.equal(r.ok, true);
  assert.equal(r.state.trips.length, 1);
  assert.equal(currentTrip(r.state).name, DEFAULT_TRIP_NAME);
  assert.deepEqual(currentTrip(r.state).stops, ["12"]);
});

test("stops are de-duplicated as strings", () => {
  let state = withTrip([12]);
  state = addStop(state, "12", opts()).state;
  state = addStop(state, " 12 ", opts()).state;
  assert.deepEqual(currentTrip(state).stops, ["12"]);
  assert.deepEqual(cleanStops([1, "1", 2, null, "", 2, 3]), ["1", "2", "3"]);
  assert.equal(addStop(state, null, opts()).ok, false);
});

test("adding to a named trip makes it current; removing works on the current trip", () => {
  let state = withTrip([1]);
  const first = state.current;
  state = createTrip(state, "Second", opts()).state;
  state = addStop(state, 2, { ...opts(), tripId: first }).state;
  assert.equal(state.current, first);
  assert.deepEqual(currentTrip(state).stops, ["1", "2"]);
  state = removeStop(state, 1, opts()).state;
  assert.deepEqual(currentTrip(state).stops, ["2"]);
  assert.equal(addStop(state, 3, { ...opts(), tripId: "gone" }).ok, false);
});

test("stops reorder with move up / move down; out-of-range moves do nothing", () => {
  let state = withTrip([1, 2, 3]);
  const id = state.current;
  state = moveStop(state, id, 2, -1, opts()).state;
  assert.deepEqual(currentTrip(state).stops, ["1", "3", "2"]);
  state = moveStop(state, id, 0, +1, opts()).state;
  assert.deepEqual(currentTrip(state).stops, ["3", "1", "2"]);
  assert.deepEqual(currentTrip(moveStop(state, id, 0, -1, opts()).state).stops, ["3", "1", "2"]);
  assert.deepEqual(currentTrip(moveStop(state, id, 2, +1, opts()).state).stops, ["3", "1", "2"]);
  assert.deepEqual(currentTrip(moveStop(state, id, 9, -1, opts()).state).stops, ["3", "1", "2"]);
});

test("switching and deleting trips", () => {
  let state = withTrip([1]);
  const a = state.current;
  state = createTrip(state, "B", opts()).state;
  const b = state.current;
  assert.equal(setCurrentTrip(state, a).state.current, a);
  assert.equal(setCurrentTrip(state, "nope").ok, false);
  state = deleteTrip(state, b).state;
  assert.equal(state.current, a, "deleting the current trip falls back to another");
  state = deleteTrip(state, a).state;
  assert.deepEqual(state.trips, []);
  assert.equal(state.current, null);
});

test("a shared trip is imported as a new trip, respecting the limits", () => {
  const r = importTrip(EMPTY_STATE, { ids: ["12", "408", "12", "x"], name: "<i>Fall</i> loop" }, opts());
  assert.equal(r.ok, true);
  assert.deepEqual(currentTrip(r.state).stops, ["12", "408", "x"]);
  assert.equal(currentTrip(r.state).name, "Fall loop");
  assert.equal(importTrip(EMPTY_STATE, { ids: ["1"] }, opts()).trip.name, "Shared trip");
  let fullState = EMPTY_STATE;
  for (let i = 0; i < MAX_TRIPS; i++) fullState = createTrip(fullState, `T${i}`, opts()).state;
  assert.equal(importTrip(fullState, { ids: ["1"] }, opts()).ok, false);
});

// --- Stale ids ------------------------------------------------------------------

test("ids that are no longer listed are skipped but kept until removed", () => {
  const listings = [{ id: 12, name: "Apple Barn" }, { id: 77, name: "Creamery" }];
  let state = withTrip([12, 999, 77, 555]);
  const { found, missing } = resolveStops(currentTrip(state).stops, listings);
  assert.deepEqual(found.map((l) => l.id), [12, 77]);
  assert.deepEqual(missing, ["999", "555"]);
  assert.deepEqual(currentTrip(state).stops, ["12", "999", "77", "555"], "resolving deletes nothing");
  state = removeStops(state, missing, opts()).state;
  assert.deepEqual(currentTrip(state).stops, ["12", "77"]);
});
