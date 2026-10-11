import { test } from "node:test";
import assert from "node:assert/strict";
import { FALL_HARVEST_SECTIONS, matchesSection, buildFallHarvestSections, sortSeasonEndedLast } from "./fall-harvest.js";

const section = (id) => FALL_HARVEST_SECTIONS.find((s) => s.id === id);
const listing = (over) => ({ id: 1, slug: "a", name: "A Farm", category: "food", tags: [], description: "", ...over });

test("matches tags and names, not descriptions", () => {
  assert.equal(matchesSection(listing({ tags: ["Apples"] }), section("apples-orchards")), true);
  assert.equal(matchesSection(listing({ name: "Hilltop Orchard" }), section("apples-orchards")), true);
  assert.equal(matchesSection(listing({ description: "We sell apple butter." }), section("apples-orchards")), false);
});

test("Hayrides also matches descriptions", () => {
  assert.equal(matchesSection(listing({ description: "Wagon rides to the pumpkin field." }), section("hayrides-family-fun")), true);
  assert.equal(matchesSection(listing({ description: "A petting zoo for kids." }), section("hayrides-family-fun")), true);
  assert.equal(matchesSection(listing({ tags: ["Hay"] }), section("hayrides-family-fun")), false);
});

test("pick-your-own spellings", () => {
  for (const t of ["U-Pick", "Pick Your Own", "Pick-Your-Own", "you-pick", "upick"]) {
    assert.equal(matchesSection(listing({ tags: [t] }), section("pick-your-own")), true, t);
  }
  assert.equal(matchesSection(listing({ tags: ["Pickles"] }), section("pick-your-own")), false);
});

test("cannabis is excluded everywhere", () => {
  for (const s of FALL_HARVEST_SECTIONS) {
    assert.equal(matchesSection(listing({ category: "cannabis", tags: ["U-Pick", "Apples", "Pumpkins", "Cider", "Hayrides", "Harvest Festival"] }), s), false, s.id);
  }
});

test("craft beverages only in Pick Your Own", () => {
  const cidery = listing({ category: "craftbeverages", tags: ["U-Pick", "Apples", "Cider"] });
  assert.equal(matchesSection(cidery, section("pick-your-own")), true);
  assert.equal(matchesSection(cidery, section("apples-orchards")), false);
  assert.equal(matchesSection(cidery, section("cider-donuts-treats")), false);
});

test("festivals: fall and harvest only", () => {
  assert.equal(matchesSection(listing({ tags: ["Harvest Festival"] }), section("harvest-festivals")), true);
  assert.equal(matchesSection(listing({ tags: ["Fall Festival"] }), section("harvest-festivals")), true);
  assert.equal(matchesSection(listing({ tags: ["Fiber Festival"] }), section("harvest-festivals")), false);
  assert.equal(matchesSection(listing({ tags: ["Craft Beer Festival"] }), section("harvest-festivals")), false);
});

test("dedupes within a section, allows repeats across sections, sorts by name", () => {
  const rows = [
    listing({ id: 2, slug: "b", name: "Bramble Orchard", tags: ["Apples", "Orchard", "Pumpkins"] }),
    listing({ id: 1, slug: "a", name: "Apple Knoll", tags: ["Apples"] }),
    listing({ id: 2, slug: "b", name: "Bramble Orchard", tags: ["Apples"] }),
  ];
  const out = Object.fromEntries(buildFallHarvestSections(rows).map((s) => [s.id, s.items.map((i) => i.name)]));
  assert.deepEqual(out["apples-orchards"], ["Apple Knoll", "Bramble Orchard"]);
  assert.deepEqual(out["pumpkins-corn-mazes"], ["Bramble Orchard"]);
});

test("stops carry no description or photos", () => {
  const [pyo] = buildFallHarvestSections([listing({ tags: ["U-Pick"], description: "x", photo_url: "y.jpg" })]);
  assert.deepEqual(Object.keys(pyo.items[0]).sort(), ["county", "hours", "id", "name", "season_end", "slug", "town"]);
});

test("season-ended listings sort last, keeping order", () => {
  const items = [{ name: "A", season_end: "2026-09-01" }, { name: "B", season_end: null }, { name: "C", season_end: "2026-12-01" }, { name: "D", season_end: "2026-10-01" }];
  assert.deepEqual(sortSeasonEndedLast(items, "2026-10-11").map((i) => i.name), ["B", "C", "A", "D"]);
  assert.deepEqual(sortSeasonEndedLast(items, null).map((i) => i.name), ["A", "B", "C", "D"]);
});
