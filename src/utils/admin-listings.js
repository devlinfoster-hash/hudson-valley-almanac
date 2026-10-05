// Data calls for the /admin dashboard. Plain ESM with the Supabase client
// passed in, so it runs under `node --test` with a mock.
//
// Column rule: the browser only ever names columns that anon/authenticated
// can read. Never select("*"), and never read or write the private columns
// (email, facebook_url, submitter_name, submitter_email, first_contacted_at,
// first_contacted_email, review_note).

export const ADMIN_LISTING_COLUMNS =
  "id, slug, name, description, category, county, town, established, tags, address, phone, website, hours, featured, verified_at, status, created_at, accepts_garden_produce";

// The fields the dashboard can edit. Updates send only these keys.
export const EDITABLE_FIELDS = ["name", "description", "category", "county", "town", "address", "phone", "website", "hours", "tags"];

export const PRIVATE_COLUMNS = ["email", "facebook_url", "submitter_name", "submitter_email", "first_contacted_at", "first_contacted_email", "review_note"];

// Statuses the dashboard has a tab for, in tab order.
export const ADMIN_STATUSES = ["pending", "published", "closed", "duplicate"];

// Permanent delete is only for listings that were never (or are no longer)
// public: published listings are closed instead.
export function canDeletePermanently(listing) {
  return !!listing && listing.status !== "published";
}

// Every listing, paged past PostgREST's 1,000-row cap, newest first.
export async function fetchAdminListings(supabase) {
  const pageSize = 1000;
  const all = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("listings")
      .select(ADMIN_LISTING_COLUMNS)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  all.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  return all;
}

// An update or delete that RLS filters out returns no error and no rows, so
// each write asks for the changed ids back and treats zero as a failure.
function expectRow(data, error, what) {
  if (error) throw error;
  if (!data || data.length === 0) throw new Error(`${what}: no listing was changed (it may have been removed, or this account lacks permission).`);
}

export async function setListingStatus(supabase, listing, status) {
  const { data, error } = await supabase.from("listings").update({ status }).eq("id", listing.id).select("id");
  expectRow(data, error, `Setting status to ${status} failed`);
}

// Puts a closed or duplicate listing back on the public site.
export const REOPENABLE_STATUSES = ["closed", "duplicate"];

export async function reopenListing(supabase, listing) {
  await setListingStatus(supabase, listing, "published");
}

// Confirmation dialog copy per admin action. A duplicate being reopened gets
// an extra warning line, since its original may already be published.
export const ADMIN_CONFIRM_COPY = {
  close: { title: "Close this listing?", body: "Sets the status to closed. It leaves the public site on the next build and can be reopened later.", button: "Close listing" },
  duplicate: { title: "Mark this listing as a duplicate?", body: "Sets the status to duplicate. It leaves the public site on the next build and can be restored later.", button: "Mark duplicate" },
  reopen: { title: "Reopen and publish this listing?", body: "Sets the status to published. It returns to the public site on the next build.", button: "Reopen (publish)" },
  delete: { title: "Delete this listing permanently?", body: "Removes the row from the database. This can't be undone.", button: "Delete permanently" },
};

export const REOPEN_DUPLICATE_WARNING =
  "This listing was marked as a duplicate. Check that its original isn't already published before reopening, or the directory will show it twice.";

// { title, body, button, warning } for the dialog; warning is null unless set.
export function confirmDialogCopy(action, listing) {
  const warning = action === "reopen" && listing?.status === "duplicate" ? REOPEN_DUPLICATE_WARNING : null;
  return { ...ADMIN_CONFIRM_COPY[action], warning };
}

export async function deleteListingPermanently(supabase, listing) {
  if (!canDeletePermanently(listing)) throw new Error("Published listings can't be deleted. Close the listing instead.");
  const { data, error } = await supabase
    .from("listings")
    .delete()
    .eq("id", listing.id)
    .neq("status", "published")
    .select("id");
  expectRow(data, error, "Delete failed");
}

// Form values for editing a listing (tags as a comma-separated string).
export function editFormFor(listing) {
  const form = {};
  for (const key of EDITABLE_FIELDS) {
    const value = listing[key];
    form[key] = key === "tags" ? (Array.isArray(value) ? value.join(", ") : "") : value ?? "";
  }
  return form;
}

function normalizeField(key, value) {
  if (key === "tags") return String(value ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
}

function sameValue(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

// The update payload: only editable fields whose value actually changed.
export function buildListingEdits(listing, form) {
  const edits = {};
  for (const key of EDITABLE_FIELDS) {
    if (!(key in form)) continue;
    const next = normalizeField(key, form[key]);
    const current = key === "tags" ? (Array.isArray(listing.tags) ? listing.tags : []) : listing[key] ?? null;
    if (!sameValue(next, current)) edits[key] = next;
  }
  return edits;
}

export function validateListingEdits(edits) {
  if ("name" in edits && !edits.name) return "Name can't be empty.";
  if ("category" in edits && !edits.category) return "Category can't be empty.";
  if (edits.website && !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(edits.website)) return "Website must start with http:// or https://.";
  return null;
}

// Returns the changed fields ({} when nothing changed). Throws on a
// validation or database error.
export async function saveListingEdits(supabase, listing, form) {
  const edits = buildListingEdits(listing, form);
  if (Object.keys(edits).length === 0) return edits;
  const problem = validateListingEdits(edits);
  if (problem) throw new Error(problem);
  const { data, error } = await supabase.from("listings").update(edits).eq("id", listing.id).select("id");
  expectRow(data, error, "Save failed");
  return edits;
}
