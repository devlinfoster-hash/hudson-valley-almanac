// Build-time data snapshot.
//
// Fetches every published listing ONCE (paginated past PostgREST's 1,000-row
// server-side cap) and writes src/data/listings.json. Both the SSG route
// generation (src/data/build-data.js, consumed via getStaticPaths/loader in
// src/App.jsx) and scripts/generate-sitemap.mjs read from this snapshot — so the
// build makes a single deterministic pass over the data and never touches
// Supabase again during render. That immunises the build against a mid-build DB
// hiccup (which has bitten this site before).
//
// Reads the same VITE_SUPABASE_* env vars the app uses (available at build time
// on Vercel). If they're missing (e.g. a local build with no env), it writes an
// empty snapshot and warns instead of failing the build.
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "data",
  "listings.json"
);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

// Only the columns the SSG pages and sitemap actually render. This is an
// explicit allowlist — NOT select('*') — so PII columns on the listings table
// (email, submitter_name, submitter_email, first_contacted_email, ...) are never
// written into the snapshot, which becomes publicly-served static files. Keeps
// the snapshot (and the loader data inlined into each prerendered page) lean too.
const COLUMNS =
  "id, slug, name, description, category, county, town, established, tags, address, phone, website, hours, featured, created_at";

async function fetchPublishedListings() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const pageSize = 1000;
  const all = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("listings")
      .select(COLUMNS)
      .eq("status", "published")
      .not("slug", "is", null)
      .order("name", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all;
}

async function main() {
  let listings = [];
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      listings = await fetchPublishedListings();
      console.log(`[snapshot] ${listings.length} published listings fetched.`);
    } catch (err) {
      console.warn(
        `[snapshot] Failed to load listings (${err.message}); writing empty snapshot.`
      );
      listings = [];
    }
  } else {
    console.warn(
      "[snapshot] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set; writing empty snapshot."
    );
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    listings,
  };

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(payload), "utf8");
  console.log(`[snapshot] Wrote ${OUT_PATH} (${listings.length} listings).`);
}

main().catch((err) => {
  console.error("[snapshot] Unexpected error:", err);
  process.exit(1);
});
