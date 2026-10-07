// Ships the prerendered "Page not found" page as dist/404.html, after the SSG
// build.
//
// Vercel serves dist/404.html, with HTTP 404, for every URL that has no file in
// the build output. Before this, vercel.json rewrote every unknown path to
// index.html, so a mistyped or dead URL returned the homepage with HTTP 200 and
// the homepage's canonical (a soft 404 / duplicate homepage to search engines).
//
// The page is the "404" route in src/App.jsx, prerendered like any other route
// to dist/404/index.html. It carries <meta name="robots" content="noindex"> and
// no canonical, and it boots the app, so a listing published since the last
// build still renders for visitors (ListingPage fetches it live) until the
// nightly rebuild gives it a page of its own.
//
// Fails the build if the page is missing: without it, unknown URLs would get
// Vercel's bare platform 404 instead.
import { readFile, writeFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const SOURCE = resolve(DIST, "404", "index.html");
const OUT = resolve(DIST, "404.html");

let html;
try {
  html = await readFile(SOURCE, "utf8");
} catch (err) {
  console.error(`[404] ERROR: ${SOURCE} is missing (${err.message}). Is the "404" route still in src/App.jsx?`);
  process.exit(1);
}
if (!/<meta[^>]*name="robots"[^>]*content="noindex"/.test(html)) {
  console.error("[404] ERROR: the prerendered 404 page has no robots noindex tag.");
  process.exit(1);
}
await writeFile(OUT, html, "utf8");
// Drop the /404 directory so /404 itself isn't a 200 page.
await rm(resolve(DIST, "404"), { recursive: true, force: true });
console.log(`[404] Wrote ${OUT}.`);
