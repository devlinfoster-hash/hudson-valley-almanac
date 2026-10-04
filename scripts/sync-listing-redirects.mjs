// Listing slug redirects: redirects/listing-slugs.json -> vercel.json.
//
// When a listing's slug changes in the database, its old /listing/<old> URL
// stops working (pages are prerendered by slug, and guides, news posts, and
// search engines still point at the old one). Add {"from": "<old>", "to":
// "<new>"} to redirects/listing-slugs.json and run `npm run redirects`. This
// script rewrites the matching entries in vercel.json's "redirects" list as
// permanent (301) redirects from /listing/<from> to /listing/<to>, and leaves
// every other vercel.json setting (crons, host redirects, rewrites, headers)
// untouched. Commit both files.
//
// It runs by hand, not during the build: Vercel reads vercel.json when a
// deployment starts, before the build command runs, so redirects written
// during the build would not take effect. scripts/check-guide-links.mjs warns
// at build time if vercel.json is out of sync with the redirects file.
//
// Chains are collapsed (a->b plus b->c gives a->c and b->c) so a visitor never
// takes more than one hop. Duplicate or circular entries are errors.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REDIRECTS_PATH = resolve(ROOT, "redirects", "listing-slugs.json");
export const VERCEL_PATH = resolve(ROOT, "vercel.json");

// The shape slugify() in src/catalog.js produces.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MANAGED_SOURCE = /^\/listing\/[a-z0-9-]+$/;

// A vercel.json redirect this script owns: a literal /listing/<slug> source
// (no :param or wildcard) pointing at another /listing/<slug>. The legacy
// /listings/:slug rule doesn't match, so it is never touched.
export function isManagedRedirect(r) {
  return (
    r && typeof r.source === "string" && typeof r.destination === "string" &&
    MANAGED_SOURCE.test(r.source) && MANAGED_SOURCE.test(r.destination) && !r.has
  );
}

// Reads and validates the redirects file. Returns { map, errors }, where map is
// from-slug -> final to-slug with chains collapsed. A missing file is an empty
// list.
export async function loadListingRedirects() {
  let raw;
  try {
    raw = await readFile(REDIRECTS_PATH, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return { map: new Map(), errors: [] };
    throw err;
  }
  const errors = [];
  let list;
  try {
    list = JSON.parse(raw);
  } catch (err) {
    return { map: new Map(), errors: [`redirects/listing-slugs.json is not valid JSON: ${err.message}`] };
  }
  if (!Array.isArray(list)) {
    return { map: new Map(), errors: ["redirects/listing-slugs.json must be a JSON array of {\"from\", \"to\"} objects."] };
  }

  const direct = new Map();
  list.forEach((entry, i) => {
    const where = `entry ${i + 1}`;
    if (!entry || typeof entry !== "object") return errors.push(`${where}: not an object.`);
    const { from, to } = entry;
    if (typeof from !== "string" || !SLUG.test(from)) return errors.push(`${where}: "from" must be a listing slug (lowercase letters, digits, hyphens), got ${JSON.stringify(from)}.`);
    if (typeof to !== "string" || !SLUG.test(to)) return errors.push(`${where}: "to" must be a listing slug (lowercase letters, digits, hyphens), got ${JSON.stringify(to)}.`);
    if (from === to) return errors.push(`${where}: "from" and "to" are both "${from}".`);
    if (direct.has(from)) return errors.push(`${where}: "${from}" is redirected more than once.`);
    direct.set(from, to);
  });

  const map = new Map();
  for (const from of direct.keys()) {
    const seen = new Set([from]);
    let to = direct.get(from);
    while (direct.has(to)) {
      if (seen.has(to)) {
        errors.push(`Redirect loop involving "${from}".`);
        to = null;
        break;
      }
      seen.add(to);
      to = direct.get(to);
    }
    if (to) map.set(from, to);
  }
  return { map, errors };
}

// The vercel.json "redirects" list with the managed entries replaced by the
// ones built from `map`. Unmanaged entries keep their order; managed ones go
// after them, sorted by source so the output is stable.
export function buildRedirects(existing, map) {
  const kept = (existing || []).filter((r) => !isManagedRedirect(r));
  const managed = [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([from, to]) => ({ source: `/listing/${from}`, destination: `/listing/${to}`, statusCode: 301 }));
  return [...kept, ...managed];
}

export async function readVercelConfig() {
  return JSON.parse(await readFile(VERCEL_PATH, "utf8"));
}

// True when vercel.json already holds exactly the redirects `map` describes.
export function redirectsInSync(config, map) {
  return JSON.stringify(config.redirects || []) === JSON.stringify(buildRedirects(config.redirects, map));
}

async function main() {
  const { map, errors } = await loadListingRedirects();
  if (errors.length) {
    for (const e of errors) console.error(`[redirects] ${e}`);
    console.error("[redirects] Fix redirects/listing-slugs.json; vercel.json was not changed.");
    process.exit(1);
  }
  const config = await readVercelConfig();
  if (redirectsInSync(config, map)) {
    console.log(`[redirects] vercel.json is up to date (${map.size} listing redirect${map.size === 1 ? "" : "s"}).`);
    return;
  }
  config.redirects = buildRedirects(config.redirects, map);
  await writeFile(VERCEL_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
  console.log(`[redirects] Wrote ${map.size} listing redirect${map.size === 1 ? "" : "s"} to vercel.json. Commit it with redirects/listing-slugs.json.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((err) => {
    console.error("[redirects] Unexpected error:", err);
    process.exit(1);
  });
}
