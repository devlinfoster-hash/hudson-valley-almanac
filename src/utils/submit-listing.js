// Submit a Listing: field cleanup, basic spam checks, and the pending-row
// insert. Plain ESM (only src/catalog.js) so it runs under `node --test` with
// a mock Supabase client.
import { slugify } from "../catalog.js";

// Per-field client-side length caps. Values are trimmed, then cut to these.
export const FIELD_MAX_LENGTHS = {
  name: 200,
  category: 50,
  town: 100,
  county: 100,
  description: 2000,
  tags: 500,
  phone: 40,
  hours: 300,
  address: 300,
  website: 500,
  established: 10,
  submitter_name: 200,
  submitter_email: 320,
};

// Submissions sent sooner than this after the form rendered are ignored.
export const MIN_FILL_MS = 3000;

export function cleanSubmission(form) {
  const clean = {};
  for (const [key, max] of Object.entries(FIELD_MAX_LENGTHS)) {
    clean[key] = String(form[key] ?? "").trim().slice(0, max);
  }
  return clean;
}

// True for an absolute http:// or https:// URL with a dotted host.
export function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

// The pending listings row, with the same fields the form has always sent.
export function buildListingRow(clean, now = Date.now()) {
  return {
    ...clean,
    slug: `${slugify(clean.name)}-${now.toString(36)}`,
    tags: clean.tags.split(",").map((t) => t.trim()).filter(Boolean),
    established: parseInt(clean.established) || null,
    submitter_name: clean.submitter_name || null,
    submitter_email: clean.submitter_email || null,
    status: "pending",
    featured: false,
  };
}

// Decide what a submit click does, then do it. Returns one of:
//   { result: "invalid", message }  show the message, keep the form open
//   { result: "ignored" }           sent too fast after render; do nothing
//   { result: "submitted" }         inserted (or a honeypot hit, which only
//                                   pretends to succeed and inserts nothing)
// Throws if the insert fails.
export async function submitListing(supabase, form, { honeypot = "", renderedAt = 0, now = Date.now() } = {}) {
  if (String(honeypot).trim()) return { result: "submitted" };
  const clean = cleanSubmission(form);
  if (!clean.name || !clean.category || !clean.town) {
    return { result: "invalid", message: "Please fill in name, category, and town." };
  }
  if (clean.website && !isHttpUrl(clean.website)) {
    return { result: "invalid", message: "Please enter a website starting with http:// or https://." };
  }
  if (now - renderedAt < MIN_FILL_MS) return { result: "ignored" };
  const { error } = await supabase.from("listings").insert([buildListingRow(clean, now)]);
  if (error) throw error;
  return { result: "submitted" };
}
