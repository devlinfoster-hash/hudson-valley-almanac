// Weekly listings health report (read-only; never writes to the database).
//
// 1. Link check: requests every published listing's website (HEAD, falling back
//    to GET) and reports dead sites (4xx/5xx, DNS failure, timeout, other
//    connection errors) and sites that redirect to a different domain.
// 2. Freshness: published listings whose season_end is before today, or whose
//    last_verified is null or more than 12 months old.
//
// Writes a markdown report (default listings-report.md, or --out <path>) and
// prints a summary. Reads the public anon key from the same env vars as
// scripts/snapshot.mjs. Exits 1 only if the listings can't be fetched.
//
//   VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... node scripts/check-listings.mjs

import { createClient } from "@supabase/supabase-js";
import { appendFile, writeFile } from "node:fs/promises";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const outIdx = process.argv.indexOf("--out");
const OUT_PATH = outIdx > -1 ? process.argv[outIdx + 1] : "listings-report.md";

const SITE = "https://www.hudsonvalleyalmanac.com";
const TIMEOUT_MS = 10_000;
const CONCURRENCY = 5;
const USER_AGENT = `HudsonValleyAlmanacLinkCheck/1.0 (+${SITE}; hello@hudsonvalleyalmanac.com)`;

async function fetchListings() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("listings")
      .select("id, slug, name, category, county, website, season_end, last_verified")
      .eq("status", "published")
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    all.push(...data);
    if (data.length < 1000) break;
  }
  return all;
}

// --- Link check -------------------------------------------------------------

// Same rule the listing page uses for its link.
const toUrl = (w) => (w.startsWith("http") ? w : "https://" + w);
const baseHost = (u) => new URL(u).hostname.toLowerCase().replace(/^www\./, "");

async function request(url, method) {
  const res = await fetch(url, {
    method,
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*" },
  });
  res.body?.cancel().catch(() => {});
  return res;
}

function describeError(err) {
  if (err.name === "TimeoutError" || err.name === "AbortError") return "timeout";
  const code = err.cause?.code || err.code;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "DNS failure";
  return code ? `connection error (${code})` : `error (${err.message})`;
}

// Returns null when the site is fine, else { kind: "dead" | "redirect", detail }.
async function checkSite(website) {
  let url;
  try {
    url = toUrl(website.trim());
    new URL(url);
  } catch {
    return { kind: "dead", detail: "invalid URL" };
  }
  let res;
  try {
    res = await request(url, "HEAD");
    if (res.status >= 400) res = await request(url, "GET");
  } catch (err) {
    // A GET won't fix a timeout or a missing host; other errors may be HEAD-only.
    const detail = describeError(err);
    if (detail === "timeout" || detail === "DNS failure") return { kind: "dead", detail };
    try {
      res = await request(url, "GET");
    } catch (err) {
      return { kind: "dead", detail: describeError(err) };
    }
  }
  if (res.status >= 400) return { kind: "dead", detail: `HTTP ${res.status}` };
  if (res.url && baseHost(res.url) !== baseHost(url)) return { kind: "redirect", detail: res.url };
  return null;
}

async function linkCheck(listings) {
  const queue = listings.filter((l) => l.website && l.website.trim());
  const results = [];
  let next = 0;
  async function worker() {
    while (next < queue.length) {
      const l = queue[next++];
      const problem = await checkSite(l.website);
      if (problem) results.push({ ...l, ...problem });
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { checked: queue.length, results };
}

// --- Freshness --------------------------------------------------------------

function todayInNewYork() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

function freshness(listings, today) {
  const yearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  const out = [];
  for (const l of listings) {
    const issues = [];
    if (l.season_end && l.season_end < today) issues.push(`season ended ${l.season_end}`);
    if (!l.last_verified) issues.push("never verified");
    else if (l.last_verified < yearAgo) issues.push(`last verified ${l.last_verified}`);
    if (issues.length) out.push({ ...l, detail: issues.join("; ") });
  }
  return out;
}

// --- Report -----------------------------------------------------------------

const byCategoryCounty = (a, b) =>
  (a.category || "").localeCompare(b.category || "") ||
  (a.county || "").localeCompare(b.county || "") ||
  (a.name || "").localeCompare(b.name || "");
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ");
const listingLink = (l) => `[${cell(l.name)}](${SITE}/listing/${l.slug})`;

function table(rows, header, row) {
  if (!rows.length) return "_None._\n";
  return [`| ${header.join(" | ")} |`, `|${header.map(() => " --- ").join("|")}|`, ...rows.map((r) => `| ${row(r).join(" | ")} |`)].join("\n") + "\n";
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
    process.exit(1);
  }
  const today = todayInNewYork();
  let listings;
  try {
    listings = await fetchListings();
  } catch (err) {
    console.error(`Failed to fetch listings: ${err.message}`);
    process.exit(1);
  }
  console.log(`${listings.length} published listings. Checking websites...`);

  const { checked, results } = await linkCheck(listings);
  const dead = results.filter((r) => r.kind === "dead").sort(byCategoryCounty);
  const moved = results.filter((r) => r.kind === "redirect").sort(byCategoryCounty);
  const stale = freshness(listings, today).sort(byCategoryCounty);
  const ended = stale.filter((l) => l.season_end && l.season_end < today).length;
  const neverVerified = listings.filter((l) => !l.last_verified).length;

  const summary = [
    `## Listings health report (${today})`,
    "",
    `- Published listings: ${listings.length}`,
    `- Websites checked: ${checked}`,
    `- Dead websites: ${dead.length}`,
    `- Redirecting to another domain: ${moved.length}`,
    `- Needing a freshness review: ${stale.length} (season ended: ${ended}; never verified: ${neverVerified})`,
    "",
  ].join("\n");

  const report = [
    summary,
    `### Dead websites (${dead.length})`,
    "",
    table(dead, ["Category", "County", "Listing", "Website", "Problem"], (l) => [cell(l.category), cell(l.county), listingLink(l), cell(l.website), cell(l.detail)]),
    `### Redirects to a different domain (${moved.length})`,
    "",
    table(moved, ["Category", "County", "Listing", "Website", "Ends up at"], (l) => [cell(l.category), cell(l.county), listingLink(l), cell(l.website), cell(l.detail)]),
    `### Freshness (${stale.length})`,
    "",
    "Season ended before today, or last_verified missing or more than 12 months old.",
    "",
    table(stale, ["Category", "County", "Listing", "Issue"], (l) => [cell(l.category), cell(l.county), listingLink(l), cell(l.detail)]),
  ].join("\n");

  await writeFile(OUT_PATH, report, "utf8");
  console.log(`\n${summary}\nWrote ${OUT_PATH}`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
}

main();
