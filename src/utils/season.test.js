import { test } from "node:test";
import assert from "node:assert/strict";
import { localToday, isSeasonEnded } from "./season.js";

test("localToday uses local date parts", () => {
  assert.equal(localToday(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
  assert.equal(localToday(new Date(2026, 11, 31, 0, 0)), "2026-12-31");
});

test("isSeasonEnded: only dates before today count as ended", () => {
  const today = "2026-10-09";
  assert.equal(isSeasonEnded("2026-10-08", today), true);
  assert.equal(isSeasonEnded("2025-12-31", today), true);
  assert.equal(isSeasonEnded("2026-10-09", today), false);
  assert.equal(isSeasonEnded("2026-10-10", today), false);
});

test("isSeasonEnded is null-safe", () => {
  for (const v of [null, undefined, "", "not a date"]) {
    assert.equal(isSeasonEnded(v, "2026-10-09"), false);
  }
  assert.equal(isSeasonEnded("2020-01-01", null), false);
});
