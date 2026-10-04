// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { submitListing, buildListingRow, cleanSubmission, isHttpUrl, FIELD_MAX_LENGTHS, MIN_FILL_MS } from "./submit-listing.js";

// Records every insert, like supabase.from(table).insert(rows).
function mockSupabase({ error = null } = {}) {
  const inserts = [];
  return {
    inserts,
    from(table) {
      return {
        insert(rows) {
          inserts.push({ table, rows });
          return Promise.resolve({ data: null, error });
        },
      };
    },
  };
}

const FORM = {
  name: "  Hilltop Farm Stand ",
  category: "markets",
  town: "Ghent",
  county: "Columbia",
  description: "Seasonal produce and eggs.",
  tags: "Eggs, Sweet Corn, ,Pumpkins",
  phone: "(518) 555-0100",
  hours: "Daily 9-5",
  address: "1 Main St, Ghent, NY 12075",
  website: "https://hilltop.example.com",
  established: "1987",
  submitter_name: " Pat ",
  submitter_email: "pat@example.com ",
};
const NOW = 1_800_000_000_000;
const SLOW = { renderedAt: NOW - 10_000, now: NOW };

// The row the form inserted before this change, for the same input (it trimmed
// only the submitter fields; everything is trimmed now).
function legacyRow(form, now) {
  const slug = `${form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}-${now.toString(36)}`;
  return { ...form, slug, tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean), established: parseInt(form.established) || null, submitter_name: form.submitter_name.trim() || null, submitter_email: form.submitter_email.trim() || null, status: "pending", featured: false };
}

test("a normal submission inserts exactly one pending row with the usual fields", async () => {
  const db = mockSupabase();
  const out = await submitListing(db, FORM, SLOW);
  assert.deepEqual(out, { result: "submitted" });
  assert.equal(db.inserts.length, 1);
  assert.equal(db.inserts[0].table, "listings");
  assert.equal(db.inserts[0].rows.length, 1);
  const row = db.inserts[0].rows[0];
  const legacy = legacyRow(FORM, NOW);
  assert.deepEqual(Object.keys(row).sort(), Object.keys(legacy).sort());
  assert.deepEqual(row, { ...legacy, name: "Hilltop Farm Stand" });
  assert.equal(row.status, "pending");
  assert.equal(row.featured, false);
  assert.equal(row.slug, `hilltop-farm-stand-${NOW.toString(36)}`);
  assert.deepEqual(row.tags, ["Eggs", "Sweet Corn", "Pumpkins"]);
  assert.equal(row.established, 1987);
  assert.equal(row.submitter_name, "Pat");
  assert.equal(row.submitter_email, "pat@example.com");
  assert.equal("listing_reference" in row || "honeypot" in row, false);
});

test("a filled honeypot pretends success and inserts nothing", async () => {
  const db = mockSupabase();
  const out = await submitListing(db, FORM, { ...SLOW, honeypot: "http://spam.example" });
  assert.deepEqual(out, { result: "submitted" });
  assert.equal(db.inserts.length, 0);
});

test("a submission under 3 seconds after render is ignored", async () => {
  const db = mockSupabase();
  const out = await submitListing(db, FORM, { renderedAt: NOW - (MIN_FILL_MS - 1), now: NOW });
  assert.deepEqual(out, { result: "ignored" });
  assert.equal(db.inserts.length, 0);
  const ok = await submitListing(db, FORM, { renderedAt: NOW - MIN_FILL_MS, now: NOW });
  assert.deepEqual(ok, { result: "submitted" });
  assert.equal(db.inserts.length, 1);
});

test("missing required fields keep the existing message and insert nothing", async () => {
  const db = mockSupabase();
  const out = await submitListing(db, { ...FORM, town: "   " }, SLOW);
  assert.deepEqual(out, { result: "invalid", message: "Please fill in name, category, and town." });
  assert.equal(db.inserts.length, 0);
});

test("a website must be an http(s) URL when given", async () => {
  for (const bad of ["hilltop.com", "javascript:alert(1)", "ftp://hilltop.com", "https://localhost", "http://"]) {
    const db = mockSupabase();
    const out = await submitListing(db, { ...FORM, website: bad }, SLOW);
    assert.equal(out.result, "invalid", bad);
    assert.equal(db.inserts.length, 0);
  }
  const db = mockSupabase();
  assert.deepEqual(await submitListing(db, { ...FORM, website: "  " }, SLOW), { result: "submitted" });
  assert.equal(db.inserts[0].rows[0].website, "");
  assert.equal(isHttpUrl("http://hilltop.example.com/path?q=1"), true);
});

test("every field is trimmed and length-limited", () => {
  const long = Object.fromEntries(Object.keys(FIELD_MAX_LENGTHS).map((k) => [k, `  ${"x".repeat(5000)}  `]));
  const clean = cleanSubmission(long);
  for (const [k, max] of Object.entries(FIELD_MAX_LENGTHS)) {
    assert.equal(clean[k].length, max, k);
    assert.equal(clean[k].trim(), clean[k], k);
  }
  assert.equal(buildListingRow(cleanSubmission(FORM), NOW).name, "Hilltop Farm Stand");
});

test("an insert error is thrown so the form shows its failure message", async () => {
  const db = mockSupabase({ error: new Error("boom") });
  await assert.rejects(submitListing(db, FORM, SLOW), /boom/);
});
