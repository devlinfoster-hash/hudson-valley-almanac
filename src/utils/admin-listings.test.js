// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_LISTING_COLUMNS, EDITABLE_FIELDS, PRIVATE_COLUMNS, canDeletePermanently, fetchAdminListings,
  setListingStatus, reopenListing, REOPENABLE_STATUSES, deleteListingPermanently, editFormFor, buildListingEdits, saveListingEdits,
} from "./admin-listings.js";

const READABLE = ["id", "slug", "name", "description", "category", "county", "town", "established", "tags", "address", "phone", "website", "hours", "featured", "verified_at", "status", "created_at", "accepts_garden_produce"];

// A chainable mock of supabase.from(...). Every call is logged; awaiting the
// chain resolves to the queued result (or { data: [{id}], error: null }).
function mockSupabase(results = []) {
  const calls = [];
  const client = {
    calls,
    from(table) {
      const q = { table, ops: [] };
      calls.push(q);
      const chain = new Proxy({}, {
        get(_, op) {
          if (op === "then") {
            const r = results.length ? results.shift() : { data: [{ id: 1 }], error: null };
            return (res, rej) => Promise.resolve(r).then(res, rej);
          }
          return (...args) => { q.ops.push([op, ...args]); return chain; };
        },
      });
      return chain;
    },
  };
  return client;
}

const op = (q, name) => q.ops.filter(([o]) => o === name).map(([, ...a]) => a);
const PUBLISHED = { id: 7, name: "Hilltop Farm Stand", status: "published", category: "markets", town: "Ghent", county: "Columbia", description: "Eggs.", tags: ["Eggs"], address: null, phone: "(518) 555-0100", website: "https://hilltop.example.com", hours: null };
const PENDING = { ...PUBLISHED, id: 8, status: "pending" };

test("the admin column list is explicit, readable-only, and has no private columns", () => {
  const cols = ADMIN_LISTING_COLUMNS.split(",").map((c) => c.trim());
  assert.ok(!cols.includes("*"));
  assert.deepEqual(cols, READABLE);
  for (const c of PRIVATE_COLUMNS) assert.ok(!cols.includes(c), c);
  for (const f of EDITABLE_FIELDS) assert.ok(READABLE.includes(f), f);
});

test("fetch selects the explicit column list and pages past 1,000 rows", async () => {
  const page1 = Array.from({ length: 1000 }, (_, i) => ({ id: i, created_at: "2026-01-01" }));
  const db = mockSupabase([{ data: page1, error: null }, { data: [{ id: 1000, created_at: "2026-02-01" }], error: null }]);
  const rows = await fetchAdminListings(db);
  assert.equal(rows.length, 1001);
  assert.equal(rows[0].id, 1000); // newest first
  for (const q of db.calls) assert.deepEqual(op(q, "select"), [[ADMIN_LISTING_COLUMNS]]);
});

test("close and mark duplicate only set status on that id", async () => {
  for (const status of ["closed", "duplicate"]) {
    const db = mockSupabase();
    await setListingStatus(db, PUBLISHED, status);
    const [q] = db.calls;
    assert.equal(q.table, "listings");
    assert.deepEqual(op(q, "update"), [[{ status }]]);
    assert.deepEqual(op(q, "eq"), [["id", 7]]);
    assert.deepEqual(op(q, "delete"), []);
    assert.deepEqual(op(q, "select"), [["id"]]);
  }
});

test("a write that changes no row is reported as an error", async () => {
  const db = mockSupabase([{ data: [], error: null }]);
  await assert.rejects(setListingStatus(db, PUBLISHED, "closed"), /no listing was changed/);
  const db2 = mockSupabase([{ data: null, error: new Error("permission denied") }]);
  await assert.rejects(setListingStatus(db2, PUBLISHED, "closed"), /permission denied/);
});

test("permanent delete is refused for published listings and guarded in the query", async () => {
  assert.equal(canDeletePermanently(PUBLISHED), false);
  assert.equal(canDeletePermanently(PENDING), true);
  const db = mockSupabase();
  await assert.rejects(deleteListingPermanently(db, PUBLISHED), /Close the listing instead/);
  assert.equal(db.calls.length, 0);
  await deleteListingPermanently(db, PENDING);
  const [q] = db.calls;
  assert.equal(op(q, "delete").length, 1);
  assert.deepEqual(op(q, "eq"), [["id", 8]]);
  assert.deepEqual(op(q, "neq"), [["status", "published"]]);
});

test("edits send only changed editable fields", async () => {
  const form = editFormFor({ ...PUBLISHED, email: "secret@example.com", review_note: "x" });
  assert.deepEqual(Object.keys(form), EDITABLE_FIELDS);
  assert.equal(form.tags, "Eggs");
  assert.deepEqual(buildListingEdits(PUBLISHED, form), {});

  const db = mockSupabase();
  const edits = await saveListingEdits(db, PUBLISHED, { ...form, name: " Hilltop Farm ", hours: "Daily 9-5", tags: "Eggs, Corn", phone: "  ", email: "x@example.com", status: "published", submitter_email: "y@example.com" });
  assert.deepEqual(edits, { name: "Hilltop Farm", hours: "Daily 9-5", tags: ["Eggs", "Corn"], phone: null });
  const [q] = db.calls;
  assert.deepEqual(op(q, "update"), [[edits]]);
  assert.deepEqual(op(q, "eq"), [["id", 7]]);
  for (const key of Object.keys(op(q, "update")[0][0])) assert.ok(EDITABLE_FIELDS.includes(key), key);
});

test("no change means no request; bad edits are rejected before any request", async () => {
  const db = mockSupabase();
  assert.deepEqual(await saveListingEdits(db, PUBLISHED, editFormFor(PUBLISHED)), {});
  await assert.rejects(saveListingEdits(db, PUBLISHED, { ...editFormFor(PUBLISHED), name: " " }), /Name can't be empty/);
  await assert.rejects(saveListingEdits(db, PUBLISHED, { ...editFormFor(PUBLISHED), website: "hilltop.com" }), /http/);
  assert.equal(db.calls.length, 0);
});

test("reopen sends status='published' for that id only and selects back only id", async () => {
  assert.deepEqual(REOPENABLE_STATUSES, ["closed", "duplicate"]);
  for (const status of REOPENABLE_STATUSES) {
    const db = mockSupabase();
    await reopenListing(db, { ...PUBLISHED, id: 9, status });
    assert.equal(db.calls.length, 1);
    const [q] = db.calls;
    assert.equal(q.table, "listings");
    assert.deepEqual(op(q, "update"), [[{ status: "published" }]]);
    assert.deepEqual(op(q, "eq"), [["id", 9]]);
    assert.deepEqual(op(q, "select"), [["id"]]);
    assert.deepEqual(op(q, "delete"), []);
  }
});

test("reopen surfaces an error when no row changed or the update fails", async () => {
  const closed = { ...PUBLISHED, id: 9, status: "closed" };
  await assert.rejects(reopenListing(mockSupabase([{ data: [], error: null }]), closed), /no listing was changed/);
  await assert.rejects(reopenListing(mockSupabase([{ data: null, error: null }]), closed), /no listing was changed/);
  await assert.rejects(reopenListing(mockSupabase([{ data: null, error: new Error("permission denied") }]), closed), /permission denied/);
});
