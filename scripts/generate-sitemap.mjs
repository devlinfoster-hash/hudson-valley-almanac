// Generates dist/sitemap.xml after `vite build`.
//
// robots.txt points crawlers at https://www.hudsonvalleyalmanac.com/sitemap.xml,
// so this enumerates the homepage plus every published listing URL. It reads
// the same VITE_SUPABASE_* env vars the app uses (available at build time on
// Vercel). If they're missing (e.g. a local build with no env), it falls back
// to a homepage-only sitemap and warns instead of failing the build.
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SITE_ORIGIN = "https://www.hudsonvalleyalmanac.com";
const OUT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist", "sitemap.xml");

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

function xmlEscape(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]
  ));
}

function urlEntry(loc, lastmod) {
  return (
    "  <url>\n" +
    `    <loc>${xmlEscape(loc)}</loc>\n` +
    (lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : "") +
    "  </url>"
  );
}

async function fetchPublishedListings() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  // Supabase caps a single response at 1000 rows, so page through.
  const pageSize = 1000;
  const all = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("listings")
      .select("slug, created_at")
      .eq("status", "published")
      .not("slug", "is", null)
      .order("slug", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all;
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  // Static routes not generated from the listings table (see src/App.jsx Routes).
  const STATIC_ROUTES = ["/", "/fire-towers"];
  const entries = STATIC_ROUTES.map((path) => urlEntry(`${SITE_ORIGIN}${path}`, today));

  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const listings = await fetchPublishedListings();
      for (const { slug, created_at } of listings) {
        if (!slug) continue;
        const lastmod = created_at ? new Date(created_at).toISOString().slice(0, 10) : undefined;
        entries.push(urlEntry(`${SITE_ORIGIN}/listing/${encodeURIComponent(slug)}`, lastmod));
      }
      console.log(`[sitemap] ${listings.length} published listings included.`);
    } catch (err) {
      console.warn(`[sitemap] Failed to load listings (${err.message}); writing homepage-only sitemap.`);
    }
  } else {
    console.warn("[sitemap] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set; writing homepage-only sitemap.");
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries.join("\n") +
    "\n</urlset>\n";

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, xml, "utf8");
  console.log(`[sitemap] Wrote ${OUT_PATH} (${entries.length} urls).`);
}

main().catch((err) => {
  console.error("[sitemap] Unexpected error:", err);
  process.exit(1);
});
