// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEmail, suggestEmailFix } from "./email.js";

test("valid address is trimmed and lowercased", () => {
  assert.deepEqual(validateEmail("Test@Example.COM "), { valid: true, email: "test@example.com" });
});

for (const bad of ["a b@c.com", "a@b", "a@b.c", "@x.com", "x@@y.com", "name@hmail. om",
  "thejewelryappraiserinc@hmail. om", "name@domain", "name@domain.c", "a@.com", "a@b..com", ""]) {
  test(`rejects ${JSON.stringify(bad)}`, () => {
    assert.equal(validateEmail(bad).valid, false);
  });
}

test("suggests a common domain for one-typo near misses", () => {
  assert.equal(suggestEmailFix("name@gmial.com"), "name@gmail.com");
  assert.equal(suggestEmailFix("Name@HMAIL.com"), "name@gmail.com");
  assert.equal(suggestEmailFix("name@yaho.com"), "name@yahoo.com");
  assert.equal(suggestEmailFix("name@outlok.com"), "name@outlook.com");
});

test("no suggestion for correct, unrelated, or invalid addresses", () => {
  assert.equal(suggestEmailFix("name@gmail.com"), null);
  assert.equal(suggestEmailFix("name@hudsonvalleyalmanac.com"), null);
  assert.equal(suggestEmailFix("name@hmail. om"), null);
});
