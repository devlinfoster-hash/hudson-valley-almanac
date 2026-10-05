// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertMapSnapshot, assertSupabaseEnvForCi, isCiBuild, MIN_MAP_LISTINGS } from "./map-snapshot.js";

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

// --- Missing Supabase env on Vercel/CI -------------------------------------

const creds = { url: "https://x.supabase.co", key: "anon" };
const none = { url: undefined, key: undefined };

test("VERCEL or CI marks a CI build; unset, empty, 0 and false do not", () => {
  assert.equal(isCiBuild({ VERCEL: "1" }), true);
  assert.equal(isCiBuild({ CI: "true" }), true);
  assert.equal(isCiBuild({ CI: "1" }), true);
  for (const env of [{}, { CI: "" }, { CI: "0" }, { CI: "false" }, { VERCEL: "FALSE" }]) {
    assert.equal(isCiBuild(env), false, JSON.stringify(env));
  }
});

test("on Vercel or CI, a missing Supabase URL or key fails with a clear error", () => {
  assert.throws(() => assertSupabaseEnvForCi({ VERCEL: "1" }, none), /VITE_SUPABASE_URL .* and VITE_SUPABASE_ANON_KEY .* are not set on this Vercel build.*Set them/);
  assert.throws(() => assertSupabaseEnvForCi({ VERCEL: "0", CI: "1" }, none), /on this CI build/);
  assert.throws(() => assertSupabaseEnvForCi({ CI: "true" }, { ...creds, key: "" }), /VITE_SUPABASE_ANON_KEY .* is not set on this CI build.*Set it /);
  assert.throws(() => assertSupabaseEnvForCi({ CI: "true" }, { ...creds, url: undefined }), /VITE_SUPABASE_URL .* is not set on this CI build/);
});

test("on Vercel or CI with both set, nothing is thrown", () => {
  assert.doesNotThrow(() => assertSupabaseEnvForCi({ VERCEL: "1", CI: "1" }, creds));
});

test("locally (no VERCEL/CI), missing env is allowed so the empty map file is written", () => {
  assert.doesNotThrow(() => assertSupabaseEnvForCi({}, none));
  assert.doesNotThrow(() => assertSupabaseEnvForCi({ CI: "false" }, none));
});
