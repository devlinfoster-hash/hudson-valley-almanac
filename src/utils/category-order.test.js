// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { categories, sortCategoriesByLabel } from "../catalog.js";

const EXPECTED = [
  "Agencies & Professional Services", "Animals & Livestock", "Artisan & Craft", "Building & Trades",
  "Buy, Sell & Trade", "Craft Beverages", "Craft Cannabis", "Equipment & Repair", "Farm Services",
  "Feed & Supply", "Fiber & Textile", "Food & Drink Makers", "Food & Preservation", "Health & Wellness",
  "Home & Hearth", "Land & Property Services", "Learn & Community", "Maple & Honey", "Markets & Events",
  "Mushroom & Forage", "Mutual Aid & Food Sharing", "Outdoor & Recreation", "Seeds & Plants",
  "Soap, Candles & Apothecary", "Water & Utilities",
];

test("categories sort A to Z by label in the expected order", () => {
  assert.deepEqual(sortCategoriesByLabel(categories).map((c) => c.label), EXPECTED);
});

test("sorting is case-insensitive and leaves the source list untouched", () => {
  const before = categories.map((c) => c.id);
  const mixed = [{ label: "beta" }, { label: "Alpha" }, { label: "alpha two" }, { label: "Beta Two" }];
  assert.deepEqual(sortCategoriesByLabel(mixed).map((c) => c.label), ["Alpha", "alpha two", "beta", "Beta Two"]);
  sortCategoriesByLabel(categories);
  assert.deepEqual(categories.map((c) => c.id), before);
});

test("a new category lands in place", () => {
  const withNew = [...categories, { id: "new", label: "Dairy & Eggs" }];
  const labels = sortCategoriesByLabel(withNew).map((c) => c.label);
  assert.equal(labels[labels.indexOf("Dairy & Eggs") - 1], "Craft Cannabis");
  assert.equal(labels[labels.indexOf("Dairy & Eggs") + 1], "Equipment & Repair");
});
