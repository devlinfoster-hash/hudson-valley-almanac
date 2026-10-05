// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { SAVED_KEY, readSaved, writeSaved, toggleId, savedListings, storageWorks } from "./saved.js";

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

const throwing = {
  getItem() { throw new DOMException("The operation is insecure.", "SecurityError"); },
  setItem() { throw new DOMException("The operation is insecure.", "SecurityError"); },
};

const full = memoryStorage();
full.setItem = () => { throw new DOMException("Quota exceeded", "QuotaExceededError"); };

test("saved ids round-trip under one versioned key", () => {
  const s = memoryStorage();
  assert.equal(writeSaved(s, ["3", "1"]), true);
  assert.deepEqual(Object.keys(s.data), [SAVED_KEY]);
  assert.equal(SAVED_KEY, "hva:saved:v1");
  assert.deepEqual(JSON.parse(s.data[SAVED_KEY]), { v: 1, ids: ["3", "1"] });
  assert.deepEqual(readSaved(s), ["3", "1"]);
});

test("blocked storage reads as nothing saved and refuses writes without throwing", () => {
  assert.deepEqual(readSaved(throwing), []);
  assert.equal(writeSaved(throwing, ["1"]), false);
  assert.deepEqual(readSaved(null), []);
  assert.deepEqual(readSaved(undefined), []);
  assert.equal(writeSaved(null, ["1"]), false);
});

test("full storage refuses the write without throwing", () => {
  assert.equal(writeSaved(full, ["1", "2"]), false);
  assert.deepEqual(readSaved(full), []);
});

test("storageWorks tells blocked or full storage apart from working storage", () => {
  assert.equal(storageWorks(memoryStorage()), true);
  assert.equal(storageWorks(throwing), false);
  assert.equal(storageWorks(full), false);
  assert.equal(storageWorks(null), false);
});

test("corrupt or foreign data under the key reads as nothing saved", () => {
  for (const raw of ["{not json", "null", "[1,2,3]", '{"v":2,"ids":["1"]}', '{"v":1,"ids":"1"}', '"just a string"']) {
    assert.deepEqual(readSaved(memoryStorage({ [SAVED_KEY]: raw })), [], raw);
  }
});

test("ids are normalised to strings and de-duplicated", () => {
  const s = memoryStorage({ [SAVED_KEY]: JSON.stringify({ v: 1, ids: [5, "5", null, "", 7] }) });
  assert.deepEqual(readSaved(s), ["5", "7"]);
});

test("toggling adds to the front and removes", () => {
  assert.deepEqual(toggleId([], 4), ["4"]);
  assert.deepEqual(toggleId(["4"], 9), ["9", "4"]);
  assert.deepEqual(toggleId(["9", "4"], "4"), ["9"]);
  assert.deepEqual(toggleId(["9"], null), ["9"]);
});

test("unknown ids are skipped; saved order is kept", () => {
  const listings = [{ id: 1, name: "Apple Barn" }, { id: 2, name: "Cider House" }, { id: 3, name: "Creamery" }];
  assert.deepEqual(savedListings(["3", "999", "1", "gone"], listings).map((l) => l.id), [3, 1]);
  assert.deepEqual(savedListings([], listings), []);
  assert.deepEqual(savedListings(["1"], []), []);
  assert.deepEqual(savedListings(["1"], undefined), []);
});
