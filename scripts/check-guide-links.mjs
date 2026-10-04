// Guide link check (build step 2, after scripts/snapshot.mjs).
//
// The guides hard-code links to listing pages: the Farm Trails / Beverage
// Trails / Explore by Theme bodies (<L to="slug"> in
// src/data/farm-trails-bodies.jsx) and the Freezer Full farm list (url fields
// pointing at /listing/<slug> in src/data/freezer-full.js). A listing that is
// unpublished, closed, or renamed in the database leaves those links pointing
// at "Listing not found".
//
// This script checks every hard-coded slug against the published listings in
// src/data/listings.json and the slug redirects in redirects/listing-slugs.json,
// prints a report, and writes src/data/guide-links.json, which the guides read
// at render time:
//   - a slug with a redirect to a published listing links to the new slug;
//   - a slug with no published listing renders as plain text (no link).
// The guide source files are never edited, so a stop links again as soon as
// its listing is published (or a redirect is added) and the site rebuilds.
//
// It also warns when vercel.json is out of sync with the redirects file (run
// `npm run redirects`), or when a redirect points at a listing that isn't
// published.
//
// Every finding is a warning: this script never fails the build. With no
// snapshot (no Supabase env, or the listings fetch failed) it skips the check
// and unlinks nothing.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadListingRedirects, readVercelConfig, redirectsInSync } from "./sync-listing-redirects.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = resolve(ROOT, "src", "data");
const SNAPSHOT_PATH = resolve(DATA, "listings.json");
const BODIES_PATH = resolve(DATA, "farm-trails-bodies.jsx");
const OUT_PATH = resolve(DATA, "guide-links.json");

const ENTITIES = { "&amp;": "&", "&apos;": "'", "&quot;": '"', "&#39;": "'", "&lt;": "<", "&gt;": ">", "&nbsp;": " " };
const plain = (s) => s.replace(/&[a-z#0-9]+;/g, (e) => ENTITIES[e] ?? e).replace(/\s+/g, " ").trim();

// Every <L to="slug">Name</L> in the trail guide bodies, with its guide.
async function trailGuideLinks() {
  const { FARM_TRAILS } = await import("../src/data/farm-trails-index.js");
  const titles = new Map(FARM_TRAILS.map((g) => [g.slug, g]));
  const src = await readFile(BODIES_PATH, "utf8");
  const starts = [...src.matchAll(/^ {2}"([a-z0-9-]+)": \(\) => \(/gm)].map((m) => ({ slug: m[1], at: m.index }));
  const guideAt = (i) => {
    let g = null;
    for (const s of starts) if (s.at <= i) g = s.slug;
    return g;
  };
  const links = [];
  for (const m of src.matchAll(/<L to="([^"]+)">([\s\S]*?)<\/L>/g)) {
    const gSlug = guideAt(m.index);
    const g = titles.get(gSlug);
    links.push({
      guide: g ? g.title : gSlug,
      guidePath: `/farm-trails/${gSlug}`,
      guidePublished: !!g?.published,
      stop: plain(m[2]),
      slug: m[1],
      line: src.slice(0, m.index).split("\n").length,
    });
  }
  return links;
}

// Every Freezer Full entry whose url is one of our /listing/<slug> pages.
async function freezerFullLinks() {
  const ff = await import("../src/data/freezer-full.js");
  const lists = [
    ["Freezer Full: book farms", ff.FREEZER_FULL_FARMS],
    ["Freezer Full: more farms", ff.FREEZER_FULL_MORE],
    ["Freezer Full: processors", ff.FREEZER_FULL_PROCESSORS],
  ];
  const links = [];
  for (const [guide, list] of lists) {
    for (const f of list || []) {
      const m = String(f.url || "").match(/^https:\/\/www\.hudsonvalleyalmanac\.com\/listing\/([^/?#]+)$/);
      if (m) links.push({ guide, guidePath: "/freezer-full", guidePublished: true, stop: f.name, slug: m[1] });
    }
  }
  return links;
}

async function loadPublishedSlugs() {
  try {
    const parsed = JSON.parse(await readFile(SNAPSHOT_PATH, "utf8"));
    const listings = Array.isArray(parsed?.listings) ? parsed.listings : [];
    return new Set(listings.map((l) => l.slug).filter(Boolean));
  } catch {
    return new Set();
  }
}

async function writeOut(unlinked, rewrite) {
  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify({ unlinked: [...unlinked].sort(), rewrite: Object.fromEntries([...rewrite].sort()) }), "utf8");
}

async function main() {
  const warn = (msg) => console.warn(`[guide-links] WARNING: ${msg}`);

  const { map: redirects, errors: redirectErrors } = await loadListingRedirects();
  for (const e of redirectErrors) warn(e);
  try {
    if (!redirectErrors.length && !redirectsInSync(await readVercelConfig(), redirects)) {
      warn("vercel.json does not match redirects/listing-slugs.json. Run `npm run redirects` and commit vercel.json.");
    }
  } catch (err) {
    warn(`Could not compare vercel.json with the redirects file (${err.message}).`);
  }

  const published = await loadPublishedSlugs();
  if (published.size === 0) {
    warn("No published listings in the snapshot; skipping the guide link check and leaving every guide link as is.");
    await writeOut([], []);
    return;
  }

  for (const [from, to] of redirects) {
    if (!published.has(to)) warn(`Redirect ${from} -> ${to}: "${to}" is not a published listing.`);
    if (published.has(from)) warn(`Redirect ${from} -> ${to}: "${from}" is still a published listing, so the redirect hides a live page.`);
  }

  const links = [...(await trailGuideLinks()), ...(await freezerFullLinks())];
  const unlinked = new Set();
  const rewrite = new Map();
  const failures = [];
  for (const link of links) {
    if (published.has(link.slug)) continue;
    const to = redirects.get(link.slug);
    if (to && published.has(to)) {
      rewrite.set(link.slug, to);
      continue;
    }
    unlinked.add(link.slug);
    failures.push({
      ...link,
      why: to
        ? `redirects to "${to}", which is not a published listing`
        : "no published listing with this slug (draft, closed, duplicate, pending, renamed, or deleted)",
    });
  }
  await writeOut(unlinked, rewrite);

  const uniqueSlugs = new Set(links.map((l) => l.slug));
  console.log(
    `[guide-links] Checked ${links.length} guide links (${uniqueSlugs.size} unique slugs) against ${published.size} published listings: ` +
    `${failures.length} link${failures.length === 1 ? "" : "s"} to ${unlinked.size} slug${unlinked.size === 1 ? "" : "s"} shown as plain text, ` +
    `${rewrite.size} slug${rewrite.size === 1 ? "" : "s"} relinked through redirects.`
  );
  if (failures.length) {
    warn(`${failures.length} guide link${failures.length === 1 ? " has" : "s have"} no published listing and will render as plain text (name only):`);
    console.warn("  guide | stop | slug | why");
    for (const f of failures) {
      const where = f.line ? `${f.guidePath} (farm-trails-bodies.jsx:${f.line})` : f.guidePath;
      console.warn(`  ${f.guide}${f.guidePublished ? "" : " [unpublished guide]"} [${where}] | ${f.stop} | ${f.slug} | ${f.why}`);
    }
  }
}

main().catch(async (err) => {
  // Never fail the build over this check; unlink nothing if it couldn't run.
  console.warn(`[guide-links] WARNING: check failed (${err.message}); leaving every guide link as is.`);
  try { await writeOut([], []); } catch { /* the build will report a missing file */ }
});
