// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertMapSnapshot, MIN_MAP_LISTINGS } from "./map-snapshot.js";

const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: i }));

test("the map snapshot threshold is 2,000 rows", () => {
  assert.equal(MIN_MAP_LISTINGS, 2000);
});

test("2,000 or more rows pass", () => {
  assert.doesNotThrow(() => assertMapSnapshot(rows(2000)));
  assert.doesNotThrow(() => assertMapSnapshot(rows(2833)));
});

test("fewer than 2,000 rows fail with the row count in the message", () => {
  assert.throws(() => assertMapSnapshot(rows(1999)), /returned 1999 rows, fewer than the 2000 required/);
  assert.throws(() => assertMapSnapshot([]), /returned 0 rows/);
});

test("a missing or non-array result fails", () => {
  for (const bad of [null, undefined, {}, "rows"]) {
    assert.throws(() => assertMapSnapshot(bad), /no rows array/);
  }
});
